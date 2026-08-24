DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'AffiliateSupplyLifecycleCommand'
  ) THEN
    CREATE TYPE "AffiliateSupplyLifecycleCommand" AS ENUM (
      'CREATE_ROOT',
      'RECORD_MAPPING',
      'APPROVE',
      'ACTIVATE',
      'PUBLISH_TARGET',
      'RECORD_REFRESH',
      'RECORD_EMPTY_REFRESH',
      'RECORD_REFRESH_FAILURE',
      'REVALIDATE_IDENTITY',
      'EXCLUDE_SOURCE',
      'REJECT_TARGET',
      'CREATE_SUCCESSOR',
      'RECONCILE'
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'AffiliateSupplyLifecycleOutcome'
  ) THEN
    CREATE TYPE "AffiliateSupplyLifecycleOutcome" AS ENUM (
      'SOURCE_EXCLUDED',
      'HUMAN_REVIEW_REQUIRED',
      'TARGET_REJECTED',
      'AUTOMATION_HOLD',
      'REPAIR_REQUIRED',
      'NATURAL_EXPIRY',
      'VALID_EMPTY_REFRESH'
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'AffiliateSupplyLifecycleActorKind'
  ) THEN
    CREATE TYPE "AffiliateSupplyLifecycleActorKind" AS ENUM (
      'MAPPING_PRODUCER',
      'SUPPLY_REVIEWER',
      'HUMAN_DIRECTED_EXECUTOR',
      'SYSTEM',
      'HUMAN'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AffiliateSupplyLifecycleTransitions'
      AND column_name = 'outcome'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE "AffiliateSupplyLifecycleTransitions"
      ALTER COLUMN "outcome" TYPE "AffiliateSupplyLifecycleOutcome"
      USING CASE
        WHEN "outcome" IS NULL THEN NULL
        ELSE "outcome"::text::"AffiliateSupplyLifecycleOutcome"
      END;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AffiliateSupplyLifecycleTransitions'
      AND column_name = 'command'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE "AffiliateSupplyLifecycleTransitions"
      ALTER COLUMN "command" TYPE "AffiliateSupplyLifecycleCommand"
      USING "command"::text::"AffiliateSupplyLifecycleCommand";
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AffiliateSupplyLifecycleTransitions'
      AND column_name = 'actorKind'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE "AffiliateSupplyLifecycleTransitions"
      ALTER COLUMN "actorKind" DROP DEFAULT;
    ALTER TABLE "AffiliateSupplyLifecycleTransitions"
      ALTER COLUMN "actorKind" TYPE "AffiliateSupplyLifecycleActorKind"
      USING "actorKind"::text::"AffiliateSupplyLifecycleActorKind";
  END IF;
END $$;
