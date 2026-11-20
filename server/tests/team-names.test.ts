import { describe, expect, it } from 'vitest';
import { generateTeamUrlName } from '../team-names';

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
