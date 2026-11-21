/**
 * The admin directory form never sees a stored password: the server answers `hasPassword`. What
 * the form submits for the password follows the team form's rule: a new directory takes the typed
 * password or none; an edited one keeps its password unless a new one is typed or its removal is
 * asked for. Nothing else in the submission is changed.
 */
import { describe, expect, it } from 'vitest';
import { directorySubmission } from '../../client/src/lib/directory-form';

const fields = { name: 'docs', displayName: 'Docs', isVisible: true, order: 2 };

describe('directorySubmission', () => {
  it('a created directory takes the typed password, or none', () => {
    expect(
      directorySubmission({ fields, typed: 'secret', removeRequested: false, editing: false })
    ).toEqual({ ...fields, password: 'secret' });
    expect(
      directorySubmission({ fields, typed: '', removeRequested: false, editing: false })
    ).toEqual({ ...fields, password: null });
  });

  it('an edited directory keeps its password unless one is typed or its removal is asked for', () => {
    const kept = directorySubmission({ fields, typed: '', removeRequested: false, editing: true });
    expect(kept).toEqual(fields);
    expect(kept).not.toHaveProperty('password');
    expect(
      directorySubmission({ fields, typed: 'new', removeRequested: false, editing: true })
    ).toEqual({ ...fields, password: 'new' });
    expect(
      directorySubmission({ fields, typed: '', removeRequested: true, editing: true })
    ).toEqual({ ...fields, password: null });
  });

  it('a typed password wins over a removal that was left ticked', () => {
    expect(
      directorySubmission({ fields, typed: 'new', removeRequested: true, editing: true })
    ).toEqual({ ...fields, password: 'new' });
  });

  it('drops a password field that came in with the fields', () => {
    const withPassword = { ...fields, password: '$2a$10$stored' } as typeof fields;
    const kept = directorySubmission({
      fields: withPassword,
      typed: '',
      removeRequested: false,
      editing: true,
    });
    expect(kept).not.toHaveProperty('password');
  });
});
