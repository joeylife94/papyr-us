-- Public grant levels (WP4): a public grant carries `viewer` or `commenter` only. A public grant
-- stored as `editor` or `owner` is honoured as `viewer` by every reader of public grants
-- (checkPagePermission, the page lists and the in-memory reader of comment recipients).
--
-- Changes no data and no schema. It reports how many public grants above `commenter` exist, so
-- an operator knows what the narrowing touches; the prepare script prints the line. Safe to run
-- any number of times; nothing is done when the table is not there.
DO $$
DECLARE
  above_commenter integer := 0;
BEGIN
  IF to_regclass('page_permissions') IS NOT NULL THEN
    SELECT count(*)::integer INTO above_commenter
      FROM page_permissions
     WHERE entity_type = 'public' AND permission IN ('editor', 'owner');
  END IF;
  RAISE NOTICE '0030 public grants: % above commenter (editor or owner) exist and are honoured as viewer; no row was changed',
    above_commenter;
END
$$;
