# Add Division-Level Payment Plans with Event-Level Defaults (Mobile)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at repository root and must remain compliant with its requirements.

## Purpose / Big Picture

Mobile event edit/join flows need parity with web/backend for split-by-division payment behavior: division-specific payment plans should be used when `singleDivision=false`, while event-level payment settings remain editable defaults for new divisions. After this change, mobile model mapping, event edit UI, and join billing paths align with that contract.

## Progress

- [x] (2026-02-23 21:15Z) Audited current mobile event/payment-plan logic in `EventDetails`, `EventDetailComponent`, and DTO mappings.
- [x] (2026-02-23 21:22Z) Created this ExecPlan before implementation.
- [ ] Extend `DivisionDetail` and DTO mapping to include payment-plan fields.
- [ ] Update event edit UI to edit per-division payment plans and keep event-level defaults in multi-division mode.
- [ ] Update payment-plan validation to validate division-level plans when split-by-division.
- [ ] Update join billing path to resolve effective division price/payment-plan fields.
- [ ] Run targeted Gradle tests and capture evidence.

## Surprises & Discoveries

- Observation: Join billing and payment-plan creation currently read only event-level `priceCents`/installments.
  Evidence: `startPaymentPlanForOwner` in `eventDetail/EventDetailComponent.kt` uses `event.priceCents` and `event.installment*` directly.

## Decision Log

- Decision: Keep event-level payment-plan fields as defaults and source for single-division mode only; when multi-division, validate/use selected division payment-plan values.
  Rationale: This matches requested behavior and avoids silent cross-division charging mistakes.
  Date/Author: 2026-02-23 / Codex

## Outcomes & Retrospective

Implementation in progress; final outcomes and validation evidence will be appended after code/test completion.

## Context and Orientation

Mobile event data models are in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes`. API DTO conversion is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`. Event edit UI is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`. Join/payment actions are in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` and billing API calls in `core/data/repositories/BillingRepository.kt`.

## Plan of Work

First extend `DivisionDetail` and DTO normalization/serialization so division payment-plan fields round-trip from backend. Next update `EventDetails` UI/editor state so division settings include payment-plan controls and default seeding from event-level fields. Then update payment-plan validation to check event-level fields only in single-division mode and division-level fields in multi-division mode. Finally update join/payment-plan initiation to resolve selected division effective pricing/installments for billing API calls.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-app`:

1. Edit `DivisionDetail`, DTO mapping, and normalization helpers.
2. Edit `EventDetails.kt` UI/editor state + validation.
3. Edit `EventDetailComponent.kt` and `BillingRepository.kt` for effective division pricing.
4. Run targeted Gradle tests.

## Validation and Acceptance

Acceptance is met when:

1. Mobile can deserialize/serialize division payment-plan fields without data loss.
2. Event edit mode shows event-level payment settings as defaults in multi-division mode and applies them to newly created divisions.
3. Multi-division join/payment-plan actions use selected division price/installments.
4. Targeted tests pass.

## Idempotence and Recovery

All changes are additive. If Gradle task cache/state causes flaky failures, rerun with targeted test task and verify deterministic pass/fail before broad test runs.

## Artifacts and Notes

Validation output will be appended after implementation.

## Interfaces and Dependencies

No new dependencies; only existing KMP shared modules and repository APIs are modified.

Revision note (2026-02-23 / Codex): Initial plan created prior to implementation for this cross-platform behavior change.
