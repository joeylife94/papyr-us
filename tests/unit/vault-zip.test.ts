import zlib from 'zlib';
import { describe, expect, it } from 'vitest';
import { crc32, createZip, readZip, ZipFormatError } from '../../server/services/zip';

// #113 P2-D2: the vault archive writer and the upload reader, read back with each other.

const LIMITS = { maxEntries: 10, maxTotalUncompressed: 1024 * 1024 };

/** Offsets of the end record and the first central directory header of `zip`. */
function layout(zip: Buffer) {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  return { end, directory: zip.readUInt32LE(end + 16) };
}

function refusal(run: () => unknown): ZipFormatError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ZipFormatError);
    return error as ZipFormatError;
  }
  throw new Error('expected a ZipFormatError');
}

describe('crc32', () => {
  it('matches the standard check value and zlib', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    const data = Buffer.from('Papyr.us 볼트 내보내기 🙂'.repeat(20));
    expect(crc32(data)).toBe(zlib.crc32(data));
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe('createZip / readZip round trip', () => {
  it('keeps UTF-8 names, content, sizes and order', () => {
    const long = '# 회의록\n\n- 항목 [[다른 문서]]\n'.repeat(200);
    const zip = createZip([
      { name: '회의록.md', data: long },
      { name: 'Projects 🙂/Plan (2).md', data: Buffer.from('plan') },
      { name: 'empty.md', data: '' },
    ]);
    const entries = readZip(zip, LIMITS);

    expect(entries.map((entry) => entry.name)).toEqual([
      '회의록.md',
      'Projects 🙂/Plan (2).md',
      'empty.md',
    ]);
    expect(entries[0].read().toString('utf8')).toBe(long);
    expect(entries[0].size).toBe(Buffer.byteLength(long));
    // Repetitive text is deflated, tiny files are stored.
    expect(entries[0].compressedSize).toBeLessThan(entries[0].size);
    expect(entries[1].compressedSize).toBe(4);
    expect(entries[1].read().toString()).toBe('plan');
    expect(entries[2].read().length).toBe(0);
    expect(entries.every((entry) => !entry.isDirectory)).toBe(true);
  });

  it('sets the UTF-8 flag and the CRC-32 in both headers', () => {
    const data = Buffer.from('내용');
    const zip = createZip([
      { name: '노트.md', data, modifiedAt: new Date('2026-05-04T10:20:30Z') },
    ]);
    const { directory } = layout(zip);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800);
    expect(zip.readUInt32LE(14)).toBe(crc32(data));
    expect(zip.readUInt16LE(directory + 8) & 0x0800).toBe(0x0800);
    expect(zip.readUInt32LE(directory + 16)).toBe(crc32(data));
    // DOS time 10:20:30, date 2026-05-04.
    expect(zip.readUInt16LE(10)).toBe((10 << 11) | (20 << 5) | 15);
    expect(zip.readUInt16LE(12)).toBe(((2026 - 1980) << 9) | (5 << 5) | 4);
  });

  it('writes a valid empty archive', () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22);
    expect(readZip(zip, LIMITS)).toEqual([]);
  });

  it('reads directory entries and names written without the UTF-8 flag', () => {
    const zip = createZip([
      { name: 'folder/', data: '' },
      { name: '한글.md', data: 'a' },
      { name: 'ab.md', data: 'b' },
    ]);
    const { directory } = layout(zip);
    // Clear the flag in the central directory, where names are read from, and make the last
    // name invalid as UTF-8 (0xE9 is "\u00e9" in Latin-1).
    let at = directory;
    for (let i = 0; i < 3; i += 1) {
      zip.writeUInt16LE(zip.readUInt16LE(at + 8) & ~0x0800, at + 8);
      if (i === 2) zip[at + 46] = 0xe9;
      at += 46 + zip.readUInt16LE(at + 28);
    }
    const entries = readZip(zip, LIMITS);
    expect(entries.map((entry) => [entry.name, entry.isDirectory])).toEqual([
      ['folder/', true],
      ['한글.md', false], // valid UTF-8 without the flag
      ['\u00e9b.md', false], // Latin-1 fallback
    ]);
  });
});

describe('readZip refusals', () => {
  const sample = () =>
    createZip([
      { name: 'a.md', data: 'hello hello hello hello hello' },
      { name: 'b.md', data: 'b' },
    ]);

  it('refuses data that is not a ZIP archive', () => {
    expect(refusal(() => readZip(Buffer.from('not a zip at all, sorry'), LIMITS)).code).toBe(
      'invalid'
    );
    expect(refusal(() => readZip(Buffer.alloc(4), LIMITS)).code).toBe('invalid');
  });

  it('refuses a truncated archive', () => {
    const zip = sample();
    expect(refusal(() => readZip(zip.subarray(0, zip.length - 30), LIMITS)).code).toBe('invalid');
  });

  it('caps the entry count before reading entries', () => {
    const zip = createZip(Array.from({ length: 11 }, (_, i) => ({ name: `${i}.md`, data: 'x' })));
    expect(refusal(() => readZip(zip, LIMITS)).code).toBe('too-many-entries');
  });

  it('caps the declared uncompressed total', () => {
    const zip = createZip([
      { name: 'a.md', data: Buffer.alloc(600 * 1024, 97) },
      { name: 'b.md', data: Buffer.alloc(600 * 1024, 98) },
    ]);
    expect(refusal(() => readZip(zip, LIMITS)).code).toBe('too-large');
    expect(readZip(zip, { ...LIMITS, maxTotalUncompressed: 2 * 1024 * 1024 })).toHaveLength(2);
  });

  it('refuses encrypted entries', () => {
    const zip = sample();
    const { directory } = layout(zip);
    zip.writeUInt16LE(zip.readUInt16LE(directory + 8) | 0x0001, directory + 8);
    expect(refusal(() => readZip(zip, LIMITS)).code).toBe('encrypted');
  });

  it('refuses ZIP64 archives', () => {
    const marked = sample();
    const { end } = layout(marked);
    marked.writeUInt32LE(0xffffffff, end + 16);
    expect(refusal(() => readZip(marked, LIMITS)).code).toBe('zip64');

    const sized = sample();
    sized.writeUInt32LE(0xffffffff, layout(sized).directory + 24);
    expect(refusal(() => readZip(sized, LIMITS)).code).toBe('zip64');
  });

  it('refuses symbolic links', () => {
    const zip = sample();
    const { directory } = layout(zip);
    zip.writeUInt32LE((0o120777 << 16) >>> 0, directory + 38);
    expect(refusal(() => readZip(zip, LIMITS)).code).toBe('symlink');
  });

  it('refuses unsupported compression methods', () => {
    const zip = sample();
    const { directory } = layout(zip);
    zip.writeUInt16LE(12, directory + 10); // bzip2
    expect(refusal(() => readZip(zip, LIMITS)).code).toBe('unsupported');
  });

  it('refuses entry data that fails its CRC-32', () => {
    const zip = createZip([{ name: 'a.md', data: 'abc' }]);
    zip[30 + 'a.md'.length] ^= 0xff; // first stored data byte
    const [entry] = readZip(zip, LIMITS);
    expect(refusal(() => entry.read()).code).toBe('invalid');
  });

  it('never inflates past the declared size (deflate bomb)', () => {
    const zip = createZip([{ name: 'bomb.md', data: Buffer.alloc(512 * 1024) }]);
    const { directory } = layout(zip);
    zip.writeUInt32LE(10, directory + 24); // claims 10 bytes uncompressed
    const [entry] = readZip(zip, LIMITS);
    expect(entry.size).toBe(10);
    expect(refusal(() => entry.read()).code).toBe('invalid');
  });

  it('refuses a local header that points outside the data area', () => {
    const zip = sample();
    const { directory } = layout(zip);
    zip.writeUInt32LE(directory + 4, directory + 42);
    const [entry] = readZip(zip, LIMITS);
    expect(refusal(() => entry.read()).code).toBe('invalid');
  });
});
