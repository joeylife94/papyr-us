/**
 * The sidebar asks for a team's password from `hasPassword`, a flag the server sends instead of
 * the stored hash; the page that edits teams shows the same flag and sends a password only when
 * one was typed (or its removal was asked for).
 */
import { describe, expect, it } from 'vitest';
import {
  needsTeamPassword,
  teamPasswordChange,
  teamVerifyOutcome,
} from '../../client/src/lib/team-password';

describe('needsTeamPassword', () => {
  it('asks for the password of a team that has one, until it is verified', () => {
    expect(needsTeamPassword({ name: 'core', hasPassword: true }, [])).toBe(true);
    expect(needsTeamPassword({ name: 'core', hasPassword: true }, ['other'])).toBe(true);
    expect(needsTeamPassword({ name: 'core', hasPassword: true }, ['core'])).toBe(false);
  });

  it('does not ask for a team without one', () => {
    expect(needsTeamPassword({ name: 'core', hasPassword: false }, [])).toBe(false);
    expect(needsTeamPassword({ name: 'core' }, [])).toBe(false);
  });

  it('is not decided by a password field: only the flag counts', () => {
    expect(needsTeamPassword({ name: 'core', password: '$2a$10$x' } as any, [])).toBe(false);
    expect(needsTeamPassword({ name: 'core', hasPassword: 'yes' } as any, [])).toBe(false);
  });
});

describe('teamPasswordChange', () => {
  it('a created team takes the typed password, or none', () => {
    expect(teamPasswordChange({ typed: 'secret', removeRequested: false, editing: false })).toEqual(
      {
        password: 'secret',
      }
    );
    expect(teamPasswordChange({ typed: '', removeRequested: false, editing: false })).toEqual({
      password: null,
    });
  });

  it('an edited team keeps its password unless one is typed or its removal is asked for', () => {
    expect(teamPasswordChange({ typed: '', removeRequested: false, editing: true })).toEqual({});
    expect(teamPasswordChange({ typed: 'new', removeRequested: false, editing: true })).toEqual({
      password: 'new',
    });
    expect(teamPasswordChange({ typed: '', removeRequested: true, editing: true })).toEqual({
      password: null,
    });
    // a typed password wins over a removal that was left ticked
    expect(teamPasswordChange({ typed: 'new', removeRequested: true, editing: true })).toEqual({
      password: 'new',
    });
  });
});

describe('teamVerifyOutcome', () => {
  it('unlocks only on a 200 answer that says the password is valid', () => {
    expect(teamVerifyOutcome(200, { isValid: true })).toBe('unlocked');
    expect(teamVerifyOutcome(200, { isValid: false })).toBe('wrong');
    expect(teamVerifyOutcome(200, {})).toBe('wrong');
    expect(teamVerifyOutcome(200, null)).toBe('wrong');
    expect(teamVerifyOutcome(200, { isValid: 'true' })).toBe('wrong');
  });

  it('tells a signed-out caller to sign in, and a throttled one to wait', () => {
    expect(teamVerifyOutcome(401, { message: 'No token provided' })).toBe('sign-in');
    expect(teamVerifyOutcome(429, null)).toBe('throttled');
  });

  it('never unlocks on another status, whatever the body says', () => {
    expect(teamVerifyOutcome(500, { isValid: true })).toBe('failed');
    expect(teamVerifyOutcome(403, { isValid: true })).toBe('failed');
  });
});
