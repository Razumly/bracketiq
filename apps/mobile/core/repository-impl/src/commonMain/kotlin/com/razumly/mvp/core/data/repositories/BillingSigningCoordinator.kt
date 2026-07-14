package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.BillingUserRefDto
import com.razumly.mvp.core.network.dto.StripeHostLinkRequestDto
import com.razumly.mvp.core.network.stripeRedirectBaseUrl
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.delay

/** Owns document-signing workflows, profile documents, and Stripe host onboarding links. */
internal class BillingSigningCoordinator(
    private val api: MvpApiClient,
    private val userRepository: IUserRepository,
) {
    suspend fun getRequiredEventSignLinks(
        eventId: String,
        signerContext: SignerContext,
        childUserId: String?,
        childUserEmail: String?,
    ): Result<List<SignStep>> = runCatching {
        try {
            val user = userRepository.currentUser.value.getOrThrow()
            val email = userRepository.currentAccount.value.getOrNull()?.email
            val response = api.post<EventSignLinksRequestDto, EventSignLinksResponseDto>(
                path = "api/events/$eventId/sign",
                body = EventSignLinksRequestDto(
                    userId = user.id,
                    userEmail = email,
                    signerContext = signerContext.apiValue,
                    childUserId = childUserId?.trim()?.takeIf(String::isNotBlank),
                    childEmail = childUserEmail?.trim()?.takeIf(String::isNotBlank),
                    redirectUrl = buildEmbeddedSigningRedirectUrl(eventId),
                ),
            )

            response.error
                ?.let(::toFriendlyBoldSignMessage)
                ?.takeIf(String::isNotBlank)
                ?.let { errorMessage -> throw Exception(errorMessage) }
            response.signLinks.filter { it.templateId.isNotBlank() }
        } catch (throwable: Throwable) {
            throw throwable.withFriendlyBoldSignMessage()
        }
    }

    suspend fun getRequiredTeamSignLinks(
        teamId: String,
        signerContext: SignerContext,
        childUserId: String?,
        childUserEmail: String?,
    ): Result<List<SignStep>> = runCatching {
        try {
            val user = userRepository.currentUser.value.getOrThrow()
            val email = userRepository.currentAccount.value.getOrNull()?.email
            val response = api.post<EventSignLinksRequestDto, EventSignLinksResponseDto>(
                path = "api/teams/$teamId/sign",
                body = EventSignLinksRequestDto(
                    userId = user.id,
                    userEmail = email,
                    signerContext = signerContext.apiValue,
                    childUserId = childUserId?.trim()?.takeIf(String::isNotBlank),
                    childEmail = childUserEmail?.trim()?.takeIf(String::isNotBlank),
                    redirectUrl = null,
                ),
            )

            response.error
                ?.let(::toFriendlyBoldSignMessage)
                ?.takeIf(String::isNotBlank)
                ?.let { errorMessage -> throw Exception(errorMessage) }
            response.signLinks.filter { it.templateId.isNotBlank() }
        } catch (throwable: Throwable) {
            throw throwable.withFriendlyBoldSignMessage()
        }
    }

    suspend fun getRequiredRentalSignLinks(
        templateIds: List<String>,
        eventId: String?,
        organizationId: String?,
    ): Result<List<SignStep>> = runCatching {
        val normalizedTemplateIds = templateIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
        if (normalizedTemplateIds.isEmpty()) return@runCatching emptyList()

        try {
            val user = userRepository.currentUser.value.getOrThrow()
            val email = userRepository.currentAccount.value.getOrNull()?.email
            val normalizedEventId = eventId?.trim()?.takeIf(String::isNotBlank)
            val response = api.post<RentalSignLinksRequestDto, EventSignLinksResponseDto>(
                path = "api/rentals/sign",
                body = RentalSignLinksRequestDto(
                    userId = user.id,
                    userEmail = email,
                    eventId = normalizedEventId,
                    organizationId = organizationId?.trim()?.takeIf(String::isNotBlank),
                    templateIds = normalizedTemplateIds,
                    redirectUrl = normalizedEventId?.let(::buildEmbeddedSigningRedirectUrl),
                ),
            )

            response.error
                ?.let(::toFriendlyBoldSignMessage)
                ?.takeIf(String::isNotBlank)
                ?.let { errorMessage -> throw Exception(errorMessage) }
            response.signLinks.filter { it.templateId.isNotBlank() }
        } catch (throwable: Throwable) {
            throw throwable.withFriendlyBoldSignMessage()
        }
    }

    suspend fun recordSignature(
        eventId: String?,
        teamId: String?,
        templateId: String,
        documentId: String,
        type: String,
        signerContext: SignerContext,
        childUserId: String?,
    ): Result<RecordSignatureResult> = runCatching {
        val userId = userRepository.currentUser.value.getOrThrow().id
        val response = api.post<RecordSignatureRequestDto, RecordSignatureResponseDto>(
            path = "api/documents/record-signature",
            body = RecordSignatureRequestDto(
                templateId = templateId,
                documentId = documentId,
                eventId = eventId,
                teamId = teamId,
                userId = userId,
                type = type,
                signerContext = signerContext.apiValue,
                childUserId = childUserId?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        if (!response.error.isNullOrBlank()) throw Exception(response.error)
        if (response.ok == false) throw Exception("Failed to record signature.")
        RecordSignatureResult(
            operationId = response.operationId?.trim()?.takeIf(String::isNotBlank),
            syncStatus = response.syncStatus?.trim()?.takeIf(String::isNotBlank),
        )
    }

    suspend fun pollBoldSignOperation(
        operationId: String,
        timeoutMillis: Long,
        intervalMillis: Long,
    ): Result<BoldSignOperationStatus> = runCatching {
        val normalizedOperationId = operationId.trim()
        require(normalizedOperationId.isNotBlank()) { "Operation id is required." }

        val effectiveTimeoutMillis = timeoutMillis.coerceAtLeast(1_000)
        val baseIntervalMillis = intervalMillis.coerceIn(2_000, 30_000)
        val startedAt = kotlin.time.Clock.System.now().toEpochMilliseconds()
        var lastStatus: BoldSignOperationStatus? = null
        var currentIntervalMillis = baseIntervalMillis
        var attempt = 0

        while (kotlin.time.Clock.System.now().toEpochMilliseconds() - startedAt <= effectiveTimeoutMillis) {
            if (attempt > 0) delay(currentIntervalMillis)
            val mapped = api.get<BoldSignOperationStatusDto>(
                path = "api/boldsign/operations/${normalizedOperationId.encodeURLQueryComponent()}",
            ).toOperationStatus()
            lastStatus = mapped

            if (mapped.isConfirmed()) return@runCatching mapped
            if (mapped.isFailed()) {
                val failureMessage = toFriendlyBoldSignMessage(mapped.error)
                    ?: "Document synchronization failed (${mapped.status})."
                throw Exception(failureMessage)
            }
            attempt += 1
            currentIntervalMillis = (currentIntervalMillis + baseIntervalMillis).coerceAtMost(30_000)
        }

        if (lastStatus != null) {
            val delayedMessage = toFriendlyBoldSignMessage(lastStatus.error)
                ?: "Document synchronization is delayed. Please try again shortly."
            throw Exception(delayedMessage)
        }
        throw Exception("Document synchronization is delayed. Please try again shortly.")
    }

    suspend fun listProfileDocuments(): Result<ProfileDocumentsBundle> = runCatching {
        val response = api.get<ProfileDocumentsResponseDto>("api/profile/documents")
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        ProfileDocumentsBundle(
            unsigned = response.unsigned.mapNotNull { document ->
                document.toProfileDocumentCardOrNull(defaultStatus = ProfileDocumentStatus.UNSIGNED)
            },
            signed = response.signed.mapNotNull { document ->
                document.toProfileDocumentCardOrNull(defaultStatus = ProfileDocumentStatus.SIGNED)
            },
        )
    }

    suspend fun createAccount(): Result<String> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val redirectBase = stripeRedirectBaseUrl.trimEnd('/')
        Napier.i(
            "Stripe host request: endpoint=/api/billing/host/connect redirectBase=$redirectBase userId=${user.id}",
            tag = "Stripe",
        )
        val onboardingUrl = api.post<StripeHostLinkRequestDto, StripeOnboardingLinkResponseDto>(
            path = "api/billing/host/connect",
            body = StripeHostLinkRequestDto(
                refreshUrl = redirectBase,
                returnUrl = redirectBase,
                user = BillingUserRefDto(id = user.id, email = email),
            ),
        ).onboardingUrl
        Napier.i("Stripe host response: endpoint=/api/billing/host/connect onboardingUrl=$onboardingUrl", tag = "Stripe")
        runCatching { userRepository.getCurrentAccount().getOrThrow() }
        onboardingUrl
    }

    suspend fun getOnboardingLink(): Result<String> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val redirectBase = stripeRedirectBaseUrl.trimEnd('/')
        Napier.i(
            "Stripe host request: endpoint=/api/billing/host/onboarding-link redirectBase=$redirectBase userId=${user.id}",
            tag = "Stripe",
        )
        api.post<StripeHostLinkRequestDto, StripeOnboardingLinkResponseDto>(
            path = "api/billing/host/onboarding-link",
            body = StripeHostLinkRequestDto(
                refreshUrl = redirectBase,
                returnUrl = redirectBase,
                user = BillingUserRefDto(id = user.id, email = email),
            ),
        ).onboardingUrl.also { onboardingUrl ->
            Napier.i(
                "Stripe host response: endpoint=/api/billing/host/onboarding-link onboardingUrl=$onboardingUrl",
                tag = "Stripe",
            )
        }
    }
}
