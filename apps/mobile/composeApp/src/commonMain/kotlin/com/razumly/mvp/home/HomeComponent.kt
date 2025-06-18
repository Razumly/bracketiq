package com.razumly.mvp.home

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.pushNew
import com.arkivanov.decompose.router.stack.replaceAll
import com.arkivanov.decompose.value.Value
import com.razumly.mvp.chat.ChatGroupComponent
import com.razumly.mvp.chat.ChatListComponent
import com.razumly.mvp.chat.DefaultChatGroupComponent
import com.razumly.mvp.chat.DefaultChatListComponent
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.presentation.RootComponent.DeepLinkNav
import com.razumly.mvp.eventCreate.CreateEventComponent
import com.razumly.mvp.eventCreate.DefaultCreateEventComponent
import com.razumly.mvp.eventDetail.DefaultEventDetailComponent
import com.razumly.mvp.eventDetail.EventDetailComponent
import com.razumly.mvp.eventManagement.DefaultEventManagementComponent
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.eventSearch.DefaultSearchEventListComponent
import com.razumly.mvp.home.HomeComponent.Child
import com.razumly.mvp.home.HomeComponent.Config
import com.razumly.mvp.matchDetail.DefaultMatchContentComponent
import com.razumly.mvp.matchDetail.MatchContentComponent
import com.razumly.mvp.profile.DefaultProfileComponent
import com.razumly.mvp.profile.ProfileComponent
import com.razumly.mvp.teamManagement.DefaultTeamManagementComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

interface HomeComponent {
    val childStack: Value<ChildStack<*, Child>>
    val selectedPage: StateFlow<Config>

    fun onTabSelected(page: Config)
    fun handleDeepLink(deepLinkNav: DeepLinkNav?)

    fun onBack()

    sealed class Child {
        data class Search(
            val component: DefaultSearchEventListComponent, val mapComponent: MapComponent
        ) : Child()

        data class EventContent(
            val component: EventDetailComponent, val mapComponent: MapComponent
        ) : Child()

        data class MatchContent(val component: MatchContentComponent) : Child()
        data class ChatList(val component: ChatListComponent) : Child()
        data class Chat(val component: ChatGroupComponent) : Child()
        data class Create(val component: CreateEventComponent, val mapComponent: MapComponent) :
            Child()

        data class Profile(val component: ProfileComponent) : Child()
        data class Teams(val component: DefaultTeamManagementComponent) : Child()
        data class Events(val component: DefaultEventManagementComponent) : Child()
    }

    @Serializable
    sealed class Config {
        @Serializable
        data class EventDetail(
            val event: EventAbs,
        ) : Config()

        @Serializable
        data class MatchDetail(
            val match: MatchWithRelations,
            val tournament: Tournament,
        ) : Config()

        @Serializable
        data object ChatList : Config()

        @Serializable
        data class Chat(
            val chatGroup: ChatGroupWithRelations,
        ) : Config()

        @Serializable
        data object Create : Config()

        @Serializable
        data object Profile : Config()

        @Serializable
        data class Search(val eventId: String? = null, val tournamentId: String? = null) : Config()

        @Serializable
        data class Teams(val freeAgents: List<String>, val event: EventAbs?) : Config()

        @Serializable
        data object Events : Config()
    }
}

class DefaultHomeComponent(
    componentContext: ComponentContext,
    private val onNavigateToLogin: () -> Unit,
    deepLinkNav: DeepLinkNav?,
) : HomeComponent, ComponentContext by componentContext {
    private val navigation = StackNavigation<Config>()
    private val _koin = getKoin()
    private val _selectedPage = MutableStateFlow<Config>(Config.Search())
    override val selectedPage = _selectedPage.asStateFlow()

    override val childStack = childStack(
        source = navigation, initialConfiguration = when (deepLinkNav) {
            is DeepLinkNav.Event -> Config.Search(eventId = deepLinkNav.eventId)
            is DeepLinkNav.Tournament -> Config.Search(tournamentId = deepLinkNav.tournamentId)
            is DeepLinkNav.Refresh -> Config.Profile
            is DeepLinkNav.Return -> Config.Profile
            else -> Config.Search()
        }, serializer = Config.serializer(), handleBackButton = true, childFactory = ::createChild
    )

    override fun onBack() {
        if (childStack.value.backStack.isNotEmpty()) {
            navigation.pop()
        }
    }
    override fun handleDeepLink(deepLinkNav: DeepLinkNav?) {
        when (deepLinkNav) {
            is DeepLinkNav.Event -> navigation.pushNew(Config.Search(eventId = deepLinkNav.eventId))
            is DeepLinkNav.Tournament -> navigation.pushNew(
                Config.Search(tournamentId = deepLinkNav.tournamentId)
            )
            is DeepLinkNav.Refresh -> navigation.replaceAll(Config.Profile)
            is DeepLinkNav.Return -> navigation.replaceAll(Config.Profile)
            else -> {}
        }
    }

    private fun createChild(
        config: Config, componentContext: ComponentContext
    ): Child {
        return when (config) {
            is Config.Search -> {
                Child.Search(_koin.inject<DefaultSearchEventListComponent> {
                    parametersOf(componentContext, ::onEventSelected, config.eventId, config.tournamentId)
                }.value, _koin.inject<MapComponent> {
                    parametersOf(componentContext)
                }.value
                )
            }

            is Config.EventDetail -> {
                Child.EventContent(_koin.inject<DefaultEventDetailComponent> {
                    parametersOf(
                        componentContext,
                        config.event,
                        ::onMatchSelected,
                        ::onNavigateToTeamSettings,
                        ::onBack,
                    )
                }.value, _koin.inject<MapComponent> {
                    parametersOf(componentContext)
                }.value
                )
            }

            is Config.MatchDetail -> Child.MatchContent(
                _koin.inject<DefaultMatchContentComponent> {
                    parametersOf(componentContext, config.match, config.tournament)
                }.value
            )

            is Config.ChatList -> Child.ChatList(
                _koin.inject<DefaultChatListComponent> {
                    parametersOf(componentContext, ::onNavigateToChat)
                }.value
            )

            is Config.Chat -> Child.Chat(
                _koin.inject<DefaultChatGroupComponent> {
                    parametersOf(componentContext, config.chatGroup)
                }.value
            )

            is Config.Create -> Child.Create(_koin.inject<DefaultCreateEventComponent> {
                parametersOf(componentContext, ::onEventCreated)
            }.value, _koin.inject<MapComponent> {
                parametersOf(componentContext)
            }.value
            )

            is Config.Profile -> Child.Profile(
                _koin.inject<DefaultProfileComponent> {
                    parametersOf(
                        componentContext,
                        onNavigateToLogin,
                        ::onNavigateToTeamSettings,
                        ::onNavigateToEvents
                    )
                }.value
            )

            is Config.Teams -> Child.Teams(
                _koin.inject<DefaultTeamManagementComponent> {
                    parametersOf(
                        componentContext, config.freeAgents, config.event, ::onBack
                    )
                }.value
            )

            Config.Events -> Child.Events(
                _koin.inject<DefaultEventManagementComponent> {
                    parametersOf(componentContext, ::onEventSelected, ::onBack)
                }.value
            )
        }
    }

    private fun onEventSelected(event: EventAbs) {
        navigation.pushNew(Config.EventDetail(event))
    }

    private fun onMatchSelected(match: MatchWithRelations, tournament: Tournament) {
        navigation.pushNew(Config.MatchDetail(match, tournament))
    }

    private fun onEventCreated() {
        navigation.replaceAll(Config.Search())
        _selectedPage.value = Config.Search()
    }

    private fun onNavigateToTeamSettings(freeAgents: List<String>, event: EventAbs?) {
        navigation.pushNew(Config.Teams(freeAgents, event))
    }

    private fun onNavigateToChat(chatGroup: ChatGroupWithRelations) {
        navigation.pushNew(Config.Chat(chatGroup))
    }

    private fun onNavigateToEvents() {
        navigation.pushNew(Config.Events)
    }

    override fun onTabSelected(page: Config) {
        _selectedPage.value = page
        when (page) {
            Config.Search() -> navigation.replaceAll(Config.Search())
            Config.ChatList -> navigation.replaceAll(Config.ChatList)
            Config.Create -> navigation.replaceAll(Config.Create)
            Config.Profile -> navigation.replaceAll(Config.Profile)
            else -> {}
        }
    }
}
