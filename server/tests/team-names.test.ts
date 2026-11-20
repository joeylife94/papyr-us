import { describe, expect, it } from 'vitest';
import { generateTeamUrlName } from '../team-names';
import { parseTeamReference } from '../middleware';

const fixed = (index: number) => () => index;

describe('generateTeamUrlName', () => {
  it('makes a lowercase hyphenated name and a five-character suffix', () => {
    expect(generateTeamUrlName('Core Developers', fixed(0))).toBe('core-developers-aaaaa');
    expect(generateTeamUrlName('  QA & Release  ', fixed(0))).toBe('qa-release-aaaaa');
  });

  it('falls back to "team" when nothing usable is left (for example a Korean name)', () => {
    expect(generateTeamUrlName('디자인 팀', fixed(0))).toBe('team-aaaaa');
    expect(generateTeamUrlName('!!!', fixed(0))).toBe('team-aaaaa');
  });

  it('keeps the base short and never ends it with a hyphen', () => {
    const name = generateTeamUrlName('a'.repeat(29) + ' bbbbbbbb', fixed(0));
    expect(name).toBe(`${'a'.repeat(29)}-aaaaa`);
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('draws the suffix from letters and digits, so two teams of one name differ', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) seen.add(generateTeamUrlName('Same name'));
    expect(seen.size).toBeGreaterThan(40);
    for (const name of seen) expect(name).toMatch(/^same-name-[a-z0-9]{5}$/);
  });
});

describe('every generated name is one the team routes read as a name', () => {
  // parseTeamReference is what `?teamId=<name>` goes through on every team-scoped route.
  const displayNames = [
    '2024 Plans',
    '1st Floor',
    '3D Design',
    '12345',
    '007',
    '10e1 team',
    '0x10',
    'Infinity',
    'NaN',
    '디자인 팀',
    '日本語',
    '',
    '   ',
    '!!!',
    '---',
    'Core Developers',
    'x'.repeat(200),
  ];
  for (const displayName of displayNames) {
    it(`display name ${JSON.stringify(displayName.slice(0, 20))}`, () => {
      for (let i = 0; i < 30; i += 1) {
        const name = generateTeamUrlName(displayName);
        expect(parseTeamReference(name), name).toEqual({ name });
        expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    });
  }

  it('keeps the readable part of a digit-leading name behind a letter prefix', () => {
    expect(generateTeamUrlName('2024 Plans', () => 0)).toBe('team-2024-plans-aaaaa');
    expect(generateTeamUrlName('3D Design', () => 0)).toBe('team-3d-design-aaaaa');
  });
});
