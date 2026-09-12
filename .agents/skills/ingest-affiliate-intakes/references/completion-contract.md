# Affiliate intake completion contract

## Boundaries

An intake is evidence, not an organization or candidate. A mapping job is a leased unit of work. A review-ready result is not approved, published, or training-eligible.

Use only stored artifacts unless a required page is absent and the active user has authorized another capture. Respect robots and policy evidence. Never bypass access controls.

Supported target kinds are `EVENT`, `RENTAL`, and `CLUB`. Do not create `TEAM` mappings or affiliate teams.

## Required organization package

Every successful checkpoint must contain:

1. A canonical organization ID and idempotent setup code.
2. Source organization fields supported by evidence: name, official website,
   description, sports, the best defensible location, and valid non-zero
   `[longitude, latitude]` coordinates. Prefer a street address. When it is
   unavailable, persist and geocode the most specific supported city or region.
3. A disabled affiliate source and unvalidated mapping or reviewed custom extractor.
4. Official action URLs and source provenance.
5. An official logo reference normalized to an opaque 1024 by 1024 asset, or an
   explicit `MANUAL_REVIEW` result that records the logo evidence gap for the
   independent reviewer. Logo absence does not invalidate the rest of the package.
6. Focused tests and stored-fixture extraction evidence.
7. Two review scrapes proving stable, duplicate-safe accepted output and stable
   candidate-level rejection summaries.
8. A source registry note and a source-scoped commit.
9. A compact result JSON submitted through the governed mapping completion
   boundary.

For a source-only package, validation means focused source tests, targeted
ESLint for authored TypeScript, two successful disposable review scrapes,
duplicate-safety evidence, and scoped diff checks. Do not run the full-project
`npx tsc --noEmit` command. Require that command only when an explicitly
authorized change touches a shared importer contract, route contract, or public
application code outside the source package.

## Candidate checks

Inspect at least five candidates when five exist, plus every produced kind. Check title, official URL, schedule/date display, sport, tags, divisions, price, venue, address, city, and coordinates or geocoding inputs.

Every candidate `sportName` or `sportNames` entry and every source-organization sport must equal a
name in the claim's injected `sportsCatalog` snapshot and be covered by the
resolved union of v2 `sportDeterminations`. The catalog snapshot is persisted
by the shared claim/export/context service before evidence inspection. Do not
use `DEFAULT_SPORTS`, compiled aliases, the former two-argument validator,
discovery `sportHints`, campaign metadata, organization names, URL tokens, or
a bare generic family word as authority.

Select a canonical name only when stored first-party evidence establishes the
surface or format. Use this matrix as mandatory guidance, never as keyword
substitution:

| Stored first-party evidence | Result |
|---|---|
| outdoor/grass/field soccer with the surface expressly established | `Grass Soccer` |
| indoor/arena/boarded-field soccer, or expressly indoor soccer | `Indoor Soccer` |
| futsal rules or futsal court | `Futsal` |
| sand/beach soccer | `Beach Soccer` |
| only `Soccer`, with no usable surface evidence | `SPORT_VARIANT_UNRESOLVED` |
| indoor/gym/hard-court volleyball | `Indoor Volleyball` |
| sand/beach volleyball | `Beach Volleyball` |
| grass/outdoor-field volleyball | `Grass Volleyball` |
| only `Volleyball`, with no usable surface evidence | `SPORT_VARIANT_UNRESOLVED` |
| an evidenced sport family with no exact catalog entry | `SPORT_NOT_IN_CATALOG` |
| an exact blacklisted activity | `BLACKLISTED`; omit from executable sports and preserve evidence |

Every determination requires exact source labels, rationale, and at least one
artifact-owned citation. A blacklisted activity remains excluded even if it is
in the injected catalog. Multiple explicitly evidenced surfaces may resolve
to multiple names.

For governed source-scope repairs, follow the `sourceSportScope` and plural
sport-field rules in the main skill. The package scope hash and complete
retained sport union must match the claim at validation and commit.

Resolve organization location separately from event location. A missing street
address is not an organization defect when first-party content, stored intake
discovery context, or a parent directory supports a city, locality, metro, or
region. Persist the most specific defensible value, normalize US cities to
`City, ST` when the state is known, and geocode it through the server-side
Google Places path. City or region centroid coordinates are valid for the
organization. Record the fallback evidence in source metadata or notes. Do not
leave a defensible organization locality or its coordinates null, and do not
invent a street address. Conflicting locality evidence requires human review.

Compare every organization description and the inspected event descriptions
with stored first-party evidence. Use the site's own wording, terminology,
meaning, and tone. Do not explain what the agent found. Keep provenance in
`sourceEvidence`, registry notes, and review artifacts instead of public copy.
Select prose without navigation or repeated headings. Do not rewrite valid
source wording only to remove a repeated event name.

Governed EVENT and CLUB packages require a source-backed `description`
selector. Missing prose and discovery narration are package defects.
An applicable source program paragraph may serve related events when it
accurately describes their activity. Do not invent a fallback or use schedule
or status notes. Report an evidence gap when no suitable source prose can be
selected from the claimed HTML.

For every multi-division event, prove that the divisions are grouped under the
correct parent event and did not leak across adjacent cards, dates, venues, or
detail pages. Preserve each source-stated division label as its display `name`
and select our structured `gender` (`M`, `F`, `C`), `ratingType` (`AGE` or
`SKILL`), `divisionTypeId`, `skillDivisionTypeId`, and `ageDivisionTypeId`
separately from that label using the canonical sport catalog. Use Coed only
when the source says coed/mixed or does not specify gender; preserve ambiguous
source text and flag it for review instead of guessing.

Every accepted `EVENT` must have at least one valid division. A valid division
has a source-supported display `name`, `gender` in `M`, `F`, or `C`,
`ratingType` in `AGE` or `SKILL`, and non-empty `divisionTypeId`,
`skillDivisionTypeId`, and `ageDivisionTypeId`. A package with a divisionless
event or an incomplete division cannot use `REVIEW_REQUIRED`. Exclude and log
only the affected event when evidence cannot support the required division.

Keep each source price and capacity on the division that owns it. Do not
average, copy, or collapse per-division prices. Use a numeric event-level
fallback only for a genuinely single-price or single-division event; derive a
compact event price range when division prices differ, and keep fee caveats in
the details text.

For each event with an evidenced address, venue, or facility, run the normal
server-side Google Places resolver. Coordinates must contain finite longitude
then latitude, remain within geographic bounds, and must not equal `[0, 0]`.
City-only event text is not a sufficient map location.

An event may use the canonical source organization's location only when stored
evidence supports that the event occurs there. Record that decision on the
candidate with `locationSource: "SOURCE_ORGANIZATION"` plus a non-empty
`locationEvidence` note. A shared owner, nearby venue, directory parent, or city
match is not evidence. Never use one event venue as another event's fallback.

The scrape must exclude an event when its event-specific location cannot be
resolved or when it has neither an event location nor an evidence-backed source
organization fallback. Record the title and reason in the scrape run. These
candidate-level rejections do not invalidate an otherwise correct organization,
source, mapping, logo, or duplicate-safe package. A package is not
`REVIEW_REQUIRED` if bad events were persisted as candidates or targets, or if
the rejection log is missing.

Never infer a year for an ambiguous event date. Never convert a stale tryout, evaluation, deadline, or registration page into a current event. Use evergreen rows only for stable ongoing programs with explicit `NO_FIXED_DATE` or `ONGOING` display.

## Datetime remediation result

When the claimed job contains `repairContext.remediationContext =
event-datetime-v1`, a `REVIEW_REQUIRED` result must include the compact
`dateTimeReview` object accepted by `affiliateEventDateTimeReviewSchema`. Its
`contractRevision` is `event-datetime-v1`, and its `candidateCount` equals the
two review-scrape candidate counts. Report count maps for `timeZoneEvidence`
(`SOURCE_FIELD`, `COORDINATES`, `EXPLICIT_OFFSET`, `NONE`), `startPrecision`
(`DATE_TIME`, `DATE_ONLY`, `NONE`), `endDerivation` (`EXPLICIT_END`,
`EXPLICIT_DURATION`, `NONE`), and `displayModeCounts` (`SCHEDULED`,
`DATE_ONLY`, `NO_FIXED_DATE`, `ONGOING`). Also report `durationWarnings`, a
passing `utcHostRegression` comparison between `TZ=UTC` and a non-UTC host,
every `evergreenTransitions` entry, and `evergreenEvidence`.

`evergreenEvidence.scheduleTextBacked` must cover every evergreen row.
`hiddenDatedOccurrences` and `tryoutOrEvaluationMarkedEvergreen` must be zero.
Use `repairReasonCodes` for concrete datetime defects. The supported codes are
`EVENT_DATETIME_START_INVALID`, `EVENT_DATETIME_TIMEZONE_INVALID`,
`EVENT_DATETIME_END_INVALID`, `EVENT_DATETIME_DURATION_INVALID`,
`EVENT_DATETIME_DATE_ONLY_INVALID`, `EVENT_DATETIME_HOST_TIMEZONE_DEPENDENT`,
`EVENT_DATETIME_EVERGREEN_OCCURRENCE`, and
`EVENT_DATETIME_TRYOUT_EVERGREEN`. Detailed evidence stays in the source
fixture and package report so the result stays below one MiB.

Rentals create facilities/resources rather than fake events. Clubs create public-organization candidates only after review. Direct club setups must link the candidate to the canonical source organization, not a generated duplicate.

## Logo checks

Prefer stored logo candidates, page branding, page images, HTML/CSS references, metadata, and screenshots. Use a favicon only when it is the best recognizable official mark.

Normalize official artwork without inventing a new identity. Use a full-canvas opaque background, preserve aspect ratio, and verify card, detail, list icon, and map marker fit. If no official mark can be verified, record `MANUAL_REVIEW`, list the evidence inspected, and leave acceptance to the independent reviewer. Do not fail the mapping package for logo absence alone.

When a claimed job has `repairContext.repairReason = MANUAL_LOGO_REVIEW`, the
producer must perform a fresh evidence pass over every stored logo, branding,
image, screenshot, HTML/CSS, metadata, and favicon artifact. A repaired result
requires a new commit and `OFFICIAL_ASSET` or `OFFICIAL_SCREENSHOT_CROP` backed
by stable stored evidence. If all candidates remain insufficient, report the
exact inspected artifacts and keep the package unpublishable rather than
fabricating a logo. Complete the package with the unchanged `MANUAL_REVIEW`
disposition so the reviewer can explicitly accept the absence.
When `lastRunId` points to a supplemental approval run, inspect its official
page artifacts and reviewer-verified `LOGO_CANDIDATE` first. The reviewer only
adds evidence; the producer must still visually verify, normalize, fit-test,
wire, and commit the official mark.

## Result states
Use `REVIEW_REQUIRED` only when the package, tests, and validation artifacts
exist. Use `HUMAN_REVIEW_REQUIRED` for `VARIANT_UNRESOLVED`, `UNSUPPORTED`, or
`BLACKLISTED` determinations that stop package authoring; include exact
preserved source labels, artifact citations, and the matching
`SPORT_VARIANT_UNRESOLVED`, `SPORT_NOT_IN_CATALOG`, or `SPORT_BLACKLISTED`
reason code. A non-sport human review must use empty sport labels and no sport
reason code. Do not create an approval job for these results. Use `EXPANDED`
only when a directory intake has produced at least one accepted, reused, or
already-known official organization URL through the governed URL-intake
command. Use `FAILED` for a claimed intake that cannot be mapped or expanded
safely.

Do not let failed or blocked rows prevent queue exhaustion. Do not turn them into positive training examples.

## Producer repair contract

A claimed `repairContext` contains the prior review's complete machine-readable
reason set, rationale, and blocking issues. A repaired package must address all
of them in a new source-scoped commit and include a focused regression test for
the defect. Do not resubmit after fixing only the first reason.

When the defect reveals a general failure mode missing from the repo-backed
ingestion skill or this contract, add a generalized prevention rule there in
the same commit. Keep source-specific evidence in the fixture, result artifact,
and repair history rather than the shared skill. Existing rules should be
clarified only when the review demonstrated that they were ambiguous; never
weaken a gate to make a package pass.

Three automatic producer repair passes are available. Another independent
rejection marks the job `HUMAN_REVIEW_REQUIRED`, which is terminal and cannot be
claimed by the mapping agent. A producer must not manually reset or bypass that
state.

## Directory expansion contract

Directory proposals must be written to a JSON file and submitted with the exact command supplied by the active goal. The command writes the schema-validated `EXPANDED` result file named by `--result`; pass that file to the normal mapping-completion command without hand-editing it. The proposal file shape is:

    {
      "schemaVersion": 1,
      "parentJobId": "claimed mapping job id",
      "parentIntakeId": "claimed directory intake id",
      "proposals": [
        {
          "url": "https://official-club.example/",
          "organizationName": "Official Club",
          "region": "Portland, Oregon",
          "targetKindHints": ["CLUB"],
          "sportHints": ["Soccer"],
          "evidenceUrl": "https://stored-directory.example/clubs",
          "depth": 1
        }
      ]
    }

Every `evidenceUrl` must be a page in the parent intake. `depth` is one for an official site found in the claimed directory and two for an official site reached through one child directory. Depth greater than two, a parent self-link, a `TEAM` target, or a URL without stored evidence is rejected. The command may create review-required intakes, but it queues capture only for domains with a current `ALLOWED` policy. Do not edit the domain policy to make a batch proceed.

An `EXPANDED` completion result has no branch, commit, generated paths, candidates, logo, or review scrapes. It includes the enqueue summary under `directoryExpansion` and uses `MANUAL_REVIEW` as the non-applicable logo disposition. Directory-expansion results are terminal queue bookkeeping and must be excluded from positive mapping training data.

## Final stopping condition

Run:

    npm run affiliate:mapping:queue-status -- --live

The goal is complete only when:

    claimableJobs = 0
    eligibleReadyIntakesWithoutJob = 0
    claimedWithoutLease = 0
    queuedCaptureRuns = 0
    runningCaptureRuns = 0

When capture runs remain, process them with the exact intake-processing command supplied by the goal and then check queue status again. Active mapping leases owned by another worker are not available work. Report them separately and do not steal them before expiry.
## Current claim, completion, and reconciliation rules

The mapper cannot inspect evidence or complete until the shared claim-evidence
service has persisted one exact intake/run, the full validated catalog
snapshot, and `{ jobId, workerId, claimedAt }`. Completion verifies citation
artifact ownership and normalized excerpts, catalog freshness, determination
coverage, exact candidate/organization sport equality, and human-resolution
one-to-one coverage before its conditional terminal update. A stale catalog
returns the exact claim to `QUEUED` for re-export; a stale generation performs
no write.

`REVIEW_REQUIRED` is not approval. The mapper must not apply packages live,
approve mappings, publish candidates, enable recurring scraping, or use an
operator id as authority. New approval completion is schema v2 and owns live
application inside its exact approval claim generation. Existing v1 records
are parse-only history and cannot authorize new approval.

Historical sport reconciliation is dry-run-first and requires the reviewed
expected count and selection hash for apply. It requeues only the same eligible
terminal identity-less job, preserves hash-linked prior history, writes no
candidates, and is idempotent. Stop and preflight every mapper, reviewer,
coverage, and separate model-controller queue writer before requeue or restart.

Revision note (2026-08-10): Replaced static catalog and generic-label
authority with claim-bound evidence-backed determinations, v2 completion,
approval-only application, reconciliation guards, and stopped-fleet rules.
