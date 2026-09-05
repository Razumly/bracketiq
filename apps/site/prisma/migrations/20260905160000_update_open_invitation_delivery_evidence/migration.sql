-- Preserve deliveries for the reported attempt while review remains open.
-- Erasure of routine delivery rows must not erase the retained snapshot.
CREATE FUNCTION update_open_invitation_delivery_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "InvitationEvidence" evidence
  SET "deliveries" = COALESCE((
    SELECT jsonb_agg(item) FROM jsonb_array_elements(evidence."deliveries") item
    WHERE item->>'id' <> NEW."id"
  ), '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'id', NEW."id", 'kind', NEW."kind", 'requestedBy', NEW."requestedBy", 'status', NEW."status",
    'createdAt', NEW."createdAt", 'sentAt', NEW."sentAt", 'completedAt', NEW."completedAt", 'failureCode', NEW."failureCode"
  ))
  WHERE evidence."inviteId" = NEW."inviteId" AND EXISTS (
    SELECT 1 FROM "ModerationReport" report
    WHERE report."id" = evidence."reportId" AND report."status" IN ('OPEN', 'IN_REVIEW')
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER update_open_invitation_delivery_evidence AFTER INSERT OR UPDATE ON "InviteDeliveries"
FOR EACH ROW EXECUTE FUNCTION update_open_invitation_delivery_evidence();
