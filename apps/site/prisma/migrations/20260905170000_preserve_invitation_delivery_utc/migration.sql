-- Preserve deliveries for the reported attempt while review remains open.
-- Erasure of routine delivery rows must not erase the retained snapshot.
CREATE OR REPLACE FUNCTION update_open_invitation_delivery_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "InvitationEvidence" evidence
  SET "deliveries" = COALESCE((
    SELECT jsonb_agg(item) FROM jsonb_array_elements(evidence."deliveries") item
    WHERE item->>'id' <> NEW."id"
  ), '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'id', NEW."id", 'kind', NEW."kind", 'requestedBy', NEW."requestedBy", 'status', NEW."status",
    'createdAt', to_char(NEW."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'sentAt', to_char(NEW."sentAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'completedAt', to_char(NEW."completedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'failureCode', NEW."failureCode"
  ))
  WHERE evidence."inviteId" = NEW."inviteId" AND EXISTS (
    SELECT 1 FROM "ModerationReport" report
    WHERE report."id" = evidence."reportId" AND report."status" IN ('OPEN', 'IN_REVIEW')
  );
  RETURN NEW;
END;
$$;

-- Normalize snapshots captured before UTC offsets were explicit.
UPDATE "InvitationEvidence" evidence SET "deliveries" = (
  SELECT COALESCE(jsonb_agg(item || jsonb_build_object(
    'createdAt', CASE WHEN item->>'createdAt' ~ '[0-9]$' THEN (item->>'createdAt') || 'Z' ELSE item->>'createdAt' END,
    'sentAt', CASE WHEN item->>'sentAt' ~ '[0-9]$' THEN (item->>'sentAt') || 'Z' ELSE item->>'sentAt' END,
    'completedAt', CASE WHEN item->>'completedAt' ~ '[0-9]$' THEN (item->>'completedAt') || 'Z' ELSE item->>'completedAt' END
  )), '[]'::jsonb) FROM jsonb_array_elements(evidence."deliveries") item
);
