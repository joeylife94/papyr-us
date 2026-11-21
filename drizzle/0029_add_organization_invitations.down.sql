-- Reverts drizzle/0029_add_organization_invitations.sql (issue #124 X1d).
--
-- Refuses, and changes nothing, while an invitation is still pending (not accepted, not revoked,
-- not expired): dropping the table would void a link someone was given without telling them.
-- Revoke the pending invitations, or wait for them to expire, and run this again. Otherwise drops
-- the table and the record of accepted, revoked and expired invitations with it. Accounts and
-- memberships made through invitations stay. Does nothing when the table is not there.

DO $$
BEGIN
  IF to_regclass('organization_invitations') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM organization_invitations
              WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()) THEN
    RAISE EXCEPTION 'an organization invitation is still pending: revoke it or let it expire first';
  END IF;
  DROP TABLE organization_invitations;
END $$;
