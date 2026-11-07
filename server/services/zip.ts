/**
 * Minimal ZIP archive writer and reader for the Markdown vault export and import (#113 P2-D2),
 * built on Node's `zlib` only.
 *
 * Writer: stored or deflated entries, UTF-8 names (general purpose flag bit 11), CRC-32, one
 * central directory and end record. No ZIP64, so an archive stays below 4 GiB and 65535 entries.
 *
 * Reader: archives come from uploads, so they are untrusted. The central directory is checked
 * before any data is inflated: entry count and the declared uncompressed total are capped,
 * encrypted, ZIP64, multi-disk and symbolic-link entries are refused, and only stored and
 * deflated entries are read. An entry is inflated on demand with its declared size as the output
 * limit, then its size and CRC-32 must match, so a lying header cannot inflate past the caps.
 */
import zlib from 'zlib';

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP64_END_LOCATOR_SIGNATURE = 0x07064b50;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const MAX_COMMENT_LENGTH = 0xffff;

const FLAG_ENCRYPTED = 0x0001;
const FLAG_STRONG_ENCRYPTION = 0x0040;
const FLAG_UTF8 = 0x0800;
const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;
const METHOD_AES = 99;
const VERSION_NEEDED = 20;
const HOST_UNIX = 3;
const HOST_DARWIN = 19;
const ZIP64_EXTRA_FIELD = 0x0001;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_SYMLINK = 0o120000;
const UNIX_REGULAR_FILE = 0o100644;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (IEEE 802.3, as ZIP uses it) of `data`. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date and time fields of `date` (UTC; ZIP stores no zone), clamped to the format's range. */
function dosDateTime(date: Date): { time: number; date: number } {
  const valid = Number.isFinite(date.getTime()) ? date : new Date(0);
  const year = valid.getUTCFullYear();
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 };
  if (year > 2107) return { time: (23 << 11) | (59 << 5) | 29, date: (127 << 9) | (12 << 5) | 31 };
  return {
    time: (valid.getUTCHours() << 11) | (valid.getUTCMinutes() << 5) | (valid.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((valid.getUTCMonth() + 1) << 5) | valid.getUTCDate(),
  };
}

export interface ZipInputEntry {
  /** Path inside the archive, `/`-separated, relative. */
  name: string;
  data: Buffer | string;
  modifiedAt?: Date;
}

/** A ZIP archive holding `entries` in order. Throws when the archive would need ZIP64. */
export function createZip(entries: ZipInputEntry[]): Buffer {
  if (entries.length > MAX_UINT16) throw new Error('Too many entries for a ZIP archive');
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    if (name.length === 0 || name.length > MAX_UINT16) throw new Error('Invalid entry name');
    const data = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data;
    const checksum = crc32(data);
    const deflated = data.length > 0 ? zlib.deflateRawSync(data) : null;
    const useDeflate = deflated !== null && deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? METHOD_DEFLATED : METHOD_STORED;
    if (data.length >= MAX_UINT32 || body.length >= MAX_UINT32) {
      throw new Error('Entry too large for a ZIP archive');
    }
    const stamp = dosDateTime(entry.modifiedAt ?? new Date());

    const local = Buffer.alloc(LOCAL_HEADER_SIZE);
    local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const header = Buffer.alloc(CENTRAL_HEADER_SIZE);
    header.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
    header.writeUInt16LE((HOST_UNIX << 8) | VERSION_NEEDED, 4);
    header.writeUInt16LE(VERSION_NEEDED, 6);
    header.writeUInt16LE(FLAG_UTF8, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(stamp.time, 12);
    header.writeUInt16LE(stamp.date, 14);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    // Extra field, comment, disk number and internal attributes stay 0.
    header.writeUInt32LE((UNIX_REGULAR_FILE << 16) >>> 0, 38);
    header.writeUInt32LE(offset, 42);

    chunks.push(local, name, body);
    central.push(header, name);
    offset += local.length + name.length + body.length;
    if (offset >= MAX_UINT32) throw new Error('Archive too large for a ZIP archive');
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(END_RECORD_SIZE);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, end]);
}

export type ZipErrorCode =
  | 'invalid'
  | 'encrypted'
  | 'zip64'
  | 'symlink'
  | 'unsupported'
  | 'too-many-entries'
  | 'too-large';

/** Why an archive (or one of its entries) was refused. Messages never echo archive contents. */
export class ZipFormatError extends Error {
  constructor(
    public readonly code: ZipErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ZipFormatError';
  }
}

export interface ZipReadLimits {
  /** Most entries (files and directories) the central directory may list. */
  maxEntries: number;
  /** Most bytes all entries may declare uncompressed, together. */
  maxTotalUncompressed: number;
}

export interface ZipEntry {
  name: string;
  isDirectory: boolean;
  compressedSize: number;
  /** Declared uncompressed size; `read()` refuses data that does not match it. */
  size: number;
  /** Inflate (or copy) the entry, verifying its size and CRC-32. */
  read(): Buffer;
}

const utf8Strict = new TextDecoder('utf-8', { fatal: true });

/** Entry name bytes: UTF-8 when flagged or valid as UTF-8 (many tools omit the flag), else Latin-1. */
function decodeName(bytes: Buffer, flags: number): string {
  if (flags & FLAG_UTF8) return bytes.toString('utf8');
  try {
    return utf8Strict.decode(bytes);
  } catch {
    return bytes.toString('latin1');
  }
}

function hasZip64Extra(extra: Buffer): boolean {
  let at = 0;
  while (at + 4 <= extra.length) {
    const id = extra.readUInt16LE(at);
    const size = extra.readUInt16LE(at + 2);
    if (id === ZIP64_EXTRA_FIELD) return true;
    at += 4 + size;
  }
  return false;
}

function findEndRecord(buffer: Buffer): number {
  const lowest = Math.max(0, buffer.length - END_RECORD_SIZE - MAX_COMMENT_LENGTH);
  for (let at = buffer.length - END_RECORD_SIZE; at >= lowest; at -= 1) {
    if (buffer.readUInt32LE(at) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(at + 20);
    if (at + END_RECORD_SIZE + commentLength <= buffer.length) return at;
  }
  return -1;
}

/**
 * The entries of the archive in `buffer`, checked against `limits` and the refusal rules above.
 * Throws `ZipFormatError` for anything it will not read.
 */
export function readZip(buffer: Buffer, limits: ZipReadLimits): ZipEntry[] {
  if (buffer.length < END_RECORD_SIZE) throw new ZipFormatError('invalid', 'Not a ZIP archive');
  const end = findEndRecord(buffer);
  if (end < 0) throw new ZipFormatError('invalid', 'Not a ZIP archive');
  if (end >= 20 && buffer.readUInt32LE(end - 20) === ZIP64_END_LOCATOR_SIGNATURE) {
    throw new ZipFormatError('zip64', 'ZIP64 archives are not supported');
  }

  const disk = buffer.readUInt16LE(end + 4);
  const directoryDisk = buffer.readUInt16LE(end + 6);
  const entriesOnDisk = buffer.readUInt16LE(end + 8);
  const entryCount = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (entryCount === MAX_UINT16 || directorySize === MAX_UINT32 || directoryOffset === MAX_UINT32) {
    throw new ZipFormatError('zip64', 'ZIP64 archives are not supported');
  }
  if (disk !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new ZipFormatError('unsupported', 'Multi-part archives are not supported');
  }
  if (entryCount > limits.maxEntries) {
    throw new ZipFormatError('too-many-entries', 'The archive has too many entries');
  }
  if (directoryOffset + directorySize > end) {
    throw new ZipFormatError('invalid', 'Damaged ZIP archive');
  }

  const entries: ZipEntry[] = [];
  let totalSize = 0;
  let at = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (at + CENTRAL_HEADER_SIZE > end || buffer.readUInt32LE(at) !== CENTRAL_HEADER_SIGNATURE) {
      throw new ZipFormatError('invalid', 'Damaged ZIP archive');
    }
    const madeBy = buffer.readUInt16LE(at + 4);
    const flags = buffer.readUInt16LE(at + 8);
    const method = buffer.readUInt16LE(at + 10);
    const checksum = buffer.readUInt32LE(at + 16);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const size = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const entryDisk = buffer.readUInt16LE(at + 34);
    const externalAttributes = buffer.readUInt32LE(at + 38);
    const localOffset = buffer.readUInt32LE(at + 42);
    const nameStart = at + CENTRAL_HEADER_SIZE;
    const next = nameStart + nameLength + extraLength + commentLength;
    if (next > end) throw new ZipFormatError('invalid', 'Damaged ZIP archive');
    const extra = buffer.subarray(nameStart + nameLength, nameStart + nameLength + extraLength);

    if (
      compressedSize === MAX_UINT32 ||
      size === MAX_UINT32 ||
      localOffset === MAX_UINT32 ||
      entryDisk === MAX_UINT16 ||
      hasZip64Extra(extra)
    ) {
      throw new ZipFormatError('zip64', 'ZIP64 archives are not supported');
    }
    if (flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION) || method === METHOD_AES) {
      throw new ZipFormatError('encrypted', 'Encrypted archives are not supported');
    }
    const host = madeBy >> 8;
    if (
      (host === HOST_UNIX || host === HOST_DARWIN) &&
      ((externalAttributes >>> 16) & UNIX_FILE_TYPE_MASK) === UNIX_SYMLINK
    ) {
      throw new ZipFormatError('symlink', 'Archives with symbolic links are not supported');
    }
    if (method !== METHOD_STORED && method !== METHOD_DEFLATED) {
      throw new ZipFormatError('unsupported', 'Unsupported compression method');
    }
    if (entryDisk !== 0) {
      throw new ZipFormatError('unsupported', 'Multi-part archives are not supported');
    }

    totalSize += size;
    if (totalSize > limits.maxTotalUncompressed) {
      throw new ZipFormatError('too-large', 'The archive is too large when uncompressed');
    }

    const name = decodeName(buffer.subarray(nameStart, nameStart + nameLength), flags);
    entries.push({
      name,
      isDirectory: name.endsWith('/'),
      compressedSize,
      size,
      read: () =>
        readEntryData(buffer, directoryOffset, {
          localOffset,
          method,
          checksum,
          compressedSize,
          size,
        }),
    });
    at = next;
  }
  return entries;
}

function readEntryData(
  buffer: Buffer,
  directoryOffset: number,
  entry: {
    localOffset: number;
    method: number;
    checksum: number;
    compressedSize: number;
    size: number;
  }
): Buffer {
  const damaged = () => new ZipFormatError('invalid', 'Damaged ZIP archive');
  const at = entry.localOffset;
  if (
    at + LOCAL_HEADER_SIZE > directoryOffset ||
    buffer.readUInt32LE(at) !== LOCAL_HEADER_SIGNATURE
  ) {
    throw damaged();
  }
  if (buffer.readUInt16LE(at + 6) & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) {
    throw new ZipFormatError('encrypted', 'Encrypted archives are not supported');
  }
  const start =
    at + LOCAL_HEADER_SIZE + buffer.readUInt16LE(at + 26) + buffer.readUInt16LE(at + 28);
  const stop = start + entry.compressedSize;
  if (stop > directoryOffset) throw damaged();
  const raw = buffer.subarray(start, stop);

  let data: Buffer;
  if (entry.method === METHOD_STORED) {
    data = Buffer.from(raw);
  } else {
    try {
      // The declared size bounds the output: a deflate bomb stops here instead of filling memory.
      data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(entry.size, 1) });
    } catch {
      throw damaged();
    }
  }
  if (data.length !== entry.size || crc32(data) !== entry.checksum) throw damaged();
  return data;
}
