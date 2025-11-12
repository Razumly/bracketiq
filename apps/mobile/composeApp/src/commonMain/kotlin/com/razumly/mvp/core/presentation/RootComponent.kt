package com.razumly.mvp.core.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.pushNew
import com.arkivanov.decompose.router.stack.replaceAll
import com.arkivanov.decompose.value.Value
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.chat.ChatGroupComponent
import com.razumly.mvp.chat.ChatListComponent
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IUserRepository
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

class RootComponent(
    componentContext: ComponentContext,
    deepLinkNavStart: DeepLinkNav?,
    val permissionsController: PermissionsController,
    val locationTracker: LocationTracker,
    private val userRepository: IUserRepository
) : ComponentContext by componentContext, INavigationHandler {

    private val navigation = StackNavigation<AppConfig>()
    private val _koin = getKoin()
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val deepLinkNav = MutableStateFlow(deepLinkNavStart)

    private val _selectedPage = MutableStateFlow<AppConfig>(AppConfig.Search())
    val selectedPage: StateFlow<AppConfig> = _selectedPage.asStateFlow()

    val childStack: Value<ChildStack<AppConfig, Child>> = childStack(
        source = navigation,
        initialConfiguration = AppConfig.Login, // Always start with login check
        serializer = AppConfig.serializer(),
        handleBackButton = true,
        childFactory = ::createChild
    )

    init {
        scope.launch {
            // Check if user is already logged in
            userRepository.currentUser.collect { userResult ->
                val currentConfig = childStack.value.active.configuration

                userResult.fold(
                    onSuccess = { userData ->
                        if (userData.id.isNotBlank() && currentConfig == AppConfig.Login) {
                            // User is logged in, navigate to main app
                            handleDeepLinkOrDefault()
                        } else if (userData.id.isBlank() && currentConfig != AppConfig.Login) {
                            // User is not logged in, navigate to login
                            navigation.replaceAll(AppConfig.Login)
                        }
                    },
                    onFailure = {
                        if (currentConfig != AppConfig.Login) {
                            navigation.replaceAll(AppConfig.Login)
                        }
                    }
                )
            }
        }
    }

    private fun handleDeepLinkOrDefault() {
        val deepLinkNavVal = deepLinkNav.value
        val targetConfig = when (deepLinkNavVal) {
            is DeepLinkNav.Event -> AppConfig.Search(eventId = deepLinkNavVal.eventId)
            is DeepLinkNav.Tournament -> AppConfig.Search(tournamentId = deepLinkNavVal.tournamentId)
            is DeepLinkNav.Refresh -> AppConfig.ProfileHome
            is DeepLinkNav.Return -> AppConfig.ProfileHome
            else -> AppConfig.Search()
        }
        navigation.replaceAll(targetConfig)
        _selectedPage.value = targetConfig
        deepLinkNav.value = null
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
        _selectedPage.value = page
        when (page) {
            is AppConfig.Search -> navigation.replaceAll(AppConfig.Search())
            AppConfig.ChatList -> navigation.replaceAll(AppConfig.ChatList)
            AppConfig.Create -> navigation.replaceAll(AppConfig.Create)
            AppConfig.ProfileHome -> navigation.replaceAll(AppConfig.ProfileHome)
            else -> {}
        }
    }

    fun onBackClicked() {
        val stack = childStack.value
        if (stack.backStack.isNotEmpty()) {
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
            } catch (e: Exception) {
                Napier.w("Location permission failed: ${e.message}")
            }

            try {
                permissionsController.providePermission(Permission.REMOTE_NOTIFICATION)
            } catch (deniedAlwaysException: DeniedAlwaysException) {
                Napier.w("Notification permission always denied")
            } catch (denied: DeniedException) {
                Napier.w("Notification permission denied")
            } catch (e: Exception) {
                Napier.w("Notification permission failed: ${e.message}")
            }
        }
    }

    override fun navigateToMatch(match: MatchWithRelations, event: Event) {
        navigation.pushNew(AppConfig.MatchDetail(match, event))
    }

    override fun navigateToTeams(freeAgents: List<String>, event: EventAbs?) {
        navigation.pushNew(AppConfig.Teams(freeAgents, event))
    }

    override fun navigateToChat(user: UserData?, chat: ChatGroupWithRelations?) {
        navigation.pushNew(AppConfig.Chat(user, chat))
    }

    override fun navigateToEvent(event: EventAbs) {
        navigation.pushNew(AppConfig.EventDetail(event))
    }

    override fun navigateToEvents() {
        navigation.pushNew(AppConfig.Events)
    }

    override fun navigateToRefunds() {
        navigation.pushNew(AppConfig.RefundManager)
    }

    override fun navigateToLogin() {
        navigation.replaceAll(AppConfig.Login)
    }

    override fun navigateToSearch() {
        navigation.replaceAll(AppConfig.Search())
        _selectedPage.value = AppConfig.Search()
    }

    override fun navigateBack() {
        navigation.pop()
    }

    private fun onEventCreated() {
        navigateToSearch()
    }

    private fun createChild(
        config: AppConfig,
        componentContext: ComponentContext
    ): Child = when (config) {
        AppConfig.Login -> Child.Login(
            _koin.get { parametersOf(componentContext, this@RootComponent) }
        )

        is AppConfig.Search -> Child.Search(
            _koin.get {
                parametersOf(componentContext, config.eventId, config.tournamentId, this@RootComponent)
            },
            _koin.get { parametersOf(componentContext) }
        )

        is AppConfig.EventDetail -> Child.EventContent(
            _koin.get { parametersOf(componentContext, config.event, this@RootComponent) },
            _koin.get { parametersOf(componentContext) }
        )

        is AppConfig.MatchDetail -> Child.MatchContent(
            _koin.get { parametersOf(componentContext, config.match, config.event) }
        )

        AppConfig.ChatList -> Child.ChatList(
            _koin.get { parametersOf(componentContext, this@RootComponent) }
        )

        is AppConfig.Chat -> Child.Chat(
            _koin.get { parametersOf(componentContext, config.user, config.chat) }
        )

        AppConfig.Create -> Child.Create(
            _koin.get { parametersOf(componentContext, ::onEventCreated) },
            _koin.get { parametersOf(componentContext) }
        )

        AppConfig.ProfileHome -> Child.Profile(
            _koin.get { parametersOf(componentContext, this@RootComponent) }
        )

        is AppConfig.Teams -> Child.Teams(
            _koin.get { parametersOf(componentContext, config.freeAgents, config.event, this@RootComponent) }
        )

        AppConfig.Events -> Child.EventManagement(
            _koin.get { parametersOf(componentContext, this@RootComponent) }
        )

        AppConfig.RefundManager -> Child.RefundManager(
            _koin.get { parametersOf(componentContext) }
        )

        AppConfig.ProfileDetails -> Child.ProfileDetails(
            _koin.get { parametersOf(componentContext) }
        )
    }

    sealed class Child {
        data class Login(val component: AuthComponent) : Child()
        data class Search(val component: EventSearchComponent, val mapComponent: MapComponent) : Child()
        data class EventContent(val component: EventDetailComponent, val mapComponent: MapComponent) : Child()
        data class MatchContent(val component: MatchContentComponent) : Child()
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
        data class Tournament(val tournamentId: String) : DeepLinkNav()
        data object Refresh : DeepLinkNav()
        data object Return : DeepLinkNav()
    }
}
