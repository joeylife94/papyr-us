-- Reverts drizzle/0026_notifications_to_accounts.sql (WP0a): notifications are addressed to
-- roster rows (members) again.
--
-- Refuses, and changes nothing, while the previous application would misdeliver or lose a row:
--   - a notification is addressed to an account that has no roster row with exactly its email;
--   - a notification belongs to an organization its recipient has left;
--   - a notification has a sender account with no roster row (and no sender_unmapped archive row
--     that remembers the roster sender);
--   - a held row in notification_roster_archive refers to a roster row, page, task or comment that
--     no longer exists, or its id is taken in notifications.
-- Otherwise: adds recipient_id and sender_id, fills them by email (a sender with no account
-- mapping comes back from the archive, or null when that roster row is gone, as ON DELETE SET
-- NULL would do), re-inserts the held rows with their original ids, restores NOT NULL and the two
-- original foreign keys, drops the three new columns, the index and the archive table. The
-- performance indexes of drizzle/0010 on recipient_id are not recreated.
--
-- The rows that were held come back, and the previous application treats them as it did before
-- the migration: it shows other_organization rows to the account with the roster row's email,
-- and would show no_account rows to a later sign-up with that email. This path exists to go back
-- to that application.
-- Does nothing when the table, or the recipient_user_id column, is not there.

DO $$
BEGIN
  IF to_regclass('notifications') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'notifications'::regclass
                    AND attname = 'recipient_user_id' AND NOT attisdropped) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM notifications n JOIN users u ON u.id = n.recipient_user_id
              WHERE NOT EXISTS (SELECT 1 FROM members r WHERE r.email = u.email)) THEN
    RAISE EXCEPTION 'a notification is addressed to an account without a roster row: the previous application cannot deliver it';
  END IF;
  IF EXISTS (SELECT 1 FROM notifications n
              WHERE NOT EXISTS (SELECT 1 FROM organization_members om
                                 WHERE om.user_id = n.recipient_user_id
                                   AND om.organization_id = n.organization_id)) THEN
    RAISE EXCEPTION 'a notification belongs to an organization its recipient has left: the previous application would show it';
  END IF;
  IF to_regclass('notification_roster_archive') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM notifications n JOIN users su ON su.id = n.sender_user_id
                WHERE NOT EXISTS (SELECT 1 FROM members r WHERE r.email = su.email)
                  AND NOT EXISTS (SELECT 1 FROM notification_roster_archive a
                                   WHERE a.notification_id = n.id AND a.reason = 'sender_unmapped')) THEN
      RAISE EXCEPTION 'a notification''s sender has no roster row';
    END IF;
    IF EXISTS (SELECT 1 FROM notification_roster_archive a
                WHERE a.reason <> 'sender_unmapped'
                  AND (NOT EXISTS (SELECT 1 FROM members r WHERE r.id = a.recipient_member_id)
                       OR (a.related_page_id IS NOT NULL
                           AND NOT EXISTS (SELECT 1 FROM wiki_pages p WHERE p.id = a.related_page_id))
                       OR (a.related_task_id IS NOT NULL
                           AND NOT EXISTS (SELECT 1 FROM tasks k WHERE k.id = a.related_task_id))
                       OR (a.related_comment_id IS NOT NULL
                           AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.id = a.related_comment_id))
                       OR EXISTS (SELECT 1 FROM notifications n WHERE n.id = a.notification_id))) THEN
      RAISE EXCEPTION 'an archived notification refers to a record that no longer exists';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM notifications n JOIN users su ON su.id = n.sender_user_id
                 WHERE NOT EXISTS (SELECT 1 FROM members r WHERE r.email = su.email)) THEN
    RAISE EXCEPTION 'a notification''s sender has no roster row';
  END IF;

  ALTER TABLE notifications ADD COLUMN recipient_id integer, ADD COLUMN sender_id integer;

  UPDATE notifications n
     SET recipient_id = r.id
    FROM users u
    JOIN members r ON r.email = u.email
   WHERE u.id = n.recipient_user_id;

  UPDATE notifications n
     SET sender_id = r.id
    FROM users u
    JOIN members r ON r.email = u.email
   WHERE u.id = n.sender_user_id;

  IF to_regclass('notification_roster_archive') IS NOT NULL THEN
    UPDATE notifications n
       SET sender_id = a.sender_member_id
      FROM notification_roster_archive a
     WHERE a.notification_id = n.id AND a.reason = 'sender_unmapped'
       AND n.sender_id IS NULL
       AND EXISTS (SELECT 1 FROM members r WHERE r.id = a.sender_member_id);
  END IF;

  ALTER TABLE notifications
    DROP COLUMN recipient_user_id,
    DROP COLUMN organization_id,
    DROP COLUMN sender_user_id;

  IF to_regclass('notification_roster_archive') IS NOT NULL THEN
    INSERT INTO notifications
      (id, type, title, content, recipient_id, sender_id,
       related_page_id, related_task_id, related_comment_id, is_read, created_at)
    SELECT a.notification_id, a.type, a.title, a.content, a.recipient_member_id,
           CASE WHEN EXISTS (SELECT 1 FROM members r WHERE r.id = a.sender_member_id)
                THEN a.sender_member_id END,
           a.related_page_id, a.related_task_id, a.related_comment_id, a.is_read, a.created_at
      FROM notification_roster_archive a
     WHERE a.reason <> 'sender_unmapped';
  END IF;

  ALTER TABLE notifications ALTER COLUMN recipient_id SET NOT NULL;
  ALTER TABLE notifications
    ADD CONSTRAINT notifications_recipient_id_members_id_fk
      FOREIGN KEY (recipient_id) REFERENCES members(id) ON DELETE CASCADE,
    ADD CONSTRAINT notifications_sender_id_members_id_fk
      FOREIGN KEY (sender_id) REFERENCES members(id) ON DELETE SET NULL;

  DROP TABLE IF EXISTS notification_roster_archive;
END $$;
