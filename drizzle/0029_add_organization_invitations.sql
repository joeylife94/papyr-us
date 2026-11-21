-- Organization invitations (issue #124 X1d): the way a person is brought into an organization
-- other than the default one.
--
-- An invitation is a credential. Only the SHA-256 of its token is stored (token_hash); the token
-- itself is shown once, to the inviter, and is never stored. An invitation is pending until it
-- is accepted, revoked or past expires_at; each of those is recorded on the row, nothing is
-- deleted. The role is `member` or `admin` and is decided again when the invitation is accepted
-- (the application refuses any other stored value).
--
-- Additive and idempotent. A database without organizations (a fresh install) is left alone:
-- push creates the table from shared/schema.ts. Constraint and index names match the ones
-- drizzle-kit derives from shared/schema.ts, so push then has nothing left to change.
-- Requires drizzle/0022_add_organizations.sql. Deployments apply this file after 0022 to 0028
-- and before `drizzle-kit push`.
-- drizzle/0029_add_organization_invitations.down.sql reverts it while no invitation is pending.

DO $$
BEGIN
  IF to_regclass('organizations') IS NULL OR to_regclass('users') IS NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS organization_invitations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    token_hash TEXT NOT NULL,
    created_by_user_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    accepted_by_user_id INTEGER,
    revoked_at TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_token_hash_unique
    ON organization_invitations (token_hash);
  CREATE INDEX IF NOT EXISTS idx_organization_invitations_organization_id
    ON organization_invitations (organization_id);

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'organization_invitations_organization_id_organizations_id_fk'
                    AND conrelid = 'organization_invitations'::regclass) THEN
    ALTER TABLE organization_invitations
      ADD CONSTRAINT organization_invitations_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'organization_invitations_created_by_user_id_users_id_fk'
                    AND conrelid = 'organization_invitations'::regclass) THEN
    ALTER TABLE organization_invitations
      ADD CONSTRAINT organization_invitations_created_by_user_id_users_id_fk
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'organization_invitations_accepted_by_user_id_users_id_fk'
                    AND conrelid = 'organization_invitations'::regclass) THEN
    ALTER TABLE organization_invitations
      ADD CONSTRAINT organization_invitations_accepted_by_user_id_users_id_fk
      FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
