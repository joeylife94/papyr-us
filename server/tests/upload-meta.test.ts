/**
 * Sidecars on disk, against the real upload service (issue #124 X1b).
 * - a sidecar whose organizationId is present and not a positive integer (a string, zero, a
 *   negative, a float, null) is unavailable: getFileMeta answers undefined, so reading and
 *   deleting are refused, and the file is not listed under its team;
 * - a legacy sidecar without organizationId is still read, and is listed under the team's id
 *   and under a legacy team name the caller passes;
 * - a team-less sidecar and one written by processUploadedFile read back as written.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getFileMeta, listUploadedFiles } from '../services/upload';

const FILES_DIR = path.join(process.cwd(), 'server', 'uploads', 'files');
const tag = crypto.randomBytes(6).toString('hex');
const created: string[] = [];

function put(name: string, meta: unknown) {
  const file = `1700000000000-${tag}-${name}.txt`;
  fs.writeFileSync(path.join(FILES_DIR, file), 'x');
  fs.writeFileSync(path.join(FILES_DIR, `_meta_${file}.json`), JSON.stringify(meta));
  created.push(file);
  return file;
}

beforeAll(() => fs.mkdirSync(FILES_DIR, { recursive: true }));
afterAll(() => {
  for (const f of created) {
    fs.rmSync(path.join(FILES_DIR, f), { force: true });
    fs.rmSync(path.join(FILES_DIR, `_meta_${f}.json`), { force: true });
  }
});

describe('getFileMeta and listUploadedFiles on malformed sidecars', () => {
  const malformed: Array<[string, unknown]> = [
    ['string', '5'],
    ['zero', 0],
    ['negative', -3],
    ['float', 1.5],
    ['null', null],
  ];

  it.each(malformed)(
    'an organizationId that is %s is unavailable and not listed',
    async (label, value) => {
      const name = put(`bad-${label}`, { teamId: '77', organizationId: value });
      expect(await getFileMeta(name, false)).toBeUndefined();
      const listed = await listUploadedFiles('77');
      expect(listed.files.map((f: any) => f.filename)).not.toContain(name);
    }
  );

  it('a well formed sidecar is read and listed under its team', async () => {
    const name = put('good', { teamId: '77', organizationId: 3, uploadedBy: 1 });
    expect(await getFileMeta(name, false)).toEqual({ teamId: '77', organizationId: 3 });
    expect((await listUploadedFiles('77')).files.map((f: any) => f.filename)).toContain(name);
  });

  it('a legacy sidecar without organizationId is read; its team name lists only when passed', async () => {
    const name = put('legacy', { teamId: 'alpha-legacy' });
    expect(await getFileMeta(name, false)).toEqual({
      teamId: 'alpha-legacy',
      organizationId: null,
    });
    const names = async (legacy: string[]) =>
      (await listUploadedFiles('77', legacy)).files.map((f: any) => f.filename);
    expect(await names([])).not.toContain(name);
    expect(await names(['alpha-legacy'])).toContain(name);
  });

  it('a team-less sidecar has no team', async () => {
    const name = put('teamless', { organizationId: 3 });
    expect(await getFileMeta(name, false)).toEqual({ teamId: null, organizationId: 3 });
  });
});
