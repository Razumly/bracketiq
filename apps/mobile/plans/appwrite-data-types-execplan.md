# Sync Appwrite data models with latest schema

This ExecPlan is a living document and must be maintained per PLANS.md at the repository root. It captures all context needed for a new contributor to align our Kotlin data types and serializers with the latest Appwrite export in `/home/camka/Projects/MVP/mvpDatabase/appwrite.config.json`.

## Purpose / Big Picture

The current Kotlin models under `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes` no longer match the Appwrite schema. Aligning them prevents serialization bugs, broken queries, and runtime crashes when reading or writing rows. After this work the app should serialize, deserialize, and cache Appwrite data (including the invite table that uses row security) without manual schema tweaks.

## Progress

- [x] (2025-12-15 18:47Z) Compared Appwrite schema to existing models/DTOs and listed gaps.
- [ ] Update existing entities/DTOs (Event, Match, Field, Team, UserData, Organization, RefundRequest, TimeSlot) to match column names and types.
- [ ] Add missing entities/DTOs for readable or row-secured tables: Invites (rowSecurity true), Products, Subscriptions, Bills, BillPayments.
- [ ] Update constants/table ids and Room schema/migrations to cover new/changed entities.
- [ ] Add/adjust tests or lightweight serialization checks; run composeApp common/Android tests.

## Surprises & Discoveries

- Appwrite table id for teams is `volleyBallTeams` (capital B) but `DbConstants.VOLLEYBALL_TEAMS_TABLE` uses `volleyballTeams`.
- Events now store monetary amounts as integers (cents) and include payment-plan fields (`allowPaymentPlans`, `installment*`, `allowTeamSplitDefault`) plus `refereeIds`.
- Several tables (invites, billing artifacts, stripe accounts, products/subscriptions, lockFiles, divisions) have no corresponding Kotlin models or serializers; with updated permissions, invites remain row-secured and readable, products/subscriptions/bills/billPayments now allow reads for users (or guests for products), while stripeAccounts, paymentIntents, lockFiles, and divisions still have no read access and stay out of scope.
- Android Room builder disables destructive migration, so entity shape changes require a version bump and migration or intentional destructive strategy.

## Decision Log

- Decision: Keep model field names aligned exactly to Appwrite column keys (e.g., `matchId`, `refereeId`, `profileImageId`) and use explicit DTOs for wire format to isolate internal renames if needed.
  Rationale: Prevent silent serialization failures and keep repository calls using `TablesDB` simple.
  Date/Author: 2025-12-15 Codex
- Decision: Represent currency columns from Appwrite (`priceCents`, `totalAmountCents`, `amountCents`, event `price`) as `Int` in DTOs/models; where UI uses dollars, convert at boundaries.
  Rationale: Matches Appwrite integer storage and avoids rounding drift.
  Date/Author: 2025-12-15 Codex
- Decision: Limit new model additions to tables with read access (any/guests/users) or row security. Invites (rowSecurity true) stay in scope; products/subscriptions/bills/billPayments move into scope due to read permissions; stripeAccounts, paymentIntents, lockFiles, and divisions remain excluded because they still lack read access and row security.
  Rationale: Model only resources the client can read with current permissions to avoid dead code.
  Date/Author: 2025-12-15 Codex

## Outcomes & Retrospective

To be filled after implementation and validation.

## Context and Orientation

Shared Kotlin models and DTOs live under `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes` and `.../dtos`. Repositories use these with `io.appwrite.services.TablesDB` to serialize/deserialize rows. Room entities are declared in `DatabaseService.kt` (version 79) and instantiated via `RoomDBModule.android.kt` / `RoomDBModule.ios.kt`. The latest Appwrite export defines tables: fields, matches, divisions, userData, invites, volleyBallTeams, messages, chatGroup, lockFiles, paymentIntents, bills, billPayments, refundRequests, stripeAccounts, events, organizations, products, subscriptions, timeSlots, leagueScoringConfigs, sports. Major mismatches today (with scope limited to readable or row-secured tables):
- Field lacks lat/long/heading/name/type/rentalSlotIds/location/organizationId and still has `matches`.
- Match uses `matchNumber`, `team1`, `team2`, `refId`, `field` instead of `matchId`, `team1Id`, `team2Id`, `refereeId`, `fieldId`, and is missing `side`, `teamRefereeId`, `refereeCheckedIn`.
- UserData stores `teamInvites`, `eventInvites`, `profileImage` (url) but schema only provides `profileImageId` and no invite arrays.
- RefundRequest omits `organizationId`/`status` and adds `isTournament` not present in schema.
- Event uses `Double` price and extra `winnerScoreLimitsPerSet`, `loserScoreLimitsPerSet`, `isTaxed`; missing `refereeIds`, payment-plan fields, and uses `List<Double>` for `coordinates` instead of `point`.
- Organization misses `productIds` and treats `ownerId` optional.
- Team lacks `sport` and `profileImageId`; table id casing mismatch.
- No Kotlin models exist for invites, products, subscriptions, bills/billPayments (all now in scope); tables without read access or row security (stripeAccounts, paymentIntents, lockFiles, divisions) remain out of scope per permissions constraints.

## Plan of Work

Describe the edits in order to deliver a working alignment:
1) Update existing entities and DTOs to mirror Appwrite columns and types. For Field, MatchMVP/MatchDTO, UserData/UserDataDTO, Team/TeamDTO, RefundRequest/RefundRequestDTO, Organization/OrganizationDTO, TimeSlot/DTO, and Event/EventDTO ensure property names and nullability match the export; remove fields not in schema (e.g., match `team1` strings, event score limit lists) and add new ones with sensible defaults. Adjust price fields to integers and update coordinate representation to match Appwrite `point` (document how to serialize/deserialize, likely as two-element array or structured object). Add new optional lists/ids (refereeIds, payment plan arrays). Bump Room entity version and supply migration or explicit destructive behavior per platform policy.
2) Add Kotlin data classes plus DTO conversions only for in-scope missing tables: Invite (type, email, status, event/organization/team/user ids, createdBy, names), Product (name, description, priceCents, period, organizationId, createdBy, isActive, createdAt, stripe ids), Subscription (productId, userId, organizationId, startDate, priceCents, period, status, stripeSubscriptionId), Bill (ownerType/ownerId, amounts, links, booleans, status fields), BillPayment (billId, sequence, dueDate, amount, status, paidAt, paymentIntentId, payerUserId). Document exclusions for tables lacking read access and row security (stripeAccounts, paymentIntents, lockFiles, divisions).
3) Update constants in `core/util/Constants.kt` to reflect actual table ids (volleyBallTeams) and add constants for new tables/attributes used in repositories. Remove stale ones if unused (e.g., addresses) or document deprecation.
4) Wire repositories or new helpers to use the updated models: adjust EventRepository, TeamRepository, BillingRepository, UserRepository, and any mappers to new field names (e.g., `matchId`, `refereeId`, `profileImageId`, int price). Introduce mapping helpers for currency conversions if UI expects dollars.
5) Update Room schema version and migrations to handle entity field changes/additions. Decide per platform whether to use destructive migration or provide migration scripts; validate compile-time schema generation if applicable.
6) Add lightweight serialization/round-trip tests in `composeApp/src/commonTest` to decode sample payloads mirroring Appwrite config for updated/new DTOs. Run existing test suites to ensure regressions are caught.

## Concrete Steps

1) Inspect latest schema (already captured above) to model column names and required/optional types; keep a copy of key column sets for coding.
2) Edit models/DTOs under `composeApp/src/commonMain/.../dataTypes` and `.../dtos` per Plan of Work step 1.
3) Add new data classes/DTOs for in-scope missing tables (Invite, Product, Subscription, Bill, BillPayment) under `dataTypes`/`dtos` with @Serializable annotations and conversion helpers; explicitly leave excluded tables undocumented in code per permission limits.
4) Adjust `core/util/Constants.kt` for table ids and any new attribute constants needed by repositories.
5) Update repositories to use new field names and price handling; adjust any UI mappings that rely on removed fields.
6) Bump Room database version in `DatabaseService.kt` and add migration or opt for destructive migration policy consistent with platform modules.
7) Run validation commands from repo root:
    ./gradlew :composeApp:commonTest
    ./gradlew :composeApp:androidUnitTest
   Add focused serializer tests if needed.

## Validation and Acceptance

Work is complete when:
- All data classes/DTOs match Appwrite column names, types, and default nullability; removed fields are eliminated.
- New in-scope tables (Invite, Product, Subscription, Bill, BillPayment) have corresponding @Serializable models with DTOs ready for TablesDB operations; excluded tables without read access remain untouched and documented.
- Constants reflect actual Appwrite ids (e.g., `volleyBallTeams`) and repositories compile using updated names and currency units.
- Room schema version updates build successfully on Android/iOS; migrations or destructive strategy is documented and verified to allow app launch.
- Serializer tests decode/encode sample payloads matching `appwrite.config.json` without errors; unit suites pass (`commonTest`, `androidUnitTest`).

## Idempotence and Recovery

Model/DTO edits are source-controlled and safe to rerun. If migrations fail, fallback to destructive migration must be explicit and documented in platform Room builders. Keep backups of existing data when testing migrations on devices/emulators. Running the validation commands multiple times should yield consistent results once schema alignment is complete.

## Artifacts and Notes

- Key schema references:
  Fields: fieldNumber (int), divisions [string], lat/long/heading (double), inUse (bool), name/type (string), rentalSlotIds [string], location (string), organizationId (string).
  Matches: start/end (datetime), division (string), team1Points/team2Points/setResults [int], side (string), matchId (int), losersBracket (bool), winnerNextMatchId/loserNextMatchId/previousLeftId/previousRightId (string), refereeCheckedIn (bool), refereeId/team1Id/team2Id/eventId/fieldId/teamRefereeId (string).
  Events: name, start, end, location, imageId, hostId, price (int cents), teamSizeLimit, coordinates (point), numerous optional lists/ids including refereeIds, payment-plan fields (allowPaymentPlans, installmentCount/installmentDueDates/installmentAmounts, allowTeamSplitDefault).
  Identity: invites (type/email/status plus event/org/team/user linkage, createdBy, first/last name).
  Billing & subscriptions: products (name, description, priceCents, period, org linkage, status, stripe ids), subscriptions (product/user/org linkage, startDate, priceCents, period, status, stripeSubscriptionId), bills (owner linkage, totals, payment-plan flags), billPayments (bill linkage, sequence, dueDate, amountCents, status, paidAt, paymentIntentId, payerUserId).
  Sensitive user: userId, email.
  Out-of-scope (no read access, rowSecurity false): stripeAccounts, paymentIntents, lockFiles, divisions.

## Interfaces and Dependencies

- Update existing interfaces: Event/EventDTO/Repository (int price, payment-plan fields, refereeIds, point coords), MatchMVP/MatchDTO (`matchId`, team ids, referee ids, side, set result arrays), Field (lat/long/heading/name/type/rentalSlotIds/location/organizationId), UserData (`profileImageId`, drop invite arrays or map to invites table), Team (`sport`, `profileImageId`, correct table id), Organization (`productIds`, ownerId required, point coords), RefundRequest (`organizationId`, `status`, no isTournament), TimeSlot (nullable ints where schema allows).
- New serializable model + DTO for Invite (row-secured) with clear property names matching schema.
- Constants in `core/util/Constants.kt` for new table ids; ensure repositories and Realtime channel strings use updated casing.
