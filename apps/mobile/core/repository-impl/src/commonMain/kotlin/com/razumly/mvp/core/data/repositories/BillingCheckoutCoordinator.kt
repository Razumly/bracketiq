package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.BillingEventRefDto
import com.razumly.mvp.core.network.dto.BillingRentalSelectionDto
import com.razumly.mvp.core.network.dto.BillingTeamRefDto
import com.razumly.mvp.core.network.dto.BillingTimeSlotRefDto
import com.razumly.mvp.core.network.dto.BillingUserRefDto
import com.razumly.mvp.core.network.dto.InclusivePriceQuoteRequestDto
import com.razumly.mvp.core.network.dto.InclusivePriceQuoteResponseDto
import com.razumly.mvp.core.network.dto.PurchaseIntentRequestDto

private const val MAX_INCLUSIVE_PRICE_CENTS = 100_000_000

/** Owns billing quotes, discount previews, and event/team checkout intent creation. */
internal class BillingCheckoutCoordinator(
    private val api: MvpApiClient,
    private val userRepository: IUserRepository,
) {
    suspend fun quoteInclusivePrice(
        direction: InclusivePriceQuoteDirection,
        amountCents: Int,
        eventType: String?,
    ): Result<InclusivePriceQuote> = runCatching {
        require(amountCents in 0..MAX_INCLUSIVE_PRICE_CENTS) {
            "Inclusive price amount must be between 0 and $MAX_INCLUSIVE_PRICE_CENTS cents."
        }
        val normalizedEventType = eventType?.trim()?.takeIf(String::isNotBlank)
        require(normalizedEventType == null || normalizedEventType.length <= 100) {
            "Inclusive price event type must be at most 100 characters."
        }

        api.post<InclusivePriceQuoteRequestDto, InclusivePriceQuoteResponseDto>(
            path = "api/billing/inclusive-price-quote",
            body = InclusivePriceQuoteRequestDto(
                direction = direction.name,
                amountCents = amountCents,
                eventType = normalizedEventType,
            ),
        ).toValidatedQuote(
            requestedDirection = direction,
            requestedAmountCents = amountCents,
        )
    }

    suspend fun createPurchaseIntent(
        event: Event,
        teamId: String?,
        priceCents: Int?,
        timeSlotContext: PurchaseIntentTimeSlotContext?,
        occurrence: EventOccurrenceSelection?,
        divisionId: String?,
        answers: Map<String, String>,
        discountCode: String?,
    ): Result<PurchaseIntent> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val effectivePriceCents = (priceCents ?: timeSlotContext?.priceCents)
            ?.takeIf { value -> value >= 0 }
            ?: throw IllegalArgumentException("Set a price for this division before checkout.")
        val normalizedTeamId = teamId?.trim()?.takeIf(String::isNotBlank)
        val normalizedDivisionId = divisionId?.trim()?.takeIf(String::isNotBlank)

        if (timeSlotContext == null) {
            AnalyticsTracker.capture(
                AnalyticsEvent.EventRegistrationStarted,
                buildMap {
                    put("event_id", event.id)
                    put("event_type", event.eventType.name)
                    put("registration_type", normalizedTeamId?.let { "team" } ?: "self")
                    put("amount_cents", effectivePriceCents.toString())
                    normalizedTeamId?.let { put("team_id", it) }
                    normalizedDivisionId?.let { put("division_id", it) }
                    event.organizationId?.trim()?.takeIf(String::isNotBlank)?.let { put("organization_id", it) }
                },
            )
        } else {
            AnalyticsTracker.capture(
                AnalyticsEvent.RentalCheckoutStarted,
                buildMap {
                    put("event_id", event.id)
                    put("amount_cents", effectivePriceCents.toString())
                    timeSlotContext.scheduledFieldId?.trim()?.takeIf(String::isNotBlank)?.let { put("field_id", it) }
                    event.organizationId?.trim()?.takeIf(String::isNotBlank)?.let { put("organization_id", it) }
                },
            )
        }

        val normalizedRentalSelections = timeSlotContext?.rentalSelections.orEmpty().map { selection ->
            val scheduledFieldIds = selection.scheduledFieldIds
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct()
            require(scheduledFieldIds.isNotEmpty()) {
                "Every rental selection must include at least one field."
            }
            val startDate = selection.startDate.trim()
            val endDate = selection.endDate.trim()
            require(startDate.isNotBlank() && endDate.isNotBlank()) {
                "Every rental selection must include a start and end time."
            }
            BillingRentalSelectionDto(
                key = selection.key?.trim()?.takeIf(String::isNotBlank),
                scheduledFieldIds = scheduledFieldIds,
                dayOfWeek = selection.dayOfWeek,
                daysOfWeek = selection.daysOfWeek.distinct(),
                startTimeMinutes = selection.startTimeMinutes,
                endTimeMinutes = selection.endTimeMinutes,
                startDate = startDate,
                endDate = endDate,
                timeZone = selection.timeZone?.trim()?.takeIf(String::isNotBlank),
                repeating = selection.repeating,
            )
        }

        val response = api.post<PurchaseIntentRequestDto, PurchaseIntent>(
            path = "api/billing/purchase-intent",
            body = PurchaseIntentRequestDto(
                user = BillingUserRefDto(id = user.id, email = email),
                event = BillingEventRefDto(
                    id = event.id,
                    eventType = event.eventType.name,
                    priceCents = effectivePriceCents,
                    hostId = event.hostId,
                    organizationId = event.organizationId,
                ),
                team = normalizedTeamId?.let { BillingTeamRefDto(id = it) },
                divisionId = normalizedDivisionId,
                timeSlot = timeSlotContext?.let { context ->
                    val normalizedScheduledFieldIds = context.scheduledFieldIds
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .distinct()
                    val normalizedScheduledFieldId = context.scheduledFieldId
                        ?.trim()
                        ?.takeIf(String::isNotBlank)
                        ?: normalizedScheduledFieldIds.firstOrNull()
                    BillingTimeSlotRefDto(
                        id = context.id?.trim()?.takeIf(String::isNotBlank),
                        priceCents = context.priceCents,
                        startDate = context.startDate?.trim()?.takeIf(String::isNotBlank),
                        endDate = context.endDate?.trim()?.takeIf(String::isNotBlank),
                        scheduledFieldId = normalizedScheduledFieldId,
                        scheduledFieldIds = normalizedScheduledFieldIds,
                        hostRequiredTemplateIds = context.hostRequiredTemplateIds
                            .map(String::trim)
                            .filter(String::isNotBlank)
                            .distinct(),
                    )
                },
                rentalSelections = normalizedRentalSelections,
                slotId = occurrence?.slotId?.trim()?.takeIf(String::isNotBlank),
                occurrenceDate = occurrence?.occurrenceDate?.trim()?.takeIf(String::isNotBlank),
                discountCode = discountCode?.trim()?.takeIf(String::isNotBlank),
                answers = answers.toBillingRegistrationQuestionAnswerDtos(),
            ),
        )

        if (!response.error.isNullOrBlank()) throw Exception(response.error)
        AnalyticsTracker.capture(
            AnalyticsEvent.CheckoutStarted,
            buildMap {
                put("checkout_type", timeSlotContext?.let { "rental" } ?: "event_registration")
                put("event_id", event.id)
                put("event_type", event.eventType.name)
                put("amount_cents", effectivePriceCents.toString())
                normalizedTeamId?.let { put("team_id", it) }
                normalizedDivisionId?.let { put("division_id", it) }
                event.organizationId?.trim()?.takeIf(String::isNotBlank)?.let { put("organization_id", it) }
            },
        )
        response
    }

    suspend fun previewEventRegistrationDiscount(
        event: Event,
        teamId: String?,
        priceCents: Int?,
        occurrence: EventOccurrenceSelection?,
        divisionId: String?,
        discountCode: String,
    ): Result<DiscountPreview> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val effectivePriceCents = priceCents
            ?.takeIf { value -> value >= 0 }
            ?: throw IllegalArgumentException("Set a price for this division before previewing a discount.")
        val normalizedCode = discountCode.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("Enter a discount code to apply.")
        val normalizedTeamId = teamId?.trim()?.takeIf(String::isNotBlank)
        val normalizedDivisionId = divisionId?.trim()?.takeIf(String::isNotBlank)

        val response = api.post<PurchaseIntentRequestDto, DiscountPreview>(
            path = "api/billing/discount-preview",
            body = PurchaseIntentRequestDto(
                user = BillingUserRefDto(id = user.id, email = email),
                event = BillingEventRefDto(
                    id = event.id,
                    eventType = event.eventType.name,
                    priceCents = effectivePriceCents,
                    hostId = event.hostId,
                    organizationId = event.organizationId,
                ),
                team = normalizedTeamId?.let { BillingTeamRefDto(id = it) },
                divisionId = normalizedDivisionId,
                slotId = occurrence?.slotId?.trim()?.takeIf(String::isNotBlank),
                occurrenceDate = occurrence?.occurrenceDate?.trim()?.takeIf(String::isNotBlank),
                discountCode = normalizedCode,
            ),
        )

        if (!response.error.isNullOrBlank()) throw Exception(response.error)
        response
    }

    suspend fun createTeamRegistrationPurchaseIntent(
        team: Team,
        teamRegistration: TeamPlayerRegistration?,
        discountCode: String?,
    ): Result<PurchaseIntent> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val normalizedTeamId = team.id.trim().takeIf(String::isNotBlank)
            ?: error("Team id is required for registration checkout.")

        val response = api.post<PurchaseIntentRequestDto, PurchaseIntent>(
            path = "api/billing/purchase-intent",
            body = PurchaseIntentRequestDto(
                purchaseType = "team_registration",
                user = BillingUserRefDto(id = user.id, email = email),
                team = BillingTeamRefDto(id = normalizedTeamId, name = team.name),
                teamRegistration = teamRegistration
                    ?.toTeamRegistrationCheckoutTarget(normalizedTeamId)
                    ?: BillingTeamRefDto(teamId = normalizedTeamId),
                discountCode = discountCode?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        if (!response.error.isNullOrBlank()) throw Exception(response.error)
        AnalyticsTracker.capture(
            AnalyticsEvent.CheckoutStarted,
            mapOf(
                "checkout_type" to "team_registration",
                "team_id" to normalizedTeamId,
            ),
        )
        response
    }
}
