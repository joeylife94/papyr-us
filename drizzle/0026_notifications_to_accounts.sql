-- Notifications are addressed to accounts (WP0a): a notification belongs to a user (users.id) and
-- to the organization it was created in, instead of to a row of the team roster (members).
--
-- Each existing notification moves to the account whose email is exactly the email of the roster
-- row it was addressed to, in the organization that account belongs to, provided the roster row
-- is not placed in a different organization (it has no team, or its team is in that
-- organization). A notification that cannot be assigned like that is never given to anyone: it is
-- copied, with its content, into notification_roster_archive with the reason, and removed from
-- notifications:
--   no_account                    no account has the roster row's email (today nobody reads it; a
--                                 later sign-up with that email would)
--   account_without_organization  the account belongs to no organization (today it gets 403)
--   other_organization            the roster row's team is in another organization than the
--                                 account's (today the account reads it; the one place where this
--                                 migration narrows what is shown, so the count is printed)
--   no_roster_row                 no roster row has the notification's recipient_id (possible only
--                                 where the old foreign key was missing; nobody could read it)
-- The sender becomes the account with the sender roster row's email when that account belongs to
-- the notification's organization. Otherwise it is null, and when a sender was set, an archive row
-- `sender_unmapped` keeps the roster ids (its content columns are null). Ids, is_read,
-- timestamps and related ids of assigned notifications are unchanged.
--
-- For a moved notification, organization_id is the organization its recipient account belongs to
-- now; it says whose list the row is in, not where the related record lives. related_page_id,
-- related_task_id and related_comment_id are carried exactly as they were and are not checked
-- against that organization. Nothing of a related record is returned through a notification: a
-- page is read through its own route, which applies the page's own access check.
--
-- The columns, constraints and index are created under the names `drizzle-kit push` generates for
-- shared/schema.ts, and recipient_id and sender_id are dropped, so a later push has nothing to
-- change on these tables. Deployments apply this file after 0025 and before push (push alone
-- would meet NOT NULL columns on a populated table).
--
-- Additive in effect and idempotent. A database without a notifications table (a fresh install)
-- is left alone: push creates the new shape. A table that already has recipient_user_id and no
-- recipient_id (push created it, or this file ran) is left alone. A table that has both columns
-- is a state nobody should guess about: this file refuses and changes nothing.
-- drizzle/0026_notifications_to_accounts.down.sql reverts it while that loses nothing.

DO $$
DECLARE
  has_old boolean;
  has_new boolean;
  n_assigned integer;
  n_no_account integer;
  n_no_organization integer;
  n_other_organization integer;
  n_no_roster_row integer;
  n_unheld integer;
  unheld_ids text;
  n_sender_unmapped integer;
BEGIN
  IF to_regclass('notifications') IS NULL THEN
    RETURN;
  END IF;

  has_old := EXISTS (SELECT 1 FROM pg_attribute
                      WHERE attrelid = 'notifications'::regclass
                        AND attname = 'recipient_id' AND NOT attisdropped);
  has_new := EXISTS (SELECT 1 FROM pg_attribute
                      WHERE attrelid = 'notifications'::regclass
                        AND attname = 'recipient_user_id' AND NOT attisdropped);

  IF has_new AND has_old THEN
    RAISE EXCEPTION 'notifications has both recipient_id and recipient_user_id: refusing to guess which one is current';
  END IF;
  IF has_new THEN
    RETURN;
  END IF;
  IF NOT has_old THEN
    RAISE EXCEPTION 'notifications has neither recipient_id nor recipient_user_id';
  END IF;

  CREATE TABLE IF NOT EXISTS notification_roster_archive (
    notification_id integer PRIMARY KEY,
    reason text NOT NULL,
    recipient_member_id integer NOT NULL,
    sender_member_id integer,
    type text,
    title text,
    content text,
    related_page_id integer,
    related_task_id integer,
    related_comment_id integer,
    is_read boolean,
    created_at timestamp,
    archived_at timestamp NOT NULL DEFAULT now()
  );

  ALTER TABLE notifications
    ADD COLUMN recipient_user_id integer,
    ADD COLUMN organization_id integer,
    ADD COLUMN sender_user_id integer;

  -- Assign: the account with exactly the roster row's email, in its organization, when the roster
  -- row is not placed in another organization.
  UPDATE notifications n
     SET recipient_user_id = u.id,
         organization_id = om.organization_id
    FROM members r
    JOIN users u ON u.email = r.email
    JOIN organization_members om ON om.user_id = u.id
    LEFT JOIN teams t ON t.id = r.team_id
   WHERE r.id = n.recipient_id
     AND (r.team_id IS NULL OR t.organization_id = om.organization_id);

  -- Hold the rest, with the reason. An archive row that already exists for a notification that is
  -- still here is a state to look at, not to overwrite.
  IF EXISTS (SELECT 1 FROM notification_roster_archive a
               JOIN notifications n ON n.id = a.notification_id
              WHERE n.recipient_user_id IS NULL) THEN
    RAISE EXCEPTION 'notification_roster_archive already holds a notification that is still in notifications';
  END IF;

  INSERT INTO notification_roster_archive
    (notification_id, reason, recipient_member_id, sender_member_id, type, title, content,
     related_page_id, related_task_id, related_comment_id, is_read, created_at)
  SELECT n.id,
         CASE WHEN r.id IS NULL THEN 'no_roster_row'
              WHEN u.id IS NULL THEN 'no_account'
              WHEN om.id IS NULL THEN 'account_without_organization'
              ELSE 'other_organization' END,
         n.recipient_id, n.sender_id, n.type, n.title, n.content,
         n.related_page_id, n.related_task_id, n.related_comment_id, n.is_read, n.created_at
    FROM notifications n
    LEFT JOIN members r ON r.id = n.recipient_id
    LEFT JOIN users u ON u.email = r.email
    LEFT JOIN organization_members om ON om.user_id = u.id
   WHERE n.recipient_user_id IS NULL;

  SELECT count(*) FILTER (WHERE reason = 'no_account'),
         count(*) FILTER (WHERE reason = 'account_without_organization'),
         count(*) FILTER (WHERE reason = 'other_organization'),
         count(*) FILTER (WHERE reason = 'no_roster_row')
    INTO n_no_account, n_no_organization, n_other_organization, n_no_roster_row
    FROM notification_roster_archive a
    JOIN notifications n ON n.id = a.notification_id
   WHERE n.recipient_user_id IS NULL;

  DELETE FROM notifications n
   USING notification_roster_archive a
   WHERE a.notification_id = n.id AND n.recipient_user_id IS NULL;

  -- Last line of defence: every row is assigned or held by now.
  SELECT count(*), string_agg(id::text, ', ' ORDER BY id) FILTER (WHERE rn <= 10)
    INTO n_unheld, unheld_ids
    FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn
            FROM notifications WHERE recipient_user_id IS NULL) x;
  IF n_unheld > 0 THEN
    RAISE EXCEPTION 'a notification could be neither assigned nor held: % row(s), first ids %', n_unheld, unheld_ids;
  END IF;

  SELECT count(*) INTO n_assigned FROM notifications;

  -- Sender: the account with the sender roster row's email, when it is in the notification's
  -- organization; otherwise null, and the roster ids are kept in the archive.
  UPDATE notifications n
     SET sender_user_id = su.id
    FROM members sr
    JOIN users su ON su.email = sr.email
    JOIN organization_members som ON som.user_id = su.id
   WHERE sr.id = n.sender_id
     AND som.organization_id = n.organization_id;

  INSERT INTO notification_roster_archive (notification_id, reason, recipient_member_id, sender_member_id)
  SELECT n.id, 'sender_unmapped', n.recipient_id, n.sender_id
    FROM notifications n
   WHERE n.sender_id IS NOT NULL AND n.sender_user_id IS NULL;
  GET DIAGNOSTICS n_sender_unmapped = ROW_COUNT;

  ALTER TABLE notifications
    ALTER COLUMN recipient_user_id SET NOT NULL,
    ALTER COLUMN organization_id SET NOT NULL;
  ALTER TABLE notifications
    ADD CONSTRAINT notifications_recipient_user_id_users_id_fk
      FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT notifications_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    ADD CONSTRAINT notifications_sender_user_id_users_id_fk
      FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL;
  CREATE INDEX idx_notifications_recipient_user
    ON notifications (recipient_user_id, organization_id);

  -- The roster columns go, with their foreign keys and indexes.
  ALTER TABLE notifications DROP COLUMN recipient_id, DROP COLUMN sender_id;

  RAISE NOTICE '0026 notifications: % assigned to accounts; held in notification_roster_archive: % no_account, % account_without_organization, % other_organization, % no_roster_row; % sender(s) unmapped',
    n_assigned, n_no_account, n_no_organization, n_other_organization, n_no_roster_row, n_sender_unmapped;
END $$;
