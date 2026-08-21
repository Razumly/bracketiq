-- Freeze a Document Template Version as soon as an assignment or evidence row
-- stores its Version ID. The application also checks these references so this
-- remains safe for databases that were migrated before this trigger existed.
CREATE OR REPLACE FUNCTION "freeze_document_template_versions"("template_ids" TEXT[])
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  "template_id" TEXT;
BEGIN
  FOREACH "template_id" IN ARRAY COALESCE("template_ids", ARRAY[]::TEXT[])
  LOOP
    IF "template_id" IS NULL OR btrim("template_id") = '' THEN
      CONTINUE;
    END IF;
    UPDATE "TemplateDocuments"
    SET "frozenAt" = COALESCE("frozenAt", CURRENT_TIMESTAMP),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = "template_id";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Document Template Version % does not exist.', "template_id"
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "freeze_required_template_versions_from_event"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "freeze_document_template_versions"(NEW."requiredTemplateIds");
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "freeze_required_template_versions_from_both_arrays"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "freeze_document_template_versions"(
    COALESCE(NEW."requiredTemplateIds", ARRAY[]::TEXT[])
    || COALESCE(NEW."hostRequiredTemplateIds", ARRAY[]::TEXT[])
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "freeze_required_template_version_from_signed_document"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "freeze_document_template_versions"(ARRAY[NEW."templateId"]);
  RETURN NEW;
END;
$$;


CREATE TRIGGER "Events_freeze_document_template_versions"
BEFORE INSERT OR UPDATE OF "requiredTemplateIds" ON "Events"
FOR EACH ROW
EXECUTE FUNCTION "freeze_required_template_versions_from_event"();

CREATE TRIGGER "Teams_freeze_document_template_versions"
BEFORE INSERT OR UPDATE OF "requiredTemplateIds" ON "Teams"
FOR EACH ROW
EXECUTE FUNCTION "freeze_required_template_versions_from_event"();


CREATE TRIGGER "EventTemplates_freeze_document_template_versions"
BEFORE INSERT OR UPDATE OF "requiredTemplateIds" ON "EventTemplates"
FOR EACH ROW
EXECUTE FUNCTION "freeze_required_template_versions_from_event"();

CREATE TRIGGER "TimeSlots_freeze_document_template_versions"
BEFORE INSERT OR UPDATE OF "requiredTemplateIds", "hostRequiredTemplateIds" ON "TimeSlots"
FOR EACH ROW
EXECUTE FUNCTION "freeze_required_template_versions_from_both_arrays"();

CREATE TRIGGER "EventTemplateTimeSlots_freeze_document_template_versions"
BEFORE INSERT OR UPDATE OF "requiredTemplateIds", "hostRequiredTemplateIds" ON "EventTemplateTimeSlots"
FOR EACH ROW
EXECUTE FUNCTION "freeze_required_template_versions_from_both_arrays"();

CREATE TRIGGER "RentalBookingItems_freeze_document_template_versions"
BEFORE INSERT OR UPDATE OF "requiredTemplateIds", "hostRequiredTemplateIds" ON "RentalBookingItems"
FOR EACH ROW
EXECUTE FUNCTION "freeze_required_template_versions_from_both_arrays"();

CREATE TRIGGER "SignedDocuments_freeze_document_template_versions"
BEFORE INSERT OR UPDATE OF "templateId" ON "SignedDocuments"
FOR EACH ROW
EXECUTE FUNCTION "freeze_required_template_version_from_signed_document"();


-- Backfill the lifecycle marker for assignments and evidence that existed before
-- this migration was applied.
UPDATE "TemplateDocuments" AS "version"
SET "frozenAt" = COALESCE("version"."frozenAt", CURRENT_TIMESTAMP),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM "Events" AS "event"
  WHERE "version"."id" = ANY("event"."requiredTemplateIds")
)

OR EXISTS (
  SELECT 1 FROM "Teams" AS "team"
  WHERE "version"."id" = ANY("team"."requiredTemplateIds")
)
OR EXISTS (
  SELECT 1 FROM "EventTemplates" AS "event_template"
  WHERE "version"."id" = ANY("event_template"."requiredTemplateIds")
)
OR EXISTS (
  SELECT 1 FROM "TimeSlots" AS "slot"
  WHERE "version"."id" = ANY("slot"."requiredTemplateIds")
     OR "version"."id" = ANY("slot"."hostRequiredTemplateIds")
)
OR EXISTS (
  SELECT 1 FROM "EventTemplateTimeSlots" AS "event_template_slot"
  WHERE "version"."id" = ANY("event_template_slot"."requiredTemplateIds")
     OR "version"."id" = ANY("event_template_slot"."hostRequiredTemplateIds")
)
OR EXISTS (
  SELECT 1 FROM "RentalBookingItems" AS "rental_item"
  WHERE "version"."id" = ANY("rental_item"."requiredTemplateIds")
     OR "version"."id" = ANY("rental_item"."hostRequiredTemplateIds")
)
OR EXISTS (
  SELECT 1 FROM "SignedDocuments" AS "evidence"
  WHERE "evidence"."templateId" = "version"."id"
);

CREATE OR REPLACE FUNCTION "enforce_immutable_document_template_version"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."frozenAt" IS NOT NULL AND (
    NEW."frozenAt" IS DISTINCT FROM OLD."frozenAt"
    OR NEW."templateId" IS DISTINCT FROM OLD."templateId"
    OR NEW."versionSequence" IS DISTINCT FROM OLD."versionSequence"
    OR NEW."type" IS DISTINCT FROM OLD."type"
    OR NEW."signOnce" IS DISTINCT FROM OLD."signOnce"
    OR NEW."requiredSignerType" IS DISTINCT FROM OLD."requiredSignerType"
    OR NEW."roleIndex" IS DISTINCT FROM OLD."roleIndex"
    OR NEW."roleIndexes" IS DISTINCT FROM OLD."roleIndexes"
    OR NEW."signerRoles" IS DISTINCT FROM OLD."signerRoles"
    OR NEW."content" IS DISTINCT FROM OLD."content"
    OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
  ) THEN
    RAISE EXCEPTION 'Document Template Version % is frozen and cannot be materially edited.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TemplateDocuments_enforce_immutable_version"
BEFORE UPDATE ON "TemplateDocuments"
FOR EACH ROW
EXECUTE FUNCTION "enforce_immutable_document_template_version"();

CREATE OR REPLACE FUNCTION "reject_frozen_document_template_version_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."frozenAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Document Template Version % is frozen and cannot be deleted.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "TemplateDocuments_reject_frozen_delete"
BEFORE DELETE ON "TemplateDocuments"
FOR EACH ROW
EXECUTE FUNCTION "reject_frozen_document_template_version_delete"();
