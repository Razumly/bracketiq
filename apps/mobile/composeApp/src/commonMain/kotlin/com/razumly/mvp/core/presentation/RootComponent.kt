package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.pushNew
import com.arkivanov.decompose.router.stack.replaceAll
import com.arkivanov.decompose.value.Value
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.chat.data.IChatGroupRepository
import com.razumly.mvp.chat.ChatGroupComponent
import com.razumly.mvp.chat.ChatListComponent
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.StartupAuthState
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.eventCreate.CreateEventComponent
import com.razumly.mvp.eventDetail.EventDetailComponent
import com.razumly.mvp.eventManagement.EventManagementComponent
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.eventSearch.EventSearchComponent
import com.razumly.mvp.matchDetail.MatchContentComponent
import com.razumly.mvp.profile.ProfileComponent
import com.razumly.mvp.profile.profileDetails.ProfileDetailsComponent
import com.razumly.mvp.refundManager.RefundManagerComponent
import com.razumly.mvp.teamManagement.TeamManagementComponent
import com.razumly.mvp.organizationDetail.OrganizationDetailComponent
import com.razumly.mvp.userAuth.AuthComponent
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.DeniedAlwaysException
import dev.icerock.moko.permissions.DeniedException
import dev.icerock.moko.permissions.Permission
import dev.icerock.moko.permissions.PermissionsController
import dev.icerock.moko.permissions.location.LOCATION
import dev.icerock.moko.permissions.notifications.REMOTE_NOTIFICATION
import io.github.aakira.napier.Napier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

class RootComponent(
    componentContext: ComponentContext,
    deepLinkNavStart: DeepLinkNav?,
    val permissionsController: PermissionsController,
    val locationTracker: LocationTracker,
    private val userRepository: IUserRepository,
    private val eventRepository: IEventRepository,
    private val pushNotificationsRepository: IPushNotificationsRepository,
    private val chatGroupRepository: IChatGroupRepository,
) : ComponentContext by componentContext, INavigationHandler {
    companion object {
        private const val STARTUP_AUTH_TIMEOUT_MS = 3_000L
        private const val STARTUP_TIMEOUT_NOTICE =
            "We couldn't restore your session in time. Please log in."
        private const val PUSH_TARGET_REGISTRATION_ATTEMPTS = 3
        private const val PUSH_TARGET_REGISTRATION_RETRY_DELAY_MS = 2_000L
    }

    private val navigation = StackNavigation<AppConfig>()
    private val _koin = getKoin()
    private val scopeExceptionHandler = CoroutineExceptionHandler { _, throwable ->
        when (throwable) {
            is DeniedAlwaysException -> {
                Napier.w("Permission always denied in root scope: ${throwable.permission}")
            }

            is DeniedException -> {
                Napier.w("Permission denied in root scope: ${throwable.permission}")
            }

            else -> {
                Napier.e(
                    message = "Unhandled exception in RootComponent scope: ${throwable.message}",
                    throwable = throwable
                )
            }
        }
    }
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob() + scopeExceptionHandler)

    private val deepLinkNav = MutableStateFlow(deepLinkNavStart)
    private var registeredPushUserId: String? = null
    private var syncedChatUserId: String? = null
    private var startupDecisionMade = false
    private var unreadCountJob: Job? = null
    private var pendingInviteCountJob: Job? = null
    private var pushRegistrationRetryJob: Job? = null
    private var deepLinkNavigationJob: Job? = null

    private val _selectedPage = MutableStateFlow<AppConfig>(AppConfig.Search())
    val selectedPage: StateFlow<AppConfig> = _selectedPage.asStateFlow()
    private val _navigationAnimationDirection = MutableStateFlow(1)
    val navigationAnimationDirection: StateFlow<Int> = _navigationAnimationDirection.asStateFlow()
    private val _unreadChatMessageCount = MutableStateFlow(0)
    val unreadChatMessageCount: StateFlow<Int> = _unreadChatMessageCount.asStateFlow()
    private val _pendingInviteCount = MutableStateFlow(0)
    val pendingInviteCount: StateFlow<Int> = _pendingInviteCount.asStateFlow()
    private val _isStartupInProgress = MutableStateFlow(true)
    val isStartupInProgress: StateFlow<Boolean> = _isStartupInProgress.asStateFlow()
    private val _startupNotice = MutableStateFlow<String?>(null)
    val startupNotice: StateFlow<String?> = _startupNotice.asStateFlow()

    val childStack: Value<ChildStack<AppConfig, Child>> = childStack(
        source = navigation,
        initialConfiguration = AppConfig.Splash,
        serializer = AppConfig.serializer(),
        handleBackButton = true,
        childFactory = ::createChild
    )

    init {
        scope.launch {
            userRepository.startupAuthState.collect { state ->
                val currentConfig = childStack.value.active.configuration
                when (state) {
                    StartupAuthState.Checking -> {
                        if (!startupDecisionMade) {
                            _isStartupInProgress.value = true
                        }
                    }

                    StartupAuthState.Authenticated -> {
                        startupDecisionMade = true
                        _isStartupInProgress.value = false
                        if (currentConfig == AppConfig.Splash || currentConfig == AppConfig.Login) {
                            handleDeepLinkOrDefault()
                        }
                    }

                    StartupAuthState.Unauthenticated -> {
                        startupDecisionMade = true
                        _isStartupInProgress.value = false
                        if (currentConfig != AppConfig.Login) {
                            setDefaultNavigationDirection()
                            navigation.replaceAll(AppConfig.Login)
                        }
                    }
                }
            }
        }

        scope.launch {
            delay(STARTUP_AUTH_TIMEOUT_MS)
            if (!startupDecisionMade && userRepository.startupAuthState.value == StartupAuthState.Checking) {
                startupDecisionMade = true
                _isStartupInProgress.value = false
                _startupNotice.value = STARTUP_TIMEOUT_NOTICE
                setDefaultNavigationDirection()
                navigation.replaceAll(AppConfig.Login)
            }
        }

        scope.launch {
            userRepository.currentUser.collect { userResult ->
                userResult.fold(
                    onSuccess = { userData ->
                        if (userData.id.isNotBlank()) {
                            registerPushTargetIfNeeded(userData.id)
                            refreshChatsOnStartupIfNeeded(userData.id)
                        } else {
                            clearPushTargetIfNeeded()
                            clearChatStartupSyncState()
                        }
                    },
                    onFailure = {
                        clearPushTargetIfNeeded()
                        clearChatStartupSyncState()
                    }
                )
            }
        }

        scope.launch {
            userRepository.currentUser.collect { userResult ->
                val userId = userResult.getOrNull()?.id?.takeIf(String::isNotBlank)
                unreadCountJob?.cancel()
                if (userId == null) {
                    _unreadChatMessageCount.value = 0
                    return@collect
                }

                unreadCountJob = launch {
                    chatGroupRepository.getUnreadMessageCountFlow(userId).collect { unreadCount ->
                        _unreadChatMessageCount.value = unreadCount
                    }
                }
            }
        }

        scope.launch {
            userRepository.currentUser.collect { userResult ->
                val userId = userResult.getOrNull()?.id?.takeIf(String::isNotBlank)
                pendingInviteCountJob?.cancel()
                if (userId == null) {
                    _pendingInviteCount.value = 0
                    return@collect
                }

                pendingInviteCountJob = launch {
                    refreshPendingInviteCount(userId)
                }
            }
        }
    }

    fun onStartupNoticeShown() {
        _startupNotice.value = null
    }

    private fun handleDeepLinkOrDefault() {
        val deepLinkNavVal = deepLinkNav.value
        deepLinkNav.value = null
        when (deepLinkNavVal) {
            is DeepLinkNav.Event -> navigateToDeepLinkedEvent(deepLinkNavVal.eventId)
            is DeepLinkNav.Refresh -> {
                setDefaultNavigationDirection()
                navigation.replaceAll(AppConfig.ProfileHome)
                _selectedPage.value = AppConfig.ProfileHome
            }

            is DeepLinkNav.Return -> {
                setDefaultNavigationDirection()
                navigation.replaceAll(AppConfig.ProfileHome)
                _selectedPage.value = AppConfig.ProfileHome
            }

            else -> {
                setDefaultNavigationDirection()
                navigation.replaceAll(AppConfig.Search())
                _selectedPage.value = AppConfig.Search()
            }
        }
    }

    private fun navigateToDeepLinkedEvent(rawEventId: String) {
        val eventId = rawEventId.trim()
        if (eventId.isEmpty()) {
            setDefaultNavigationDirection()
            navigation.replaceAll(AppConfig.Search())
            _selectedPage.value = AppConfig.Search()
            return
        }

        deepLinkNavigationJob?.cancel()
        deepLinkNavigationJob = scope.launch {
            eventRepository.getEvent(eventId)
                .onSuccess { event ->
                    setDefaultNavigationDirection()
                    // Keep Discover in the stack so back returns there from Event Detail.
                    navigation.replaceAll(AppConfig.Search(), AppConfig.EventDetail(event))
                    _selectedPage.value = AppConfig.Search()
                }
                .onFailure { throwable ->
                    Napier.w("Failed to resolve deep-linked event $eventId: ${throwable.message}")
                    _startupNotice.value = throwable.userMessage("Couldn't open that event link.")
                    setDefaultNavigationDirection()
                    navigation.replaceAll(AppConfig.Search())
                    _selectedPage.value = AppConfig.Search()
                }
        }
    }

    fun handleDeepLink(deepLinkNav: DeepLinkNav?) {
        this.deepLinkNav.value = deepLinkNav
        // If user is already logged in, handle immediately
        userRepository.currentUser.value.getOrNull()?.let { userData ->
            if (userData.id.isNotBlank()) {
                handleDeepLinkOrDefault()
            }
        }
    }

    fun onTabSelected(page: AppConfig) {
        setTabNavigationDirection(from = _selectedPage.value, to = page)
        _selectedPage.value = page
        when (page) {
            is AppConfig.Search -> navigation.replaceAll(AppConfig.Search())
            AppConfig.ChatList -> navigation.replaceAll(AppConfig.ChatList)
            is AppConfig.Create -> navigation.replaceAll(AppConfig.Create())
            AppConfig.ProfileHome -> navigation.replaceAll(AppConfig.ProfileHome)
            else -> {}
        }
    }

    private fun registerPushTargetIfNeeded(userId: String) {
        if (registeredPushUserId == userId) return
        pushRegistrationRetryJob?.cancel()
        pushRegistrationRetryJob = scope.launch {
            repeat(PUSH_TARGET_REGISTRATION_ATTEMPTS) { attempt ->
                val result = pushNotificationsRepository.addDeviceAsTarget()
                if (result.isSuccess) {
                    registeredPushUserId = userId
                    pushRegistrationRetryJob = null
                    return@launch
                }

                val failure = result.exceptionOrNull()
                Napier.w("Push target registration failed (attempt ${attempt + 1}/$PUSH_TARGET_REGISTRATION_ATTEMPTS): ${failure?.message}")
                registeredPushUserId = null

                val isCurrentUser = userRepository.currentUser.value.getOrNull()?.id == userId
                val isLastAttempt = attempt == PUSH_TARGET_REGISTRATION_ATTEMPTS - 1
                if (!isCurrentUser || isLastAttempt) {
                    pushRegistrationRetryJob = null
                    return@launch
                }

                delay(PUSH_TARGET_REGISTRATION_RETRY_DELAY_MS * (attempt + 1))
            }
        }
    }

    private fun clearPushTargetIfNeeded() {
        pushRegistrationRetryJob?.cancel()
        pushRegistrationRetryJob = null
        if (registeredPushUserId == null) return
        registeredPushUserId = null
        scope.launch {
            pushNotificationsRepository.removeDeviceAsTarget().onFailure {
                Napier.w("Push target cleanup failed: ${it.message}")
            }
        }
    }

    private fun refreshChatsOnStartupIfNeeded(userId: String) {
        if (syncedChatUserId == userId) return
        syncedChatUserId = userId
        scope.launch(Dispatchers.Default) {
            chatGroupRepository.refreshChatGroupsAndMessages().onFailure {
                Napier.w("Startup chat refresh failed: ${it.message}")
            }
        }
    }

    private fun clearChatStartupSyncState() {
        syncedChatUserId = null
    }

    private suspend fun refreshPendingInviteCount(userId: String) {
        userRepository.listInvites(userId)
            .onSuccess { invites ->
                _pendingInviteCount.value = invites.count { invite ->
                    invite.status?.equals("DECLINED", ignoreCase = true) != true
                }
            }
            .onFailure { throwable ->
                Napier.w("Failed to refresh invite count for user $userId: ${throwable.message}")
                _pendingInviteCount.value = 0
            }
    }

    fun onBackClicked() {
        val stack = childStack.value
        if (stack.backStack.isNotEmpty()) {
            setDefaultNavigationDirection()
            navigation.pop()
        }
    }

    fun requestInitialPermissions() {
        scope.launch {
            try {
                permissionsController.providePermission(Permission.LOCATION)
            } catch (deniedAlwaysException: DeniedAlwaysException) {
                Napier.w("Location permission always denied")
            } catch (denied: DeniedException) {
                Napier.w("Location permission denied")
            } catch (e: Throwable) {
                Napier.w("Location permission failed: ${e.message}")
            }

            try {
                permissionsController.providePermission(Permission.REMOTE_NOTIFICATION)
            } catch (deniedAlwaysException: DeniedAlwaysException) {
                Napier.w("Notification permission always denied")
            } catch (denied: DeniedException) {
                Napier.w("Notification permission denied")
            } catch (e: Throwable) {
                Napier.w("Notification permission failed: ${e.message}")
            }
        }
    }

    override fun navigateToMatch(match: MatchWithRelations, event: Event) {
        setDefaultNavigationDirection()
        navigation.pushNew(AppConfig.MatchDetail(match, event))
    }

    override fun navigateToTeams(
        freeAgents: List<String>,
        event: Event?,
        selectedFreeAgentId: String?,
    ) {
        setDefaultNavigationDirection()
        navigation.pushNew(AppConfig.Teams(freeAgents, event, selectedFreeAgentId))
    }

    override fun navigateToChat(user: UserData?, chat: ChatGroupWithRelations?) {
        setDefaultNavigationDirection()
        navigation.pushNew(AppConfig.Chat(user, chat))
    }

    override fun navigateToCreate(rentalContext: RentalCreateContext?) {
        setDefaultNavigationDirection()
        navigation.pushNew(AppConfig.Create(rentalContext = rentalContext))
        _selectedPage.value = AppConfig.Create()
    }

    override fun navigateToEvent(event: Event) {
        setDefaultNavigationDirection()
        navigation.pushNew(AppConfig.EventDetail(event))
    }

    override fun navigateToOrganization(organizationId: String, initialTab: OrganizationDetailTab) {
        setDefaultNavigationDirection()
        navigation.pushNew(AppConfig.OrganizationDetail(organizationId, initialTab))
    }

    override fun navigateToEvents() {
        setDefaultNavigationDirection()
        navigation.pushNew(AppConfig.Events)
    }

    override fun navigateToRefunds() {
        setDefaultNavigationDirection()
        navigation.pushNew(AppConfig.RefundManager)
    }

    override fun navigateToLogin() {
        setDefaultNavigationDirection()
        navigation.replaceAll(AppConfig.Login)
    }

    override fun navigateToSearch() {
        setDefaultNavigationDirection()
        navigation.replaceAll(AppConfig.Search())
        _selectedPage.value = AppConfig.Search()
    }

    override fun navigateBack() {
        setDefaultNavigationDirection()
        navigation.pop()
    }

    override fun onPendingInviteCountUpdated(count: Int) {
        _pendingInviteCount.value = count.coerceAtLeast(0)
    }

    private fun onEventCreated(createdEvent: Event) {
        setDefaultNavigationDirection()
        navigation.replaceAll(AppConfig.Search())
        _selectedPage.value = AppConfig.Search()
        navigation.pushNew(AppConfig.EventDetail(createdEvent))
    }

    private fun setDefaultNavigationDirection() {
        _navigationAnimationDirection.value = 1
    }

    private fun setTabNavigationDirection(from: AppConfig, to: AppConfig) {
        val fromIndex = bottomTabIndex(from)
        val toIndex = bottomTabIndex(to)
        _navigationAnimationDirection.value = when {
            fromIndex == null || toIndex == null -> 1
            toIndex > fromIndex -> 1
            toIndex < fromIndex -> -1
            else -> 1
        }
    }

    private fun bottomTabIndex(config: AppConfig): Int? = when (config) {
        is AppConfig.Search -> 0
        AppConfig.ChatList -> 1
        is AppConfig.Create -> 2
        AppConfig.ProfileHome -> 3
        else -> null
    }

    private fun createChild(
        config: AppConfig,
        componentContext: ComponentContext
    ): Child = when (config) {
        AppConfig.Splash -> Child.Splash

        AppConfig.Login -> Child.Login(
            _koin.get { parametersOf(componentContext, this@RootComponent) }
        )

        is AppConfig.Search -> Child.Search(
            _koin.get {
                parametersOf(componentContext, config.eventId, this@RootComponent)
            },
            _koin.get { parametersOf(componentContext) }
        )

        is AppConfig.EventDetail -> Child.EventContent(
            _koin.get { parametersOf(componentContext, config.event, this@RootComponent) },
            _koin.get { parametersOf(componentContext) }
        )

        is AppConfig.OrganizationDetail -> Child.OrganizationDetail(
            _koin.get { parametersOf(componentContext, config.organizationId, config.initialTab, this@RootComponent) }
        )

        is AppConfig.MatchDetail -> Child.MatchContent(
            component = _koin.get { parametersOf(componentContext, config.match, config.event) },
            mapComponent = _koin.get { parametersOf(componentContext) },
        )

        AppConfig.ChatList -> Child.ChatList(
            _koin.get { parametersOf(componentContext, this@RootComponent) }
        )

        is AppConfig.Chat -> Child.Chat(
            _koin.get { parametersOf(componentContext, config.user, config.chat, this@RootComponent) }
        )

        is AppConfig.Create -> Child.Create(
            _koin.get { parametersOf(componentContext, config.rentalContext, ::onEventCreated) },
            _koin.get { parametersOf(componentContext) }
        )

        AppConfig.ProfileHome -> Child.Profile(
            _koin.get { parametersOf(componentContext, this@RootComponent) }
        )

        is AppConfig.Teams -> Child.Teams(
            _koin.get {
                parametersOf(
                    componentContext,
                    config.freeAgents,
                    config.event,
                    config.selectedFreeAgentId,
                    this@RootComponent,
                )
            }
        )

        AppConfig.Events -> Child.EventManagement(
            _koin.get { parametersOf(componentContext, this@RootComponent) }
        )

        AppConfig.RefundManager -> Child.RefundManager(
            _koin.get { parametersOf(componentContext, this@RootComponent) }
        )

        AppConfig.ProfileDetails -> Child.ProfileDetails(
            _koin.get { parametersOf(componentContext) }
        )
    }

    sealed class Child {
        data object Splash : Child()
        data class Login(val component: AuthComponent) : Child()
        data class Search(val component: EventSearchComponent, val mapComponent: MapComponent) : Child()
        data class EventContent(val component: EventDetailComponent, val mapComponent: MapComponent) : Child()
        data class OrganizationDetail(val component: OrganizationDetailComponent) : Child()
        data class MatchContent(
            val component: MatchContentComponent,
            val mapComponent: MapComponent,
        ) : Child()
        data class ChatList(val component: ChatListComponent) : Child()
        data class Chat(val component: ChatGroupComponent) : Child()
        data class Create(val component: CreateEventComponent, val mapComponent: MapComponent) : Child()
        data class Profile(val component: ProfileComponent) : Child()
        data class Teams(val component: TeamManagementComponent) : Child()
        data class EventManagement(val component: EventManagementComponent) : Child()
        data class RefundManager(val component: RefundManagerComponent) : Child()
        data class ProfileDetails(val component: ProfileDetailsComponent) : Child()
    }

    sealed class DeepLinkNav {
        data class Event(val eventId: String) : DeepLinkNav()
        data object Refresh : DeepLinkNav()
        data object Return : DeepLinkNav()
    }
}
