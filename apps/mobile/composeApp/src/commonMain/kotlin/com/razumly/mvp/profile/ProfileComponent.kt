@file:OptIn(kotlin.experimental.ExperimentalObjCName::class)

package com.razumly.mvp.profile

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.DelicateDecomposeApi
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.push
import com.arkivanov.decompose.value.Value
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillPayment
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.NotificationSettings
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Subscription
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.defaultNotificationSettings
import com.razumly.mvp.core.data.dataTypes.isPaymentPending
import com.razumly.mvp.core.data.dataTypes.isStarted
import com.razumly.mvp.core.data.dataTypes.normalizeNotificationSettings
import com.razumly.mvp.core.data.dataTypes.usesManualRegistrationPayments
import com.razumly.mvp.core.data.dataTypes.withNotificationSetting
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.repositories.FamilyChild
import com.razumly.mvp.core.data.repositories.FamilyJoinRequest
import com.razumly.mvp.core.data.repositories.FamilyJoinRequestAction
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.DiscountCode
import com.razumly.mvp.core.data.repositories.DiscountOffer
import com.razumly.mvp.core.data.repositories.DiscountTarget
import com.razumly.mvp.core.data.repositories.EventTemplateSummary
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.PushDeviceTargetDebugStatus
import com.razumly.mvp.core.data.repositories.ProfileDocumentCard
import com.razumly.mvp.core.data.repositories.ProfileDocumentType
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.network.apiBaseUrl
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.util.convertPhotoResultToUploadFile
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.Platform
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.eventDetail.DiscountCodePromptState
import io.github.aakira.napier.Napier
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import com.razumly.mvp.profile.profileDetails.ProfileDetailsComponent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.roundToInt
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin
import kotlin.native.ObjCName
import kotlin.coroutines.resume
import kotlin.time.Clock
import kotlin.time.Instant

data class ProfilePaymentPlan(
    val bill: Bill,
    val ownerLabel: String,
    val payments: List<BillPayment> = emptyList(),
    val event: Event? = null,
) {
    val isManualRegistrationBill: Boolean
        get() = event?.usesManualRegistrationPayments() == true

    val paidAmountCents: Int
        get() = bill.paidAmountCents ?: 0

    val originalAmountCents: Int
        get() = bill.originalAmountCents ?: bill.totalAmountCents

    val discountedAmountCents: Int
        get() = bill.discountedAmountCents ?: bill.totalAmountCents

    val discountAmountCents: Int
        get() = bill.discountAmountCents
            ?: (originalAmountCents - discountedAmountCents).coerceAtLeast(0)

    val remainingAmountCents: Int
        get() = (discountedAmountCents - paidAmountCents).coerceAtLeast(0)

    val processingPayment: BillPayment?
        get() = payments
            .sortedBy { it.sequence }
            .firstOrNull { it.status.equals("PROCESSING", ignoreCase = true) }

    val failedPayment: BillPayment?
        get() = payments
            .sortedBy { it.sequence }
            .firstOrNull { it.status.equals("FAILED", ignoreCase = true) }

    val nextPendingPayment: BillPayment?
        get() = payments
            .sortedBy { it.sequence }
            .firstOrNull {
                it.status.equals("PENDING", ignoreCase = true) ||
                    it.status.equals("PARTIAL", ignoreCase = true)
            }

    val nextPayablePayment: BillPayment?
        get() = failedPayment ?: nextPendingPayment

    val nextPaymentAmountCents: Int
        get() = bill.nextPaymentAmountCents
            ?: processingPayment?.amountCents
            ?: nextPayablePayment?.amountCents
            ?: remainingAmountCents

    val nextPaymentDue: String?
        get() = bill.nextPaymentDue ?: processingPayment?.dueDate ?: nextPayablePayment?.dueDate
}

data class ProfilePaymentPlansState(
    val isLoading: Boolean = false,
    val plans: List<ProfilePaymentPlan> = emptyList(),
    val error: String? = null,
)

private data class ActiveBillPaymentAttempt(
    val checkoutOperationId: String,
    val billId: String,
    val billPaymentId: String,
    val paymentIntent: String,
)

private data class PendingChildTeamRegistrationPayment(
    val checkoutOperationId: String,
    val team: Team,
)

data class ProfileMembership(
    val subscription: Subscription,
    val productName: String,
    val organizationName: String,
)

data class ProfileMembershipsState(
    val isLoading: Boolean = false,
    val memberships: List<ProfileMembership> = emptyList(),
    val error: String? = null,
)

data class ProfileEventTemplatesState(
    val isLoading: Boolean = false,
    val templates: List<EventTemplateSummary> = emptyList(),
    val error: String? = null,
)

data class ProfileChild(
    val userId: String,
    val firstName: String,
    val lastName: String,
    val userName: String? = null,
    val dateOfBirth: String? = null,
    val age: Int? = null,
    val linkStatus: String? = null,
    val relationship: String? = null,
    val email: String? = null,
    val hasEmail: Boolean = false,
) {
    val fullName: String
        get() = listOf(firstName.trim(), lastName.trim())
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .ifBlank { "Child" }
}

data class ProfileJoinRequest(
    val registrationId: String,
    val requestType: String = "EVENT",
    val requestSource: String? = null,
    val inviteId: String? = null,
    val eventId: String? = null,
    val eventName: String? = null,
    val teamId: String? = null,
    val teamName: String? = null,
    val teamRegistrationPriceCents: Int? = null,
    val childUserId: String,
    val childFullName: String,
    val childEmail: String? = null,
    val childHasEmail: Boolean = false,
    val consentStatus: String? = null,
    val requestedAt: String? = null,
) {
    val isTeamRequest: Boolean
        get() = requestType.equals("TEAM", ignoreCase = true)

    val targetName: String
        get() = if (isTeamRequest) {
            teamName?.trim()?.takeIf(String::isNotBlank) ?: "Team"
        } else {
            eventName?.trim()?.takeIf(String::isNotBlank) ?: "Event"
        }
}

data class ProfileChildrenState(
    val isLoading: Boolean = false,
    val children: List<ProfileChild> = emptyList(),
    val error: String? = null,
    val isLoadingJoinRequests: Boolean = false,
    val joinRequests: List<ProfileJoinRequest> = emptyList(),
    val joinRequestsError: String? = null,
    val activeJoinRequestId: String? = null,
    val isCreatingChild: Boolean = false,
    val createError: String? = null,
    val isUpdatingChild: Boolean = false,
    val updateError: String? = null,
    val isLinkingChild: Boolean = false,
    val linkError: String? = null,
)

data class ProfileConnectionsState(
    val isLoading: Boolean = false,
    val currentUser: UserData? = null,
    val friends: List<UserData> = emptyList(),
    val following: List<UserData> = emptyList(),
    val blockedUsers: List<UserData> = emptyList(),
    val incomingFriendRequests: List<UserData> = emptyList(),
    val outgoingFriendRequests: List<UserData> = emptyList(),
    val searchQuery: String = "",
    val searchResults: List<UserData> = emptyList(),
    val isSearching: Boolean = false,
    val activeUserId: String? = null,
    val error: String? = null,
)

data class ProfileDocumentsState(
    val isLoading: Boolean = false,
    val unsignedDocuments: List<ProfileDocumentCard> = emptyList(),
    val signedDocuments: List<ProfileDocumentCard> = emptyList(),
    val error: String? = null,
)

data class ProfileDiscountsState(
    val isLoading: Boolean = false,
    val discounts: List<DiscountOffer> = emptyList(),
    val itemType: String = "EVENT",
    val targetSearch: String = "",
    val allTargets: List<DiscountTarget> = emptyList(),
    val targets: List<DiscountTarget> = emptyList(),
    val selectedTargetId: String? = null,
    val targetLoading: Boolean = false,
    val name: String = "",
    val description: String = "",
    val discountedPriceCents: Int = 0,
    val isCreating: Boolean = false,
    val codeInputs: Map<String, String> = emptyMap(),
    val usageLimitInputs: Map<String, String> = emptyMap(),
    val generatingCodeDiscountId: String? = null,
    val activeCodeActionId: String? = null,
    val error: String? = null,
)

internal fun rankDiscountTargets(
    targets: List<DiscountTarget>,
    query: String,
    limit: Int = 25,
): List<DiscountTarget> {
    val normalizedQuery = query.normalizedDiscountSearchText()
    if (normalizedQuery.isBlank()) {
        return targets
            .sortedWith(
                compareBy<DiscountTarget> { it.label.lowercase() }
                    .thenBy { it.id },
            )
            .take(limit)
    }

    val terms = normalizedQuery
        .split(Regex("\\s+"))
        .filter(String::isNotBlank)

    return targets
        .mapNotNull { target ->
            val label = target.label.normalizedDiscountSearchText()
            val description = target.description.orEmpty().normalizedDiscountSearchText()
            val haystack = listOf(label, description, target.itemType.normalizedDiscountSearchText())
                .filter(String::isNotBlank)
                .joinToString(" ")
            if (terms.any { term -> !haystack.contains(term) }) {
                return@mapNotNull null
            }

            val labelWords = label.split(Regex("\\s+")).filter(String::isNotBlank)
            val score = when {
                label == normalizedQuery -> 1000
                label.startsWith(normalizedQuery) -> 850
                label.contains(normalizedQuery) -> 700
                terms.all { term -> labelWords.any { word -> word.startsWith(term) } } -> 560
                terms.all { term -> label.contains(term) } -> 430
                else -> 250
            }

            target to score
        }
        .sortedWith(
            compareByDescending<Pair<DiscountTarget, Int>> { it.second }
                .thenBy { it.first.label.lowercase() }
                .thenBy { it.first.id },
        )
        .map { it.first }
        .take(limit)
}

private fun String.normalizedDiscountSearchText(): String =
    trim()
        .lowercase()
        .replace(Regex("[^a-z0-9]+"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()

internal fun clampDiscountFinalPriceCents(
    finalPriceCents: Int,
    originalPriceCents: Int,
): Int = finalPriceCents.coerceIn(0, originalPriceCents.coerceAtLeast(0))

internal fun discountAmountCentsForFinalPrice(
    originalPriceCents: Int,
    finalPriceCents: Int,
): Int = (originalPriceCents.coerceAtLeast(0) - clampDiscountFinalPriceCents(finalPriceCents, originalPriceCents))
    .coerceAtLeast(0)

internal fun finalPriceCentsFromFlatDiscount(
    originalPriceCents: Int,
    discountAmountCents: Int,
): Int = clampDiscountFinalPriceCents(
    originalPriceCents.coerceAtLeast(0) - discountAmountCents.coerceAtLeast(0),
    originalPriceCents,
)

internal fun finalPriceCentsFromPercentDiscount(
    originalPriceCents: Int,
    discountPercent: Double,
): Int {
    val original = originalPriceCents.coerceAtLeast(0)
    val percent = discountPercent.coerceIn(0.0, 100.0)
    return clampDiscountFinalPriceCents(
        (original - (original * percent / 100.0)).roundToInt(),
        original,
    )
}

internal fun discountPercentForFinalPrice(
    originalPriceCents: Int,
    finalPriceCents: Int,
): Double {
    val original = originalPriceCents.coerceAtLeast(0)
    if (original == 0) return 0.0
    val discountAmount = discountAmountCentsForFinalPrice(original, finalPriceCents)
    return (discountAmount * 100.0 / original).coerceIn(0.0, 100.0)
}

data class ProfileMyScheduleState(
    val isLoading: Boolean = false,
    val events: List<Event> = emptyList(),
    val matches: List<MatchMVP> = emptyList(),
    val teams: List<Team> = emptyList(),
    val fields: List<Field> = emptyList(),
    val error: String? = null,
)

data class ProfilePushTargetDebugState(
    val isLoading: Boolean = false,
    val status: PushDeviceTargetDebugStatus? = null,
    val error: String? = null,
    val lastCheckedAt: String? = null,
)

data class ProfileNotificationSettingsState(
    val settings: NotificationSettings = defaultNotificationSettings(),
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class ProfileInvitesState(
    val isLoading: Boolean = false,
    val invites: List<Invite> = emptyList(),
    val currentUserId: String? = null,
    val currentUserIsMinor: Boolean = false,
    val organizationsById: Map<String, Organization> = emptyMap(),
    val teamsById: Map<String, TeamWithPlayers> = emptyMap(),
    val eventsById: Map<String, Event> = emptyMap(),
    val error: String? = null,
    val activeInviteId: String? = null,
    val activeInviteAction: ProfileInviteAction? = null,
)

private const val CHILD_TEAM_INVITE_PARENT_MESSAGE =
    "A parent or guardian must accept team invitations for child accounts."

private fun Invite.requiresParentAcceptanceForCurrentMinor(currentUser: UserData?): Boolean {
    val resolvedCurrentUser = currentUser ?: return false
    val currentUserId = resolvedCurrentUser.id.trim().takeIf(String::isNotBlank) ?: return false
    return resolvedCurrentUser.isMinor &&
        type.equals("TEAM", ignoreCase = true) &&
        userId?.trim() == currentUserId &&
        !viewerCanAcceptForChild
}

enum class ProfileInviteAction {
    ACCEPT,
    DECLINE,
}

enum class ProfileStartDestination {
    HOME,
    MY_SCHEDULE,
    INVITES,
}

data class ProfileTextSignaturePromptState(
    val document: ProfileDocumentCard,
    val step: SignStep,
)

enum class ProfileWebDocumentPromptMode {
    SIGN,
    VIEW,
}

data class ProfileWebDocumentPromptState(
    val title: String,
    val url: String,
    val mode: ProfileWebDocumentPromptMode,
    @property:ObjCName(swiftName = "promptDescription")
    val description: String? = null,
)

interface ProfileComponent : IPaymentProcessor {
    val childStack: Value<ChildStack<*, Child>>
    val errorState: StateFlow<ErrorMessage?>
    val showChildrenTab: StateFlow<Boolean>
    val eventTemplatesState: StateFlow<ProfileEventTemplatesState>
    val paymentPlansState: StateFlow<ProfilePaymentPlansState>
    val membershipsState: StateFlow<ProfileMembershipsState>
    val childrenState: StateFlow<ProfileChildrenState>
    val connectionsState: StateFlow<ProfileConnectionsState>
    val documentsState: StateFlow<ProfileDocumentsState>
    val discountsState: StateFlow<ProfileDiscountsState>
    val myScheduleState: StateFlow<ProfileMyScheduleState>
    val pushTargetDebugState: StateFlow<ProfilePushTargetDebugState>
    val notificationSettingsState: StateFlow<ProfileNotificationSettingsState>
    val invitesState: StateFlow<ProfileInvitesState>
    val pendingInviteCount: StateFlow<Int>
    val activeBillPaymentId: StateFlow<String?>
    val activeMembershipActionId: StateFlow<String?>
    val activeDocumentActionId: StateFlow<String?>
    val textSignaturePrompt: StateFlow<ProfileTextSignaturePromptState?>
    val webDocumentPrompt: StateFlow<ProfileWebDocumentPromptState?>
    val billingAddressPrompt: StateFlow<BillingAddressDraft?>
    val discountCodePrompt: StateFlow<DiscountCodePromptState?>
    val isStripeAccountConnected: StateFlow<Boolean>

    fun onBackClicked()
    fun setLoadingHandler(loadingHandler: LoadingHandler)

    fun navigateToProfileDetails()
    fun navigateToPayments()
    fun navigateToPaymentPlans()
    fun navigateToMemberships()
    fun navigateToEventTemplates()
    fun useEventTemplate(template: EventTemplateSummary, newStartDate: Instant)
    fun navigateToChildren()
    fun navigateToConnections()
    fun navigateToDocuments()
    fun navigateToDiscounts()
    fun navigateToMySchedule()
    fun navigateToInvites()
    fun navigateToNotifications()
    fun editBillingAddress()

    fun onLogout()
    fun createEvent()
    fun manageTeams()
    fun manageEvents()
    fun manageRefunds()
    fun refreshPushTargetDebugStatus(syncBeforeCheck: Boolean = false)
    fun resetOnboardingForDebug()
    fun setNotificationSetting(type: String, channel: String, enabled: Boolean)
    fun saveNotificationSettings()
    fun refreshEventTemplates()
    fun manageStripeAccountOnboarding()
    fun manageStripeAccount()
    fun refreshPaymentPlans()
    fun payNextInstallment(paymentPlan: ProfilePaymentPlan)
    fun uploadManualPaymentProof(paymentPlan: ProfilePaymentPlan, photo: GalleryPhotoResult)
    fun cancelPendingBillPayment(paymentPlan: ProfilePaymentPlan)
    fun refreshMemberships()
    fun cancelMembership(membership: ProfileMembership)
    fun restartMembership(membership: ProfileMembership)
    fun refreshChildren()
    fun refreshChildJoinRequests()
    fun approveChildJoinRequest(registrationId: String)
    fun declineChildJoinRequest(registrationId: String)
    fun refreshConnections()
    fun searchConnections(query: String)
    fun sendFriendRequest(user: UserData)
    fun acceptFriendRequest(user: UserData)
    fun declineFriendRequest(user: UserData)
    fun followUser(user: UserData)
    fun unfollowUser(user: UserData)
    fun removeFriend(user: UserData)
    fun blockUser(user: UserData, leaveSharedChats: Boolean = true)
    fun unblockUser(user: UserData)
    fun refreshDocuments()
    fun refreshDiscounts()
    fun setDiscountItemType(itemType: String)
    fun setDiscountTargetSearch(query: String)
    fun selectDiscountTarget(targetId: String?)
    fun updateDiscountName(name: String)
    fun updateDiscountDescription(description: String)
    fun updateDiscountedPriceCents(cents: Int)
    fun createUserDiscount()
    fun updateDiscountCodeInput(discountId: String, value: String)
    fun updateDiscountUsageLimitInput(discountId: String, value: String)
    fun generateDiscountCode(discount: DiscountOffer)
    fun deactivateDiscountCode(discount: DiscountOffer, code: DiscountCode)
    fun activateDiscountCode(discount: DiscountOffer, code: DiscountCode)
    fun deleteDiscountCode(discount: DiscountOffer, code: DiscountCode)
    fun refreshMySchedule()
    fun refreshInvites()
    fun acceptInvite(invite: Invite)
    fun declineInvite(invite: Invite)
    fun openInviteEvent(eventId: String)
    fun signDocument(document: ProfileDocumentCard)
    fun openSignedDocument(document: ProfileDocumentCard)
    fun openScheduleEvent(eventId: String)
    fun openScheduleMatch(match: MatchWithRelations)
    fun confirmTextSignature()
    fun dismissTextSignature()
    fun dismissWebDocumentPrompt()
    fun submitBillingAddress(address: BillingAddressDraft)
    fun dismissBillingAddressPrompt()
    fun continueFromDiscountCodePrompt(code: String?)
    fun dismissDiscountCodePrompt()
    fun createChild(
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String? = null,
        relationship: String = "parent",
    )

    fun updateChild(
        childUserId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String? = null,
        relationship: String = "parent",
    )

    fun linkChild(
        childEmail: String? = null,
        childUserId: String? = null,
        relationship: String = "parent",
    )

    sealed class Child {
        data class ProfileHome(val component: ProfileComponent) : Child()
        data class ProfileDetails(val component: ProfileDetailsComponent) : Child()
        data class Payments(val component: ProfileComponent) : Child()
        data class PaymentPlans(val component: ProfileComponent) : Child()
        data class Memberships(val component: ProfileComponent) : Child()
        data class EventTemplates(val component: ProfileComponent) : Child()
        data class Children(val component: ProfileComponent) : Child()
        data class Connections(val component: ProfileComponent) : Child()
        data class Documents(val component: ProfileComponent) : Child()
        data class Discounts(val component: ProfileComponent) : Child()
        data class MySchedule(val component: ProfileComponent) : Child()
        data class Invites(val component: ProfileComponent) : Child()
        data class Notifications(val component: ProfileComponent) : Child()
    }
}

@Serializable
private sealed class ProfileConfig {
    @Serializable
    data object Home : ProfileConfig()

    @Serializable
    data object Details : ProfileConfig()

    @Serializable
    data object Payments : ProfileConfig()

    @Serializable
    data object PaymentPlans : ProfileConfig()

    @Serializable
    data object Memberships : ProfileConfig()

    @Serializable
    data object EventTemplates : ProfileConfig()

    @Serializable
    data object Children : ProfileConfig()

    @Serializable
    data object Connections : ProfileConfig()

    @Serializable
    data object Documents : ProfileConfig()

    @Serializable
    data object Discounts : ProfileConfig()

    @Serializable
    data object MySchedule : ProfileConfig()

    @Serializable
    data object Invites : ProfileConfig()

    @Serializable
    data object Notifications : ProfileConfig()

}

private fun ProfileStartDestination.toProfileConfig(): ProfileConfig = when (this) {
    ProfileStartDestination.HOME -> ProfileConfig.Home
    ProfileStartDestination.MY_SCHEDULE -> ProfileConfig.MySchedule
    ProfileStartDestination.INVITES -> ProfileConfig.Invites
}

class DefaultProfileComponent(
    componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    private val billingRepository: IBillingRepository,
    private val imageRepository: IImagesRepository,
    private val eventRepository: IEventRepository,
    private val teamRepository: ITeamRepository,
    private val pushNotificationsRepository: IPushNotificationsRepository,
    private val currentUserDataSource: CurrentUserDataSource,
    private val navigationHandler: INavigationHandler,
    initialDestination: ProfileStartDestination = ProfileStartDestination.HOME,
) : ProfileComponent, PaymentProcessor(), ComponentContext by componentContext {

    private val navigation = StackNavigation<ProfileConfig>()
    private val koin = getKoin()
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()

    private val _showChildrenTab = MutableStateFlow(true)
    override val showChildrenTab = _showChildrenTab.asStateFlow()

    private val _paymentPlansState = MutableStateFlow(ProfilePaymentPlansState())
    override val paymentPlansState = _paymentPlansState.asStateFlow()

    private val _membershipsState = MutableStateFlow(ProfileMembershipsState())
    override val membershipsState = _membershipsState.asStateFlow()

    private val _eventTemplatesState = MutableStateFlow(ProfileEventTemplatesState())
    override val eventTemplatesState = _eventTemplatesState.asStateFlow()

    private val _childrenState = MutableStateFlow(ProfileChildrenState())
    override val childrenState = _childrenState.asStateFlow()

    private val _connectionsState = MutableStateFlow(ProfileConnectionsState())
    override val connectionsState = _connectionsState.asStateFlow()

    private val _documentsState = MutableStateFlow(ProfileDocumentsState())
    override val documentsState = _documentsState.asStateFlow()

    private val _discountsState = MutableStateFlow(ProfileDiscountsState())
    override val discountsState = _discountsState.asStateFlow()

    private val _myScheduleState = MutableStateFlow(ProfileMyScheduleState())
    override val myScheduleState = _myScheduleState.asStateFlow()

    private val _pushTargetDebugState = MutableStateFlow(ProfilePushTargetDebugState())
    override val pushTargetDebugState = _pushTargetDebugState.asStateFlow()

    private val _notificationSettingsState = MutableStateFlow(ProfileNotificationSettingsState())
    override val notificationSettingsState = _notificationSettingsState.asStateFlow()

    private val _invitesState = MutableStateFlow(ProfileInvitesState())
    override val invitesState = _invitesState.asStateFlow()

    private val _pendingInviteCount = MutableStateFlow(0)
    override val pendingInviteCount = _pendingInviteCount.asStateFlow()
    private val _billingAddressPrompt = MutableStateFlow<BillingAddressDraft?>(null)
    override val billingAddressPrompt = _billingAddressPrompt.asStateFlow()
    private val _discountCodePrompt = MutableStateFlow<DiscountCodePromptState?>(null)
    override val discountCodePrompt = _discountCodePrompt.asStateFlow()

    private val _activeBillPaymentId = MutableStateFlow<String?>(null)
    override val activeBillPaymentId = _activeBillPaymentId.asStateFlow()
    private val checkoutSessionCoordinator = ProfileCheckoutSessionCoordinator()
    private var activeBillPaymentAttempt: ActiveBillPaymentAttempt? = null

    private val _activeMembershipActionId = MutableStateFlow<String?>(null)
    override val activeMembershipActionId = _activeMembershipActionId.asStateFlow()

    private val _activeDocumentActionId = MutableStateFlow<String?>(null)
    override val activeDocumentActionId = _activeDocumentActionId.asStateFlow()

    private val _textSignaturePrompt = MutableStateFlow<ProfileTextSignaturePromptState?>(null)
    override val textSignaturePrompt = _textSignaturePrompt.asStateFlow()

    private val _webDocumentPrompt = MutableStateFlow<ProfileWebDocumentPromptState?>(null)
    override val webDocumentPrompt = _webDocumentPrompt.asStateFlow()

    private val _isStripeAccountConnected = MutableStateFlow(false)
    override val isStripeAccountConnected = _isStripeAccountConnected.asStateFlow()

    private var loadingHandler: LoadingHandler? = null
    private var eventTemplatesJob: Job? = null
    private var discountTargetsJob: Job? = null
    private var childrenTabVisibilityUserId: String? = null
    private var pendingDocumentSyncJob: Job? = null
    private var pendingBillingAddressAction: (() -> Unit)? = null
    private var pendingDiscountCodeAction: ((String?) -> Unit)? = null
    private var pendingChildTeamRegistrationPayment: PendingChildTeamRegistrationPayment? = null

    override val childStack: Value<ChildStack<*, ProfileComponent.Child>> = childStack(
        source = navigation,
        initialConfiguration = initialDestination.toProfileConfig(),
        serializer = ProfileConfig.serializer(),
        handleBackButton = true,
        childFactory = ::createChild,
    )

    init {
        scope.launch {
            billingRepository.observeDiscounts(ownerType = "USER").collect { discounts ->
                _discountsState.value = _discountsState.value.copy(discounts = discounts)
            }
        }
        startDiscountTargetsObserver(_discountsState.value.itemType)

        scope.launch {
            userRepository.currentUser.collect { userResult ->
                val currentUser = userResult.getOrNull()
                _isStripeAccountConnected.value = currentUser?.hasStripeAccount == true
                if (currentUser == null) {
                    childrenTabVisibilityUserId = null
                    _showChildrenTab.value = true
                    _notificationSettingsState.value = ProfileNotificationSettingsState()
                    updatePendingInviteCount(0)
                    _invitesState.value = ProfileInvitesState()
                } else if (childrenTabVisibilityUserId != currentUser.id) {
                    childrenTabVisibilityUserId = currentUser.id
                    _notificationSettingsState.value = ProfileNotificationSettingsState(
                        settings = normalizeNotificationSettings(currentUser.notificationSettings),
                    )
                    resolveChildrenTabVisibility()
                    refreshInviteCount()
                } else {
                    _notificationSettingsState.value = _notificationSettingsState.value.copy(
                        settings = normalizeNotificationSettings(currentUser.notificationSettings),
                    )
                }
            }
        }

        scope.launch {
            paymentResult.collect { payment ->
                if (payment == null) return@collect
                val checkout = checkoutSessionCoordinator.claimPaymentResult()
                if (checkout == null) {
                    Napier.w(
                        "Ignoring profile payment result without an active presented checkout.",
                        tag = "ProfileCheckout",
                    )
                    clearPaymentResult()
                    return@collect
                }

                when (checkout.owner) {
                    ProfileCheckoutOwner.BILL_INSTALLMENT -> {
                        val activeAttempt = activeBillPaymentAttempt
                        if (activeAttempt == null || activeAttempt.checkoutOperationId != checkout.operationId) {
                            Napier.w(
                                "Ignoring bill payment result for checkout ${checkout.operationId} with no matching attempt.",
                                tag = "ProfileCheckout",
                            )
                            checkoutSessionCoordinator.releasePaymentResultClaim(checkout)
                            clearPaymentResult()
                            return@collect
                        }

                        when (payment) {
                            PaymentResult.Canceled -> _errorState.value = ErrorMessage("Payment canceled.")
                            is PaymentResult.Failed -> _errorState.value = ErrorMessage(payment.error)
                            PaymentResult.Completed -> {
                                billingRepository.markBillingPaymentProcessing(
                                    billId = activeAttempt.billId,
                                    billPaymentId = activeAttempt.billPaymentId,
                                    paymentIntent = activeAttempt.paymentIntent,
                                ).onFailure { throwable ->
                                    Napier.w(
                                        "Unable to mark bill payment processing for ${activeAttempt.billPaymentId}",
                                        throwable,
                                    )
                                }
                                _errorState.value = ErrorMessage("Payment submitted.")
                                refreshPaymentPlans()
                            }
                        }
                    }

                    ProfileCheckoutOwner.CHILD_TEAM_REGISTRATION -> {
                        val pendingTeamPayment = pendingChildTeamRegistrationPayment
                        if (
                            pendingTeamPayment == null ||
                            pendingTeamPayment.checkoutOperationId != checkout.operationId
                        ) {
                            Napier.w(
                                "Ignoring child team payment result for checkout ${checkout.operationId} with no matching registration.",
                                tag = "ProfileCheckout",
                            )
                            checkoutSessionCoordinator.releasePaymentResultClaim(checkout)
                            clearPaymentResult()
                            return@collect
                        }

                        when (payment) {
                            PaymentResult.Canceled -> _errorState.value = ErrorMessage("Payment canceled.")
                            is PaymentResult.Failed -> _errorState.value = ErrorMessage(payment.error)
                            PaymentResult.Completed -> {
                                _errorState.value = ErrorMessage(
                                    "Payment submitted for ${pendingTeamPayment.team.name}. Registration is pending until the bank payment clears.",
                                )
                                refreshChildren()
                                refreshPaymentPlans()
                            }
                        }
                    }
                }

                if (finishProfileCheckout(checkout)) {
                    loadingHandler?.hideLoading()
                }
                clearPaymentResult()
            }
        }
    }

    private fun hasActiveProfilePaymentAction(): Boolean {
        return checkoutSessionCoordinator.activeSession != null || _activeBillPaymentId.value != null
    }

    private fun beginProfileCheckout(owner: ProfileCheckoutOwner): ProfileCheckoutSession? {
        if (hasActiveProfilePaymentAction()) {
            _errorState.value = ErrorMessage("Another checkout is already in progress.")
            return null
        }

        val checkout = checkoutSessionCoordinator.start(owner)
        if (checkout == null) {
            _errorState.value = ErrorMessage("Another checkout is already in progress.")
        }
        return checkout
    }

    private fun finishProfileCheckout(checkout: ProfileCheckoutSession): Boolean {
        if (!checkoutSessionCoordinator.finish(checkout)) return false

        when (checkout.owner) {
            ProfileCheckoutOwner.BILL_INSTALLMENT -> {
                _activeBillPaymentId.value = null
                activeBillPaymentAttempt = null
            }

            ProfileCheckoutOwner.CHILD_TEAM_REGISTRATION -> {
                pendingChildTeamRegistrationPayment = null
            }
        }

        return true
    }

    override fun onBackClicked() {
        val stack = childStack.value
        if (stack.backStack.isNotEmpty()) {
            navigation.pop()
        }
    }

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
    }

    @OptIn(DelicateDecomposeApi::class)
    private fun push(config: ProfileConfig) {
        navigation.push(config)
    }

    override fun navigateToProfileDetails() {
        push(ProfileConfig.Details)
    }

    override fun navigateToPayments() {
        push(ProfileConfig.Payments)
    }

    override fun navigateToPaymentPlans() {
        push(ProfileConfig.PaymentPlans)
    }

    override fun navigateToMemberships() {
        push(ProfileConfig.Memberships)
    }

    override fun navigateToEventTemplates() {
        push(ProfileConfig.EventTemplates)
    }

    override fun useEventTemplate(template: EventTemplateSummary, newStartDate: Instant) {
        val templateId = template.id.trim()
        if (templateId.isEmpty()) {
            _errorState.value = ErrorMessage("Template id is missing.")
            return
        }

        scope.launch {
            loadingHandler?.showLoading("Starting from template...")
            eventRepository.seedEventTemplate(
                templateId = templateId,
                newEventId = newId(),
                newStartDate = newStartDate,
            ).onSuccess { seed ->
                loadingHandler?.hideLoading()
                navigationHandler.navigateToCreate(seed)
            }.onFailure { throwable ->
                loadingHandler?.hideLoading()
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to start event from template."),
                )
            }
        }
    }

    override fun navigateToChildren() {
        push(ProfileConfig.Children)
    }

    override fun navigateToConnections() {
        push(ProfileConfig.Connections)
    }

    override fun navigateToDocuments() {
        push(ProfileConfig.Documents)
    }

    override fun navigateToDiscounts() {
        push(ProfileConfig.Discounts)
    }

    override fun navigateToMySchedule() {
        push(ProfileConfig.MySchedule)
    }

    override fun navigateToInvites() {
        push(ProfileConfig.Invites)
    }

    override fun navigateToNotifications() {
        push(ProfileConfig.Notifications)
    }

    override fun editBillingAddress() {
        scope.launch {
            loadingHandler?.showLoading("Loading billing address...")
            val billingAddress = billingRepository.getBillingAddress()
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Unable to load billing address."))
                }
                .getOrNull()
                ?.billingAddress
                ?.normalized()

            pendingBillingAddressAction = null
            _billingAddressPrompt.value = billingAddress ?: BillingAddressDraft()
            loadingHandler?.hideLoading()
        }
    }

    override fun onLogout() {
        scope.launch {
            userRepository.logout()
                .onSuccess { navigationHandler.navigateToLogin() }
                .onFailure { _errorState.value = ErrorMessage(it.userMessage()) }
        }
    }

    override fun createEvent() {
        navigationHandler.navigateToCreate()
    }

    override fun manageTeams() {
        navigationHandler.navigateToTeams()
    }

    override fun manageEvents() {
        navigationHandler.navigateToEvents()
    }

    override fun manageRefunds() {
        navigationHandler.navigateToRefunds()
    }

    override fun refreshPushTargetDebugStatus(syncBeforeCheck: Boolean) {
        scope.launch {
            _pushTargetDebugState.value = _pushTargetDebugState.value.copy(
                isLoading = true,
                error = null,
            )

            pushNotificationsRepository.getDeviceTargetDebugStatus(syncBeforeCheck)
                .onSuccess { status ->
                    _pushTargetDebugState.value = ProfilePushTargetDebugState(
                        isLoading = false,
                        status = status,
                        error = null,
                        lastCheckedAt = Clock.System.now().toString(),
                    )
                }
                .onFailure { throwable ->
                    _pushTargetDebugState.value = _pushTargetDebugState.value.copy(
                        isLoading = false,
                        error = throwable.userMessage("Failed to load push target debug status."),
                        lastCheckedAt = Clock.System.now().toString(),
                    )
            }
        }
    }

    override fun resetOnboardingForDebug() {
        if (!Platform.isDebugBuild) return

        scope.launch {
            currentUserDataSource.clearCompletedGuideIds()
            navigationHandler.navigateToSearch()
        }
    }

    override fun setNotificationSetting(type: String, channel: String, enabled: Boolean) {
        _notificationSettingsState.value = _notificationSettingsState.value.copy(
            settings = _notificationSettingsState.value.settings.withNotificationSetting(
                type = type,
                channel = channel,
                enabled = enabled,
            ),
            error = null,
        )
    }

    override fun saveNotificationSettings() {
        val currentUser = userRepository.currentUser.value.getOrNull()
        if (currentUser == null) {
            _notificationSettingsState.value = _notificationSettingsState.value.copy(
                error = "Unable to save notification settings for the current user.",
            )
            return
        }

        scope.launch {
            val currentState = _notificationSettingsState.value
            val normalizedSettings = normalizeNotificationSettings(currentState.settings)
            _notificationSettingsState.value = currentState.copy(
                settings = normalizedSettings,
                isSaving = true,
                error = null,
            )

            userRepository.updateNotificationSettings(normalizedSettings).onSuccess { updatedUser ->
                _notificationSettingsState.value = ProfileNotificationSettingsState(
                    settings = normalizeNotificationSettings(updatedUser.notificationSettings),
                )
            }.onFailure { throwable ->
                _notificationSettingsState.value = _notificationSettingsState.value.copy(
                    isSaving = false,
                    error = throwable.userMessage("Failed to save notification settings."),
                )
            }
        }
    }

    private fun resolveChildrenTabVisibility() {
        scope.launch {
            val isChildUser = userRepository.isCurrentUserChild().getOrNull() == true
            if (isChildUser) {
                _showChildrenTab.value = false
                return@launch
            }

            val shouldShow = runCatching {
                userRepository.listChildren().getOrThrow()
                true
            }.getOrElse { throwable ->
                when ((throwable as? ApiException)?.statusCode) {
                    403 -> false
                    else -> true
                }
            }
            _showChildrenTab.value = shouldShow
        }
    }

    override fun refreshEventTemplates() {
        eventTemplatesJob?.cancel()
        _eventTemplatesState.value = _eventTemplatesState.value.copy(
            isLoading = true,
            error = null,
        )

        eventTemplatesJob = scope.launch {
            val currentUser = userRepository.currentUser
                .firstOrNull { it.isSuccess }
                ?.getOrNull()

            if (currentUser == null) {
                _eventTemplatesState.value = ProfileEventTemplatesState(
                    isLoading = false,
                    templates = emptyList(),
                    error = "Unable to load templates for the current user.",
                )
                return@launch
            }

            eventRepository.getEventTemplatesByHostFlow(currentUser.id).collect { result ->
                result.onSuccess { templates ->
                    _eventTemplatesState.value = ProfileEventTemplatesState(
                        isLoading = false,
                        templates = templates.sortedWith(
                            compareByDescending<EventTemplateSummary> { it.updatedAt }
                                .thenByDescending { it.createdAt }
                                .thenBy { it.name.lowercase() },
                        ),
                        error = null,
                    )
                }.onFailure { throwable ->
                    _eventTemplatesState.value = _eventTemplatesState.value.copy(
                        isLoading = false,
                        error = throwable.userMessage("Failed to load event templates."),
                    )
                }
            }
        }
    }

    override fun refreshMySchedule() {
        scope.launch {
            _myScheduleState.value = _myScheduleState.value.copy(
                isLoading = true,
                error = null,
            )

            eventRepository.getMySchedule()
                .onSuccess { snapshot ->
                    _myScheduleState.value = ProfileMyScheduleState(
                        isLoading = false,
                        events = snapshot.events,
                        matches = snapshot.matches,
                        teams = snapshot.teams,
                        fields = snapshot.fields,
                        error = null,
                    )
                }
                .onFailure { throwable ->
                    _myScheduleState.value = _myScheduleState.value.copy(
                        isLoading = false,
                        error = throwable.userMessage("Failed to load schedule."),
                    )
                }
        }
    }

    override fun refreshInvites() {
        scope.launch {
            val currentUser = userRepository.currentUser.value.getOrNull()
            val currentUserId = currentUser?.id
            if (currentUserId.isNullOrBlank()) {
                _invitesState.value = ProfileInvitesState(
                    isLoading = false,
                    invites = emptyList(),
                    error = "Unable to load invites for the current user.",
                )
                updatePendingInviteCount(0)
                return@launch
            }

            _invitesState.value = _invitesState.value.copy(
                isLoading = true,
                error = null,
            )

            userRepository.listInvites(currentUserId)
                .onSuccess { invites ->
                    val pendingInvites = invites.filter { invite ->
                        invite.status?.equals("DECLINED", ignoreCase = true) != true
                    }

                    val organizationIds = pendingInvites.mapNotNull { it.organizationId }
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .distinct()
                    val teamIds = pendingInvites.mapNotNull { it.teamId }
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .distinct()
                    val eventIds = pendingInvites.mapNotNull { it.eventId }
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .distinct()

                    val organizationsById = billingRepository.getOrganizationsByIds(organizationIds)
                        .getOrElse { emptyList() }
                        .associateBy { it.id }
                    val teamsById = teamRepository.getTeamsWithPlayers(teamIds)
                        .getOrElse { emptyList() }
                        .associateBy { it.team.id }
                    val eventsById = eventRepository.getEventsByIds(eventIds)
                        .getOrElse { emptyList() }
                        .associateBy { it.id }

                    _invitesState.value = ProfileInvitesState(
                        isLoading = false,
                        invites = pendingInvites,
                        currentUserId = currentUserId,
                        currentUserIsMinor = currentUser.isMinor,
                        organizationsById = organizationsById,
                        teamsById = teamsById,
                        eventsById = eventsById,
                        error = null,
                        activeInviteId = null,
                        activeInviteAction = null,
                    )
                    updatePendingInviteCount(pendingInvites.size)
                }
                .onFailure { throwable ->
                    _invitesState.value = ProfileInvitesState(
                        isLoading = false,
                        invites = emptyList(),
                        error = throwable.userMessage("Failed to load invites."),
                    )
                    updatePendingInviteCount(0)
                }
        }
    }

    override fun acceptInvite(invite: Invite) {
        val inviteId = invite.id.trim()
        if (inviteId.isEmpty()) {
            _errorState.value = ErrorMessage("Invalid invite.")
            return
        }
        val currentUser = userRepository.currentUser.value.getOrNull()
        if (invite.requiresParentAcceptanceForCurrentMinor(currentUser)) {
            _invitesState.value = _invitesState.value.copy(error = CHILD_TEAM_INVITE_PARENT_MESSAGE)
            _errorState.value = ErrorMessage(CHILD_TEAM_INVITE_PARENT_MESSAGE)
            return
        }

        scope.launch {
            _invitesState.value = _invitesState.value.copy(
                activeInviteId = inviteId,
                activeInviteAction = ProfileInviteAction.ACCEPT,
                error = null,
            )

            userRepository.acceptInvite(inviteId)
                .onSuccess {
                    val acceptedTeam = invite.teamId?.trim()?.takeIf(String::isNotBlank)?.let { teamId ->
                        runCatching { teamRepository.getTeamWithPlayers(teamId).getOrThrow() }.getOrNull()
                    }
                    runCatching { userRepository.getCurrentAccount().getOrThrow() }
                    refreshInviteCount()
                    refreshInvites()
                    maybeStartAcceptedChildTeamPayment(invite, acceptedTeam)
                }
                .onFailure { throwable ->
                    _invitesState.value = _invitesState.value.copy(
                        activeInviteId = null,
                        activeInviteAction = null,
                        error = throwable.userMessage("Failed to accept invite."),
                    )
                }
        }
    }

    private fun maybeStartAcceptedChildTeamPayment(
        invite: Invite,
        acceptedTeam: TeamWithPlayers?,
    ) {
        val childUserId = invite.acceptedChildTeamUserIdOrNull() ?: return
        val team = acceptedTeam?.team ?: return
        if (team.registrationPriceCents <= 0) return

        val payableRegistration = team.withSynchronizedMembership()
            .playerRegistrations
            .firstOrNull { registration ->
                registration.userId == childUserId &&
                    (registration.isStarted() || registration.isPaymentPending())
            }

        if (payableRegistration == null) {
            _errorState.value = ErrorMessage(
                "Invite accepted, but the child registration could not be found for checkout.",
            )
            return
        }

        _errorState.value = ErrorMessage("Invite accepted. Starting payment...")
        startChildTeamRegistrationPayment(
            team = team,
            registration = payableRegistration,
        )
    }

    private fun Invite.acceptedChildTeamUserIdOrNull(): String? {
        if (!viewerCanAcceptForChild || !type.equals("TEAM", ignoreCase = true)) {
            return null
        }

        return childUserId?.trim()?.takeIf(String::isNotBlank)
            ?: userId?.trim()?.takeIf(String::isNotBlank)
    }

    override fun declineInvite(invite: Invite) {
        val inviteId = invite.id.trim()
        if (inviteId.isEmpty()) {
            _errorState.value = ErrorMessage("Invalid invite.")
            return
        }

        scope.launch {
            _invitesState.value = _invitesState.value.copy(
                activeInviteId = inviteId,
                activeInviteAction = ProfileInviteAction.DECLINE,
                error = null,
            )

            userRepository.declineInvite(inviteId)
                .onSuccess {
                    refreshInviteCount()
                    refreshInvites()
                }
                .onFailure { throwable ->
                    _invitesState.value = _invitesState.value.copy(
                        activeInviteId = null,
                        activeInviteAction = null,
                        error = throwable.userMessage("Failed to decline invite."),
                    )
                }
        }
    }

    override fun openInviteEvent(eventId: String) {
        openEventById(
            eventId = eventId,
            cachedEvents = _invitesState.value.eventsById.values.toList(),
        )
    }

    override fun openScheduleEvent(eventId: String) {
        openEventById(
            eventId = eventId,
            cachedEvents = _myScheduleState.value.events,
        )
    }

    override fun openScheduleMatch(match: MatchWithRelations) {
        val eventId = match.match.eventId.trim()
        if (eventId.isEmpty()) {
            _errorState.value = ErrorMessage("Invalid match.")
            return
        }

        val cachedEvent = _myScheduleState.value.events.firstOrNull { event -> event.id == eventId }
        if (cachedEvent != null) {
            navigationHandler.navigateToMatchFromSchedule(match, cachedEvent)
            return
        }

        scope.launch {
            eventRepository.getEvent(eventId)
                .onSuccess { event ->
                    navigationHandler.navigateToMatchFromSchedule(match, event)
                }
                .onFailure {
                    _errorState.value = ErrorMessage(it.userMessage("Unable to open match."))
                }
        }
    }

    override fun manageStripeAccountOnboarding() {
        scope.launch {
            val currentUser = userRepository.currentUser.value.getOrNull()
            Napier.i(
                "Manage Stripe onboarding tapped: hasStripeAccount=${currentUser?.hasStripeAccount} apiBaseUrl=$apiBaseUrl",
                tag = "Stripe",
            )
            loadingHandler?.showLoading("Redirecting to Stripe ...")
            billingRepository.createAccount().onSuccess { onboardingUrl ->
                Napier.i("Manage Stripe onboarding returned URL=$onboardingUrl", tag = "Stripe")
                urlHandler?.openUrlInWebView(url = onboardingUrl)
            }.onFailure {
                _errorState.value = ErrorMessage(it.userMessage())
            }
            loadingHandler?.hideLoading()
        }
    }

    override fun manageStripeAccount() {
        scope.launch {
            val currentUser = userRepository.currentUser.value.getOrNull()
            Napier.i(
                "Manage Stripe account tapped: hasStripeAccount=${currentUser?.hasStripeAccount} apiBaseUrl=$apiBaseUrl",
                tag = "Stripe",
            )
            loadingHandler?.showLoading("Redirecting to Stripe ...")
            billingRepository.getOnboardingLink().onSuccess { onboardingUrl ->
                Napier.i("Manage Stripe account returned URL=$onboardingUrl", tag = "Stripe")
                urlHandler?.openUrlInWebView(url = onboardingUrl)
                    ?.onFailure {
                        _errorState.value = ErrorMessage(it.userMessage())
                    }
            }.onFailure {
                    _errorState.value = ErrorMessage(it.userMessage())
            }
            loadingHandler?.hideLoading()
        }
    }

    private fun refreshInviteCount() {
        scope.launch {
            val currentUserId = userRepository.currentUser.value.getOrNull()?.id
            if (currentUserId.isNullOrBlank()) {
                updatePendingInviteCount(0)
                return@launch
            }

            userRepository.listInvites(currentUserId)
                .onSuccess { invites ->
                    updatePendingInviteCount(invites.count { invite ->
                        invite.status?.equals("DECLINED", ignoreCase = true) != true
                    })
                }
                .onFailure { throwable ->
                    Napier.w("Failed to refresh invite count for user $currentUserId", throwable)
                    updatePendingInviteCount(0)
                }
        }
    }

    private fun updatePendingInviteCount(count: Int) {
        val normalizedCount = count.coerceAtLeast(0)
        _pendingInviteCount.value = normalizedCount
        navigationHandler.onPendingInviteCountUpdated(normalizedCount)
    }

    private fun openEventById(
        eventId: String,
        cachedEvents: List<Event> = emptyList(),
    ) {
        val normalizedId = eventId.trim()
        if (normalizedId.isEmpty()) {
            _errorState.value = ErrorMessage("Invalid event.")
            return
        }

        val cached = cachedEvents.firstOrNull { it.id == normalizedId }
        if (cached != null) {
            navigationHandler.navigateToEvent(cached)
            return
        }

        scope.launch {
            eventRepository.getEvent(normalizedId)
                .onSuccess { event ->
                    navigationHandler.navigateToEvent(event)
                }
                .onFailure {
                    _errorState.value = ErrorMessage(it.userMessage("Unable to open event."))
                }
        }
    }

    override fun refreshPaymentPlans() {
        scope.launch {
            _paymentPlansState.value = _paymentPlansState.value.copy(
                isLoading = true,
                error = null,
            )

            val currentUser = userRepository.currentUser.value.getOrNull()
            if (currentUser == null) {
                _paymentPlansState.value = ProfilePaymentPlansState(
                    isLoading = false,
                    plans = emptyList(),
                    error = "Unable to load payment plans for the current user.",
                )
                return@launch
            }

            val plans = mutableListOf<ProfilePaymentPlan>()
            val userBills = billingRepository.listBills(ownerType = "USER", ownerId = currentUser.id)
                .getOrElse {
                    _paymentPlansState.value = ProfilePaymentPlansState(
                        isLoading = false,
                        plans = emptyList(),
                        error = it.userMessage("Failed to load bills."),
                    )
                    return@launch
                }
            plans.addAll(buildPaymentPlans(bills = userBills, ownerLabel = currentUser.fullName))

            val teams = teamRepository.getTeamsForUser(currentUser.id)
                .getOrElse { throwable ->
                    Napier.w("Unable to load teams for bills by membership.", throwable)
                    teamRepository.getTeams(currentUser.teamIds).getOrElse { emptyList() }
                }
                .distinctBy { it.id }
            teams.forEach { team ->
                val ownerLabel = team.name.takeIf { it.isNotBlank() } ?: "Team"
                val teamBills = billingRepository.listBills(ownerType = "TEAM", ownerId = team.id)
                    .getOrElse { throwable ->
                        Napier.w("Unable to load team bills for team ${team.id}", throwable)
                        return@forEach
                    }
                plans.addAll(buildPaymentPlans(bills = teamBills, ownerLabel = ownerLabel))
            }

            _paymentPlansState.value = ProfilePaymentPlansState(
                isLoading = false,
                plans = plans
                    .distinctBy { it.bill.id }
                    .sortedByDescending { it.nextPaymentDue ?: "" },
            )
        }
    }

    private suspend fun buildPaymentPlans(
        bills: List<Bill>,
        ownerLabel: String,
    ): List<ProfilePaymentPlan> {
        return bills.map { bill ->
            val payments = billingRepository.getBillPayments(bill.id)
                .onFailure { throwable ->
                    Napier.w("Unable to load payments for bill ${bill.id}", throwable)
                }
                .getOrElse { emptyList() }

            ProfilePaymentPlan(
                bill = bill,
                ownerLabel = ownerLabel,
                payments = payments,
                event = bill.eventId
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?.let { eventId ->
                        eventRepository.getEvent(eventId)
                            .onFailure { throwable ->
                                Napier.w("Unable to load event $eventId for bill ${bill.id}", throwable)
                            }
                            .getOrNull()
                    },
            )
        }
    }

    override fun payNextInstallment(paymentPlan: ProfilePaymentPlan) {
        if (paymentPlan.isManualRegistrationBill) {
            _errorState.value = ErrorMessage("Upload proof of payment for this manual bill.")
            return
        }
        if (hasActiveProfilePaymentAction()) {
            _errorState.value = ErrorMessage("Another checkout is already in progress.")
            return
        }
        val nextPayment = paymentPlan.nextPayablePayment
        if (nextPayment == null) {
            _errorState.value = ErrorMessage("No payable installment available for this bill.")
            return
        }
        if (paymentPlan.processingPayment != null) {
            _errorState.value = ErrorMessage("This payment is already pending.")
            return
        }

        scope.launch {
            if (!ensureBillingAddressOrPrompt { payNextInstallment(paymentPlan) }) {
                return@launch
            }
            val checkout = beginProfileCheckout(ProfileCheckoutOwner.BILL_INSTALLMENT) ?: return@launch
            _activeBillPaymentId.value = paymentPlan.bill.id
            loadingHandler?.showLoading("Preparing payment ...")

            billingRepository.createBillingIntent(
                billId = paymentPlan.bill.id,
                billPaymentId = nextPayment.id,
            ).onSuccess { intent ->
                if (!checkoutSessionCoordinator.isCurrent(checkout)) {
                    Napier.w(
                        "Ignoring a bill intent for inactive checkout ${checkout.operationId}.",
                        tag = "ProfileCheckout",
                    )
                    return@onSuccess
                }
                runCatching {
                    val paymentIntent = intent.paymentIntent
                        ?.trim()
                        ?.takeIf(String::isNotBlank)
                        ?: throw IllegalStateException("Payment intent is missing.")
                    activeBillPaymentAttempt = ActiveBillPaymentAttempt(
                        checkoutOperationId = checkout.operationId,
                        billId = intent.billId?.trim()?.takeIf(String::isNotBlank) ?: paymentPlan.bill.id,
                        billPaymentId = intent.billPaymentId?.trim()?.takeIf(String::isNotBlank) ?: nextPayment.id,
                        paymentIntent = paymentIntent,
                    )
                    clearPaymentResult()
                    setPaymentIntent(intent)
                    val account = userRepository.currentAccount.value.getOrThrow()
                    val user = userRepository.currentUser.value.getOrThrow()
                    val billingAddress = loadSavedBillingAddress()
                    loadingHandler?.showLoading("Waiting for payment completion ...")
                    check(checkoutSessionCoordinator.awaitPaymentResult(checkout)) {
                        "Checkout is no longer active."
                    }
                    presentPaymentSheet(
                        email = account.email,
                        name = user.fullName,
                        billingAddress = billingAddress,
                    )
                }.onFailure { error ->
                    if (finishProfileCheckout(checkout)) {
                        loadingHandler?.hideLoading()
                        _errorState.value = ErrorMessage(error.userMessage("Unable to start payment sheet."))
                    }
                }
            }.onFailure { error ->
                if (finishProfileCheckout(checkout)) {
                    loadingHandler?.hideLoading()
                    _errorState.value = ErrorMessage(error.userMessage("Unable to create payment intent."))
                }
            }
        }
    }

    override fun uploadManualPaymentProof(paymentPlan: ProfilePaymentPlan, photo: GalleryPhotoResult) {
        if (hasActiveProfilePaymentAction()) {
            _errorState.value = ErrorMessage("Another checkout is already in progress.")
            return
        }
        val nextPayment = paymentPlan.nextPayablePayment
        if (!paymentPlan.isManualRegistrationBill) {
            _errorState.value = ErrorMessage("Proof upload is only available for manual registration bills.")
            return
        }
        if (nextPayment == null) {
            _errorState.value = ErrorMessage("No unpaid installment is available for this bill.")
            return
        }
        scope.launch {
            _activeBillPaymentId.value = paymentPlan.bill.id
            loadingHandler?.showLoading("Uploading proof ...")
            imageRepository.uploadImage(convertPhotoResultToUploadFile(photo))
                .mapCatching { fileId ->
                    billingRepository.submitManualPaymentProof(
                        billId = paymentPlan.bill.id,
                        billPaymentId = nextPayment.id,
                        fileId = fileId,
                    ).getOrThrow()
                }
                .onSuccess {
                    loadingHandler?.hideLoading()
                    _activeBillPaymentId.value = null
                    _errorState.value = ErrorMessage("Payment proof submitted for host review.")
                    refreshPaymentPlans()
                }
                .onFailure { throwable ->
                    loadingHandler?.hideLoading()
                    _activeBillPaymentId.value = null
                    _errorState.value = ErrorMessage(throwable.userMessage("Failed to upload payment proof."))
                }
        }
    }

    override fun cancelPendingBillPayment(paymentPlan: ProfilePaymentPlan) {
        if (hasActiveProfilePaymentAction()) {
            _errorState.value = ErrorMessage("Another checkout is already in progress.")
            return
        }
        val processingPayment = paymentPlan.processingPayment
        if (processingPayment == null) {
            _errorState.value = ErrorMessage("No pending payment is available to cancel.")
            return
        }

        scope.launch {
            _activeBillPaymentId.value = paymentPlan.bill.id
            loadingHandler?.showLoading("Cancelling payment ...")
            billingRepository.cancelBillPayment(
                billId = paymentPlan.bill.id,
                billPaymentId = processingPayment.id,
            ).onSuccess {
                _errorState.value = ErrorMessage("Pending payment cancelled.")
                refreshPaymentPlans()
            }.onFailure {
                _errorState.value = ErrorMessage(it.userMessage("Unable to cancel pending payment."))
            }
            loadingHandler?.hideLoading()
            _activeBillPaymentId.value = null
        }
    }

    override fun refreshMemberships() {
        scope.launch {
            _membershipsState.value = _membershipsState.value.copy(
                isLoading = true,
                error = null,
            )

            val currentUser = userRepository.currentUser.value.getOrNull()
            if (currentUser == null) {
                _membershipsState.value = ProfileMembershipsState(
                    isLoading = false,
                    memberships = emptyList(),
                    error = "Unable to load memberships for the current user.",
                )
                return@launch
            }

            val subscriptions = billingRepository.listSubscriptions(userId = currentUser.id)
                .getOrElse {
                    _membershipsState.value = ProfileMembershipsState(
                        isLoading = false,
                        memberships = emptyList(),
                        error = it.userMessage("Failed to load memberships."),
                    )
                    return@launch
                }

            val productsById = billingRepository.getProductsByIds(
                subscriptions.map { it.productId },
            ).getOrElse { emptyList() }.associateBy { it.id }

            val organizationsById = billingRepository.getOrganizationsByIds(
                subscriptions.mapNotNull { it.organizationId },
            ).getOrElse { emptyList() }.associateBy { it.id }

            val memberships = subscriptions.map { subscription ->
                val product = productsById[subscription.productId]
                val organization = subscription.organizationId?.let { organizationsById[it] }

                ProfileMembership(
                    subscription = subscription,
                    productName = product?.name?.takeIf { it.isNotBlank() }
                        ?: subscription.productId,
                    organizationName = organization?.name?.takeIf { it.isNotBlank() }
                        ?: subscription.organizationId
                        ?: "Organization",
                )
            }.sortedByDescending { it.subscription.startDate }

            _membershipsState.value = ProfileMembershipsState(
                isLoading = false,
                memberships = memberships,
                error = null,
            )
        }
    }

    override fun cancelMembership(membership: ProfileMembership) {
        scope.launch {
            _activeMembershipActionId.value = membership.subscription.id
            billingRepository.cancelSubscription(membership.subscription.id)
                .onFailure {
                    _errorState.value = ErrorMessage(it.userMessage("Unable to cancel membership."))
                }
                .onSuccess { cancelled ->
                    if (!cancelled) {
                        _errorState.value = ErrorMessage("Unable to cancel membership.")
                    } else {
                        refreshMemberships()
                    }
                }
            _activeMembershipActionId.value = null
        }
    }

    override fun restartMembership(membership: ProfileMembership) {
        scope.launch {
            _activeMembershipActionId.value = membership.subscription.id
            billingRepository.restartSubscription(membership.subscription.id)
                .onFailure {
                    _errorState.value = ErrorMessage(it.userMessage("Unable to restart membership."))
                }
                .onSuccess { restarted ->
                    if (!restarted) {
                        _errorState.value = ErrorMessage("Unable to restart membership.")
                    } else {
                        refreshMemberships()
                    }
                }
            _activeMembershipActionId.value = null
        }
    }

    override fun refreshChildren() {
        refreshChildJoinRequests()
        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                isLoading = true,
                error = null,
            )

            userRepository.listChildren()
                .onSuccess { children ->
                    _childrenState.value = _childrenState.value.copy(
                        isLoading = false,
                        children = children.map { it.toProfileChild() },
                        error = null,
                    )
                }
                .onFailure {
                    _childrenState.value = _childrenState.value.copy(
                        isLoading = false,
                        children = emptyList(),
                        error = it.userMessage("Failed to load children."),
                    )
                }
        }
    }

    override fun refreshChildJoinRequests() {
        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                isLoadingJoinRequests = true,
                joinRequestsError = null,
            )

            userRepository.listPendingChildJoinRequests()
                .onSuccess { requests ->
                    _childrenState.value = _childrenState.value.copy(
                        isLoadingJoinRequests = false,
                        joinRequests = requests.map { it.toProfileJoinRequest() },
                        joinRequestsError = null,
                    )
                }
                .onFailure {
                    _childrenState.value = _childrenState.value.copy(
                        isLoadingJoinRequests = false,
                        joinRequests = emptyList(),
                        joinRequestsError = it.userMessage("Failed to load child join requests."),
                    )
                }
        }
    }

    override fun approveChildJoinRequest(registrationId: String) {
        resolveChildJoinRequest(
            registrationId = registrationId,
            action = FamilyJoinRequestAction.APPROVE,
        )
    }

    override fun declineChildJoinRequest(registrationId: String) {
        resolveChildJoinRequest(
            registrationId = registrationId,
            action = FamilyJoinRequestAction.DECLINE,
        )
    }

    private fun resolveChildJoinRequest(
        registrationId: String,
        action: FamilyJoinRequestAction,
    ) {
        val normalizedRegistrationId = registrationId.trim()
        if (normalizedRegistrationId.isEmpty()) {
            _errorState.value = ErrorMessage("Registration id is required.")
            return
        }

        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                activeJoinRequestId = normalizedRegistrationId,
                joinRequestsError = null,
            )

            userRepository.resolveChildJoinRequest(
                registrationId = normalizedRegistrationId,
                action = action,
            ).onSuccess { resolution ->
                val paymentTeam = resolution.team?.takeIf { team ->
                    action == FamilyJoinRequestAction.APPROVE &&
                        resolution.requestType.equals("TEAM", ignoreCase = true) &&
                        team.registrationPriceCents > 0
                }

                if (paymentTeam != null) {
                    _errorState.value = ErrorMessage("Join request approved. Starting payment...")
                    refreshChildren()
                    startChildTeamRegistrationPayment(
                        team = paymentTeam,
                        registration = resolution.teamRegistration,
                    )
                } else {
                    resolution.warnings.firstOrNull()?.let { warning ->
                        _errorState.value = ErrorMessage(warning)
                    } ?: run {
                        _errorState.value = ErrorMessage(
                            if (action == FamilyJoinRequestAction.APPROVE) {
                                "Join request approved."
                            } else {
                                "Join request declined."
                            },
                        )
                    }
                    refreshChildren()
                }
                refreshDocuments()
            }.onFailure {
                _childrenState.value = _childrenState.value.copy(
                    joinRequestsError = it.userMessage("Failed to update join request."),
                )
            }

            _childrenState.value = _childrenState.value.copy(
                activeJoinRequestId = null,
            )
        }
    }

    private fun startChildTeamRegistrationPayment(
        team: Team,
        registration: TeamPlayerRegistration?,
    ) {
        if (hasActiveProfilePaymentAction()) {
            _errorState.value = ErrorMessage("Another checkout is already in progress.")
            return
        }
        scope.launch {
            if (!ensureBillingAddressOrPrompt { startChildTeamRegistrationPayment(team, registration) }) {
                return@launch
            }
            val discountCode = requestDiscountCode(
                description = "Enter a discount code for this team registration, or continue without one.",
            )

            val checkout = beginProfileCheckout(ProfileCheckoutOwner.CHILD_TEAM_REGISTRATION) ?: return@launch
            loadingHandler?.showLoading("Preparing checkout...")
            billingRepository.createTeamRegistrationPurchaseIntent(
                team = team,
                teamRegistration = registration,
                discountCode = discountCode,
            ).onSuccess { intent ->
                if (!checkoutSessionCoordinator.isCurrent(checkout)) {
                    Napier.w(
                        "Ignoring a child team intent for inactive checkout ${checkout.operationId}.",
                        tag = "ProfileCheckout",
                    )
                    return@onSuccess
                }
                runCatching {
                    pendingChildTeamRegistrationPayment = PendingChildTeamRegistrationPayment(
                        checkoutOperationId = checkout.operationId,
                        team = team,
                    )
                    clearPaymentResult()
                    setPaymentIntent(intent)
                    val account = userRepository.currentAccount.value.getOrThrow()
                    val user = userRepository.currentUser.value.getOrThrow()
                    val billingAddress = loadSavedBillingAddress()
                    loadingHandler?.showLoading("Waiting for payment completion ...")
                    check(checkoutSessionCoordinator.awaitPaymentResult(checkout)) {
                        "Checkout is no longer active."
                    }
                    presentPaymentSheet(
                        email = account.email,
                        name = user.fullName,
                        billingAddress = billingAddress,
                    )
                }.onFailure { error ->
                    if (finishProfileCheckout(checkout)) {
                        loadingHandler?.hideLoading()
                        _errorState.value = ErrorMessage(error.userMessage("Unable to start payment sheet."))
                    }
                }
            }.onFailure { error ->
                if (finishProfileCheckout(checkout)) {
                    loadingHandler?.hideLoading()
                    _errorState.value = ErrorMessage(error.userMessage("Unable to create payment intent."))
                }
            }
        }
    }

    override fun refreshConnections() {
        scope.launch {
            val currentUser = userRepository.currentUser.value.getOrNull()
            if (currentUser == null) {
                _connectionsState.value = ProfileConnectionsState(
                    isLoading = false,
                    error = "Unable to load connections for the current user.",
                )
                return@launch
            }

            _connectionsState.value = _connectionsState.value.copy(
                isLoading = true,
                currentUser = currentUser,
                error = null,
            )

            var failureMessage: String? = null
            val friends = userRepository.getUsers(currentUser.friendIds).getOrElse { throwable ->
                if (failureMessage == null) failureMessage = throwable.userMessage("Failed to load friends.")
                emptyList()
            }
            val following = userRepository.getUsers(currentUser.followingIds).getOrElse { throwable ->
                if (failureMessage == null) failureMessage = throwable.userMessage("Failed to load following users.")
                emptyList()
            }
            val blockedUsers = userRepository.getUsers(currentUser.blockedUserIds).getOrElse { throwable ->
                if (failureMessage == null) failureMessage = throwable.userMessage("Failed to load blocked users.")
                emptyList()
            }
            val incomingFriendRequests = userRepository.getUsers(currentUser.friendRequestIds).getOrElse { throwable ->
                if (failureMessage == null) failureMessage = throwable.userMessage("Failed to load incoming friend requests.")
                emptyList()
            }
            val outgoingFriendRequests = userRepository.getUsers(currentUser.friendRequestSentIds).getOrElse { throwable ->
                if (failureMessage == null) failureMessage = throwable.userMessage("Failed to load outgoing friend requests.")
                emptyList()
            }

            val existingState = _connectionsState.value
            val refreshedQuery = existingState.searchQuery
            val searchResults = if (refreshedQuery.trim().length >= 2) {
                userRepository.searchPlayers(refreshedQuery)
                    .getOrElse { emptyList() }
                    .filter { it.id != currentUser.id }
                    .distinctBy { it.id }
            } else {
                emptyList()
            }

            _connectionsState.value = existingState.copy(
                isLoading = false,
                currentUser = currentUser,
                friends = friends,
                following = following,
                blockedUsers = blockedUsers,
                incomingFriendRequests = incomingFriendRequests,
                outgoingFriendRequests = outgoingFriendRequests,
                searchResults = searchResults,
                error = failureMessage,
            )
        }
    }

    override fun searchConnections(query: String) {
        val normalizedQuery = query
        _connectionsState.value = _connectionsState.value.copy(
            searchQuery = normalizedQuery,
        )

        if (normalizedQuery.trim().length < 2) {
            _connectionsState.value = _connectionsState.value.copy(
                isSearching = false,
                searchResults = emptyList(),
                error = null,
            )
            return
        }

        scope.launch {
            val currentUserId = userRepository.currentUser.value.getOrNull()?.id
            _connectionsState.value = _connectionsState.value.copy(
                isSearching = true,
                error = null,
            )

            userRepository.searchPlayers(normalizedQuery)
                .onSuccess { users ->
                    _connectionsState.value = _connectionsState.value.copy(
                        isSearching = false,
                        searchResults = users
                            .filter { it.id != currentUserId }
                            .distinctBy { it.id },
                    )
                }
                .onFailure { throwable ->
                    _connectionsState.value = _connectionsState.value.copy(
                        isSearching = false,
                        searchResults = emptyList(),
                        error = throwable.userMessage("Failed to search users."),
                    )
                }
        }
    }

    override fun sendFriendRequest(user: UserData) {
        performConnectionAction(
            user = user,
            successMessage = "Friend request sent.",
        ) {
            userRepository.sendFriendRequest(user)
        }
    }

    override fun acceptFriendRequest(user: UserData) {
        performConnectionAction(
            user = user,
            successMessage = "Friend request accepted.",
        ) {
            userRepository.acceptFriendRequest(user)
        }
    }

    override fun declineFriendRequest(user: UserData) {
        performConnectionAction(
            user = user,
            successMessage = "Friend request declined.",
        ) {
            userRepository.declineFriendRequest(user.id)
        }
    }

    override fun followUser(user: UserData) {
        performConnectionAction(
            user = user,
            successMessage = "Following user.",
        ) {
            userRepository.followUser(user.id)
        }
    }

    override fun unfollowUser(user: UserData) {
        performConnectionAction(
            user = user,
            successMessage = "Unfollowed user.",
        ) {
            userRepository.unfollowUser(user.id)
        }
    }

    override fun removeFriend(user: UserData) {
        performConnectionAction(
            user = user,
            successMessage = "Friend removed.",
        ) {
            userRepository.removeFriend(user.id)
        }
    }

    override fun blockUser(user: UserData, leaveSharedChats: Boolean) {
        performConnectionAction(
            user = user,
            successMessage = if (leaveSharedChats) {
                "User blocked. Shared chats were hidden."
            } else {
                "User blocked."
            },
        ) {
            userRepository.blockUser(user.id, leaveSharedChats).map { }
        }
    }

    override fun unblockUser(user: UserData) {
        performConnectionAction(
            user = user,
            successMessage = "User unblocked.",
        ) {
            userRepository.unblockUser(user.id)
        }
    }

    private fun performConnectionAction(
        user: UserData,
        successMessage: String,
        action: suspend () -> Result<Unit>,
    ) {
        val targetUserId = user.id.trim()
        if (targetUserId.isBlank()) {
            _connectionsState.value = _connectionsState.value.copy(
                error = "Invalid user id.",
            )
            return
        }

        scope.launch {
            _connectionsState.value = _connectionsState.value.copy(
                activeUserId = targetUserId,
                error = null,
            )

            action().onSuccess {
                _connectionsState.value = _connectionsState.value.copy(
                    activeUserId = null,
                    error = null,
                )
                _errorState.value = ErrorMessage(successMessage)
                refreshConnections()
            }.onFailure { throwable ->
                _connectionsState.value = _connectionsState.value.copy(
                    activeUserId = null,
                    error = throwable.userMessage("Failed to update connection."),
                )
            }
        }
    }

    override fun refreshDocuments() {
        scope.launch {
            _documentsState.value = _documentsState.value.copy(
                isLoading = true,
                error = null,
            )

            billingRepository.listProfileDocuments()
                .onSuccess { bundle ->
                    _documentsState.value = ProfileDocumentsState(
                        isLoading = false,
                        unsignedDocuments = bundle.unsigned,
                        signedDocuments = bundle.signed,
                        error = null,
                    )
                }
                .onFailure { throwable ->
                    _documentsState.value = _documentsState.value.copy(
                        isLoading = false,
                        error = throwable.userMessage("Failed to load documents."),
                    )
                }
        }
    }

    override fun refreshDiscounts() {
        scope.launch {
            _discountsState.value = _discountsState.value.copy(
                isLoading = true,
                targetLoading = true,
                error = null,
            )
            val discountFailure = billingRepository.listDiscounts(ownerType = "USER").exceptionOrNull()
            val targetFailure = listOf("EVENT", "TEAM_REGISTRATION")
                .firstNotNullOfOrNull { itemType ->
                    billingRepository.listDiscountTargets(
                        ownerType = "USER",
                        itemType = itemType,
                        query = null,
                    ).exceptionOrNull()
                }

            val failure = discountFailure ?: targetFailure
            _discountsState.value = _discountsState.value.copy(
                isLoading = false,
                targetLoading = false,
                error = failure?.userMessage("Failed to load discounts."),
            )
        }
    }

    override fun setDiscountItemType(itemType: String) {
        val normalizedItemType = itemType.trim().uppercase().ifBlank { "EVENT" }
        _discountsState.value = _discountsState.value.copy(
            itemType = normalizedItemType,
            targetSearch = "",
            selectedTargetId = null,
            allTargets = emptyList(),
            targets = emptyList(),
            error = null,
        )
        startDiscountTargetsObserver(normalizedItemType)
    }

    override fun setDiscountTargetSearch(query: String) {
        val state = _discountsState.value
        _discountsState.value = state.copy(
            targetSearch = query,
            targets = rankDiscountTargets(state.allTargets, query),
        )
    }

    override fun selectDiscountTarget(targetId: String?) {
        val selected = _discountsState.value.allTargets.firstOrNull { it.id == targetId }
        _discountsState.value = _discountsState.value.copy(
            selectedTargetId = selected?.id,
            targetSearch = selected?.label ?: _discountsState.value.targetSearch,
            discountedPriceCents = selected?.priceCents ?: 0,
            name = selected?.let { "${it.label} discount" } ?: _discountsState.value.name,
            error = null,
        )
    }

    override fun updateDiscountName(name: String) {
        _discountsState.value = _discountsState.value.copy(name = name)
    }

    override fun updateDiscountDescription(description: String) {
        _discountsState.value = _discountsState.value.copy(description = description)
    }

    override fun updateDiscountedPriceCents(cents: Int) {
        val selected = selectedDiscountTarget()
        val bounded = cents.coerceIn(0, selected?.priceCents ?: Int.MAX_VALUE)
        _discountsState.value = _discountsState.value.copy(discountedPriceCents = bounded)
    }

    override fun createUserDiscount() {
        val state = _discountsState.value
        val target = selectedDiscountTarget()
        if (target == null) {
            _discountsState.value = state.copy(error = "Select an item for this discount.")
            return
        }
        val normalizedName = state.name.trim().takeIf(String::isNotBlank)
        if (normalizedName == null) {
            _discountsState.value = state.copy(error = "Discount name is required.")
            return
        }
        scope.launch {
            _discountsState.value = _discountsState.value.copy(isCreating = true, error = null)
            billingRepository.createDiscount(
                ownerType = "USER",
                name = normalizedName,
                description = state.description,
                targetType = target.targetType,
                targetId = target.id,
                discountedPriceCents = state.discountedPriceCents.coerceIn(0, target.priceCents),
            ).onSuccess {
                _discountsState.value = _discountsState.value.copy(
                    isCreating = false,
                    name = "",
                    description = "",
                    targetSearch = "",
                    selectedTargetId = null,
                    targets = rankDiscountTargets(_discountsState.value.allTargets, ""),
                    discountedPriceCents = 0,
                    error = null,
                )
                refreshDiscounts()
            }.onFailure { throwable ->
                _discountsState.value = _discountsState.value.copy(
                    isCreating = false,
                    error = throwable.userMessage("Failed to create discount."),
                )
            }
        }
    }

    override fun updateDiscountCodeInput(discountId: String, value: String) {
        _discountsState.value = _discountsState.value.copy(
            codeInputs = _discountsState.value.codeInputs + (discountId to value),
        )
    }

    override fun updateDiscountUsageLimitInput(discountId: String, value: String) {
        _discountsState.value = _discountsState.value.copy(
            usageLimitInputs = _discountsState.value.usageLimitInputs + (discountId to value.filter(Char::isDigit)),
        )
    }

    override fun generateDiscountCode(discount: DiscountOffer) {
        val discountId = discount.id.trim()
        if (discountId.isEmpty()) return
        val state = _discountsState.value
        scope.launch {
            _discountsState.value = state.copy(generatingCodeDiscountId = discountId, error = null)
            billingRepository.generateDiscountCode(
                discountId = discountId,
                code = state.codeInputs[discountId],
                usageLimit = state.usageLimitInputs[discountId]?.toIntOrNull(),
            ).onSuccess {
                _discountsState.value = _discountsState.value.copy(
                    generatingCodeDiscountId = null,
                    codeInputs = _discountsState.value.codeInputs - discountId,
                    usageLimitInputs = _discountsState.value.usageLimitInputs - discountId,
                    error = null,
                )
                refreshDiscounts()
            }.onFailure { throwable ->
                _discountsState.value = _discountsState.value.copy(
                    generatingCodeDiscountId = null,
                    error = throwable.userMessage("Failed to generate code."),
                )
            }
        }
    }

    override fun deactivateDiscountCode(discount: DiscountOffer, code: DiscountCode) {
        updateDiscountCodeStatus(discount = discount, code = code, status = "INACTIVE")
    }

    override fun activateDiscountCode(discount: DiscountOffer, code: DiscountCode) {
        updateDiscountCodeStatus(discount = discount, code = code, status = "ACTIVE")
    }

    override fun deleteDiscountCode(discount: DiscountOffer, code: DiscountCode) {
        val discountId = discount.id.trim()
        val codeId = code.id.trim()
        if (discountId.isEmpty() || codeId.isEmpty()) return
        if (code.status.equals("ACTIVE", ignoreCase = true)) {
            _discountsState.value = _discountsState.value.copy(error = "Deactivate this code before deleting it.")
            return
        }
        scope.launch {
            _discountsState.value = _discountsState.value.copy(activeCodeActionId = codeId, error = null)
            billingRepository.deleteDiscountCode(
                discountId = discountId,
                codeId = codeId,
            ).onSuccess {
                _discountsState.value = _discountsState.value.copy(
                    activeCodeActionId = null,
                    error = null,
                )
                refreshDiscounts()
            }.onFailure { throwable ->
                _discountsState.value = _discountsState.value.copy(
                    activeCodeActionId = null,
                    error = throwable.userMessage("Failed to delete code."),
                )
            }
        }
    }

    private fun updateDiscountCodeStatus(
        discount: DiscountOffer,
        code: DiscountCode,
        status: String,
    ) {
        val discountId = discount.id.trim()
        val codeId = code.id.trim()
        if (discountId.isEmpty() || codeId.isEmpty()) return
        scope.launch {
            _discountsState.value = _discountsState.value.copy(activeCodeActionId = codeId, error = null)
            billingRepository.updateDiscountCodeStatus(
                discountId = discountId,
                codeId = codeId,
                status = status,
            ).onSuccess {
                _discountsState.value = _discountsState.value.copy(
                    activeCodeActionId = null,
                    error = null,
                )
                refreshDiscounts()
            }.onFailure { throwable ->
                _discountsState.value = _discountsState.value.copy(
                    activeCodeActionId = null,
                    error = throwable.userMessage("Failed to update code."),
                )
            }
        }
    }

    private fun startDiscountTargetsObserver(itemType: String) {
        discountTargetsJob?.cancel()
        discountTargetsJob = scope.launch {
            billingRepository.observeDiscountTargets(ownerType = "USER", itemType = itemType)
                .collect { targets ->
                    val state = _discountsState.value
                    _discountsState.value = state.copy(
                        allTargets = targets,
                        targets = rankDiscountTargets(targets, state.targetSearch),
                        selectedTargetId = state.selectedTargetId
                            ?.takeIf { selected -> targets.any { it.id == selected } },
                    )
                }
        }
    }

    private fun selectedDiscountTarget(): DiscountTarget? {
        val state = _discountsState.value
        return state.allTargets.firstOrNull { it.id == state.selectedTargetId }
    }

    override fun signDocument(document: ProfileDocumentCard) {
        val currentUserId = userRepository.currentUser.value.getOrNull()?.id?.trim().orEmpty()
        if (document.requiresChildEmail) {
            _errorState.value = ErrorMessage(
                document.statusNote ?: "Add child email before requesting child-signature documents.",
            )
            return
        }
        if (
            document.signerContext == SignerContext.CHILD
            && !document.childUserId.isNullOrBlank()
            && document.childUserId != currentUserId
        ) {
            _errorState.value = ErrorMessage("This signature must be completed from the child account.")
            return
        }

        val eventId = document.eventId?.trim()?.takeIf(String::isNotBlank)
        val teamId = document.teamId?.trim()?.takeIf(String::isNotBlank)
        if (eventId == null && teamId == null) {
            _errorState.value = ErrorMessage("This document is missing an event or team id.")
            return
        }

        scope.launch {
            _activeDocumentActionId.value = document.id
            loadingHandler?.showLoading("Preparing document signing ...")

            val signLinksResult = teamId?.let { normalizedTeamId ->
                billingRepository.getRequiredTeamSignLinks(
                    teamId = normalizedTeamId,
                    signerContext = document.signerContext,
                    childUserId = document.childUserId,
                    childUserEmail = document.childEmail,
                )
            } ?: billingRepository.getRequiredSignLinks(
                eventId = eventId.orEmpty(),
                signerContext = document.signerContext,
                childUserId = document.childUserId,
                childUserEmail = document.childEmail,
            )

            signLinksResult.onSuccess { steps ->
                val requestedTemplateId = document.templateId.trim()
                val matchingSteps = steps.filter { step ->
                    step.templateId?.trim() == requestedTemplateId
                }
                val step = matchingSteps.singleOrNull()
                if (step == null) {
                    _errorState.value = ErrorMessage(
                        if (matchingSteps.isEmpty()) {
                            "The selected document is not available for signing. Refresh and try again."
                        } else {
                            "Multiple signing steps matched the selected document. Refresh and try again."
                        },
                    )
                    return@onSuccess
                }

                if (step.isTextStep()) {
                    _textSignaturePrompt.value = ProfileTextSignaturePromptState(
                        document = document,
                        step = step,
                    )
                    return@onSuccess
                }

                val signingUrl = step.resolvedSigningUrl()
                if (signingUrl.isNullOrBlank()) {
                    _errorState.value = ErrorMessage("Document is missing a signing URL.")
                    return@onSuccess
                }

                _webDocumentPrompt.value = ProfileWebDocumentPromptState(
                    title = step.title?.trim()?.takeIf(String::isNotBlank) ?: document.title,
                    url = signingUrl,
                    mode = ProfileWebDocumentPromptMode.SIGN,
                    description = "Signer: ${document.signerContextLabel}",
                )

                val operationId = step.operationId?.trim()?.takeIf(String::isNotBlank)
                if (operationId == null) {
                    _errorState.value = ErrorMessage("Complete signing in the modal, then refresh documents.")
                    return@onSuccess
                }

                pendingDocumentSyncJob?.cancel()
                pendingDocumentSyncJob = scope.launch {
                    _errorState.value = ErrorMessage("Waiting for signature sync...")
                    billingRepository.pollBoldSignOperation(operationId).onSuccess {
                        _webDocumentPrompt.value = null
                        _errorState.value = ErrorMessage("Document signed.")
                        refreshDocuments()
                    }.onFailure { throwable ->
                        _errorState.value = ErrorMessage(
                            throwable.userMessage("Failed to confirm signature status."),
                        )
                    }
                }
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Unable to load signing links."),
                )
            }

            _activeDocumentActionId.value = null
            loadingHandler?.hideLoading()
        }
    }

    override fun openSignedDocument(document: ProfileDocumentCard) {
        if (document.type == ProfileDocumentType.TEXT) {
            return
        }

        val viewUrl = document.viewUrl?.trim().orEmpty()
        if (viewUrl.isEmpty()) {
            _errorState.value = ErrorMessage("This document is missing a view URL.")
            return
        }

        scope.launch {
            _activeDocumentActionId.value = document.id
            loadingHandler?.showLoading("Opening document ...")

            val resolvedUrl = if (
                viewUrl.startsWith("http://", ignoreCase = true) ||
                viewUrl.startsWith("https://", ignoreCase = true)
            ) {
                viewUrl
            } else {
                "${apiBaseUrl.trimEnd('/')}/${viewUrl.trimStart('/')}"
            }

            _webDocumentPrompt.value = ProfileWebDocumentPromptState(
                title = document.title,
                url = resolvedUrl,
                mode = ProfileWebDocumentPromptMode.VIEW,
                description = document.organizationName,
            )

            _activeDocumentActionId.value = null
            loadingHandler?.hideLoading()
        }
    }

    override fun confirmTextSignature() {
        val prompt = _textSignaturePrompt.value ?: return
        val eventId = prompt.document.eventId?.trim()?.takeIf(String::isNotBlank)
        val teamId = prompt.document.teamId?.trim()?.takeIf(String::isNotBlank)
        if (eventId == null && teamId == null) {
            _errorState.value = ErrorMessage("This document is missing an event or team id.")
            return
        }

        scope.launch {
            _activeDocumentActionId.value = prompt.document.id
            loadingHandler?.showLoading("Recording signature ...")

            val documentId = prompt.step.resolvedDocumentId()
                ?: "mobile-profile-text-${prompt.step.templateId}-${Clock.System.now().toEpochMilliseconds()}"

            val recordSignatureResult = teamId?.let { normalizedTeamId ->
                billingRepository.recordTeamSignature(
                    teamId = normalizedTeamId,
                    templateId = prompt.step.templateId,
                    documentId = documentId,
                    type = prompt.step.type,
                    signerContext = prompt.document.signerContext,
                    childUserId = prompt.document.childUserId,
                )
            } ?: billingRepository.recordSignature(
                eventId = eventId.orEmpty(),
                templateId = prompt.step.templateId,
                documentId = documentId,
                type = prompt.step.type,
                signerContext = prompt.document.signerContext,
                childUserId = prompt.document.childUserId,
            )

            recordSignatureResult.onSuccess {
                _textSignaturePrompt.value = null
                _errorState.value = ErrorMessage("Document signed.")
                refreshDocuments()
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.userMessage("Failed to record signature."),
                )
            }

            _activeDocumentActionId.value = null
            loadingHandler?.hideLoading()
        }
    }

    override fun dismissTextSignature() {
        _textSignaturePrompt.value = null
    }

    override fun dismissWebDocumentPrompt() {
        pendingDocumentSyncJob?.cancel()
        pendingDocumentSyncJob = null

        val mode = _webDocumentPrompt.value?.mode
        _webDocumentPrompt.value = null

        if (mode == ProfileWebDocumentPromptMode.SIGN) {
            _errorState.value = ErrorMessage("Document signing canceled.")
        }
    }

    override fun submitBillingAddress(address: BillingAddressDraft) {
        scope.launch {
            loadingHandler?.showLoading("Saving billing address...")
            billingRepository.updateBillingAddress(address)
                .onSuccess {
                    _billingAddressPrompt.value = null
                    _errorState.value = ErrorMessage("Billing address saved.")
                    val action = pendingBillingAddressAction
                    pendingBillingAddressAction = null
                    action?.invoke()
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Unable to save billing address."))
                }
            loadingHandler?.hideLoading()
        }
    }

    override fun dismissBillingAddressPrompt() {
        _billingAddressPrompt.value = null
        pendingBillingAddressAction = null
    }

    override fun continueFromDiscountCodePrompt(code: String?) {
        val action = pendingDiscountCodeAction
        pendingDiscountCodeAction = null
        _discountCodePrompt.value = null
        action?.invoke(code?.trim()?.takeIf(String::isNotBlank))
    }

    override fun dismissDiscountCodePrompt() {
        continueFromDiscountCodePrompt(null)
    }

    private suspend fun ensureBillingAddressOrPrompt(onReady: () -> Unit): Boolean {
        val billingAddress = billingRepository.getBillingAddress()
            .getOrElse { error ->
                _errorState.value = ErrorMessage(error.userMessage("Unable to load billing address."))
                return false
            }
            .billingAddress
            ?.normalized()

        if (billingAddress != null && billingAddress.isCompleteForUsTax()) {
            return true
        }

        pendingBillingAddressAction = onReady
        _billingAddressPrompt.value = billingAddress ?: BillingAddressDraft()
        return false
    }

    private suspend fun requestDiscountCode(
        description: String = "Enter a discount code for this checkout, or continue without one.",
    ): String? = suspendCancellableCoroutine { continuation ->
        pendingDiscountCodeAction = { code ->
            if (continuation.isActive) {
                continuation.resume(code?.trim()?.takeIf(String::isNotBlank))
            }
        }
        _discountCodePrompt.value = DiscountCodePromptState(description = description)
        continuation.invokeOnCancellation {
            pendingDiscountCodeAction = null
            _discountCodePrompt.value = null
        }
    }

    private suspend fun loadSavedBillingAddress(): BillingAddressDraft? {
        return billingRepository.getBillingAddress()
            .getOrNull()
            ?.billingAddress
            ?.normalized()
    }

    override fun createChild(
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String,
    ) {
        val normalizedFirstName = firstName.trim()
        val normalizedLastName = lastName.trim()
        val normalizedDateOfBirth = dateOfBirth.trim()
        val normalizedRelationship = relationship.trim().ifBlank { "parent" }
        val normalizedEmail = email?.trim()?.takeIf(String::isNotBlank)

        if (normalizedFirstName.isBlank() || normalizedLastName.isBlank() || normalizedDateOfBirth.isBlank()) {
            _childrenState.value = _childrenState.value.copy(
                createError = "First name, last name, and date of birth are required.",
            )
            return
        }

        if (!normalizedDateOfBirth.matches(DATE_OF_BIRTH_REGEX)) {
            _childrenState.value = _childrenState.value.copy(
                createError = "Date of birth must use YYYY-MM-DD format.",
            )
            return
        }

        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                isCreatingChild = true,
                createError = null,
            )

            userRepository.createChildAccount(
                firstName = normalizedFirstName,
                lastName = normalizedLastName,
                dateOfBirth = normalizedDateOfBirth,
                email = normalizedEmail,
                relationship = normalizedRelationship,
            ).onSuccess {
                _childrenState.value = _childrenState.value.copy(
                    isCreatingChild = false,
                    createError = null,
                )
                refreshChildren()
            }.onFailure {
                _childrenState.value = _childrenState.value.copy(
                    isCreatingChild = false,
                    createError = it.userMessage("Failed to create child."),
                )
            }
        }
    }

    override fun updateChild(
        childUserId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String,
    ) {
        val normalizedChildUserId = childUserId.trim()
        val normalizedFirstName = firstName.trim()
        val normalizedLastName = lastName.trim()
        val normalizedDateOfBirth = dateOfBirth.trim()
        val normalizedRelationship = relationship.trim().ifBlank { "parent" }
        val normalizedEmail = email?.trim()?.takeIf(String::isNotBlank)

        if (
            normalizedChildUserId.isBlank() ||
            normalizedFirstName.isBlank() ||
            normalizedLastName.isBlank() ||
            normalizedDateOfBirth.isBlank()
        ) {
            _childrenState.value = _childrenState.value.copy(
                updateError = "First name, last name, and date of birth are required.",
            )
            return
        }

        if (!normalizedDateOfBirth.matches(DATE_OF_BIRTH_REGEX)) {
            _childrenState.value = _childrenState.value.copy(
                updateError = "Date of birth must use YYYY-MM-DD format.",
            )
            return
        }

        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                isUpdatingChild = true,
                updateError = null,
            )

            userRepository.updateChildAccount(
                childUserId = normalizedChildUserId,
                firstName = normalizedFirstName,
                lastName = normalizedLastName,
                dateOfBirth = normalizedDateOfBirth,
                email = normalizedEmail,
                relationship = normalizedRelationship,
            ).onSuccess {
                _childrenState.value = _childrenState.value.copy(
                    isUpdatingChild = false,
                    updateError = null,
                )
                refreshChildren()
            }.onFailure {
                _childrenState.value = _childrenState.value.copy(
                    isUpdatingChild = false,
                    updateError = it.userMessage("Failed to update child."),
                )
            }
        }
    }

    override fun linkChild(
        childEmail: String?,
        childUserId: String?,
        relationship: String,
    ) {
        val normalizedChildEmail = childEmail?.trim()?.takeIf(String::isNotBlank)
        val normalizedChildUserId = childUserId?.trim()?.takeIf(String::isNotBlank)
        val normalizedRelationship = relationship.trim().ifBlank { "parent" }
        if (normalizedChildEmail == null && normalizedChildUserId == null) {
            _childrenState.value = _childrenState.value.copy(
                linkError = "Provide a child email or user ID.",
            )
            return
        }

        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                isLinkingChild = true,
                linkError = null,
            )

            userRepository.linkChildToParent(
                childEmail = normalizedChildEmail,
                childUserId = normalizedChildUserId,
                relationship = normalizedRelationship,
            ).onSuccess {
                _childrenState.value = _childrenState.value.copy(
                    isLinkingChild = false,
                    linkError = null,
                )
                refreshChildren()
            }.onFailure {
                _childrenState.value = _childrenState.value.copy(
                    isLinkingChild = false,
                    linkError = it.userMessage("Failed to link child."),
                )
            }
        }
    }

    private fun createChild(
        config: ProfileConfig,
        componentContext: ComponentContext,
    ): ProfileComponent.Child = when (config) {
        ProfileConfig.Home -> ProfileComponent.Child.ProfileHome(this@DefaultProfileComponent)
        ProfileConfig.Details -> ProfileComponent.Child.ProfileDetails(
            koin.get<ProfileDetailsComponent> {
                parametersOf(componentContext, ::onBackClicked, navigationHandler)
            },
        )

        ProfileConfig.Payments -> ProfileComponent.Child.Payments(this@DefaultProfileComponent)
        ProfileConfig.PaymentPlans -> ProfileComponent.Child.PaymentPlans(this@DefaultProfileComponent)
        ProfileConfig.Memberships -> ProfileComponent.Child.Memberships(this@DefaultProfileComponent)
        ProfileConfig.EventTemplates -> ProfileComponent.Child.EventTemplates(this@DefaultProfileComponent)
        ProfileConfig.Children -> ProfileComponent.Child.Children(this@DefaultProfileComponent)
        ProfileConfig.Connections -> ProfileComponent.Child.Connections(this@DefaultProfileComponent)
        ProfileConfig.Documents -> ProfileComponent.Child.Documents(this@DefaultProfileComponent)
        ProfileConfig.Discounts -> ProfileComponent.Child.Discounts(this@DefaultProfileComponent)
        ProfileConfig.MySchedule -> ProfileComponent.Child.MySchedule(this@DefaultProfileComponent)
        ProfileConfig.Invites -> ProfileComponent.Child.Invites(this@DefaultProfileComponent)
        ProfileConfig.Notifications -> ProfileComponent.Child.Notifications(this@DefaultProfileComponent)
    }
}

private val DATE_OF_BIRTH_REGEX = Regex("""\d{4}-\d{2}-\d{2}""")

private fun FamilyChild.toProfileChild(): ProfileChild {
    return ProfileChild(
        userId = userId,
        firstName = firstName,
        lastName = lastName,
        userName = userName?.trim()?.takeIf(String::isNotBlank),
        dateOfBirth = dateOfBirth,
        age = age,
        linkStatus = linkStatus,
        relationship = relationship,
        email = email,
        hasEmail = hasEmail ?: (email?.isNotBlank() == true),
    )
}

private fun FamilyJoinRequest.toProfileJoinRequest(): ProfileJoinRequest {
    return ProfileJoinRequest(
        registrationId = registrationId,
        requestType = requestType,
        requestSource = requestSource?.trim()?.takeIf(String::isNotBlank),
        inviteId = inviteId?.trim()?.takeIf(String::isNotBlank),
        eventId = eventId,
        eventName = eventName?.trim()?.takeIf(String::isNotBlank) ?: "Event",
        teamId = teamId?.trim()?.takeIf(String::isNotBlank),
        teamName = teamName?.trim()?.takeIf(String::isNotBlank),
        teamRegistrationPriceCents = teamRegistrationPriceCents?.coerceAtLeast(0),
        childUserId = childUserId,
        childFullName = childFullName?.trim()?.takeIf(String::isNotBlank)
            ?: listOf(
                childFirstName?.trim().orEmpty(),
                childLastName?.trim().orEmpty(),
            ).filter { it.isNotBlank() }.joinToString(" ").ifBlank { "Child" },
        childEmail = childEmail?.trim()?.takeIf(String::isNotBlank),
        childHasEmail = childHasEmail,
        consentStatus = consentStatus?.trim()?.takeIf(String::isNotBlank),
        requestedAt = requestedAt?.trim()?.takeIf(String::isNotBlank),
    )
}
