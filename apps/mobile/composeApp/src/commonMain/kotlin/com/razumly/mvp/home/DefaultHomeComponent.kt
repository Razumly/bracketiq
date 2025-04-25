package com.razumly.mvp.home

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.pushNew
import com.arkivanov.decompose.router.stack.replaceAll
import com.razumly.mvp.Message.DefaultMessagesComponent
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.eventCreate.DefaultCreateEventComponent
import com.razumly.mvp.eventDetail.DefaultEventContentComponent
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.eventSearch.SearchEventListComponent
import com.razumly.mvp.home.HomeComponent.Child
import com.razumly.mvp.home.HomeComponent.Config
import com.razumly.mvp.matchDetail.DefaultMatchContentComponent
import com.razumly.mvp.profile.DefaultProfileComponent
import com.razumly.mvp.teamManagement.TeamManagementComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

class DefaultHomeComponent(
    componentContext: ComponentContext,
    private val onNavigateToLogin: () -> Unit,
) : HomeComponent, ComponentContext by componentContext {
    init {
        println("iOS Home: Component initialized")
    }

    private val navigation = StackNavigation<Config>()
    private val _koin = getKoin()
    private val _selectedPage = MutableStateFlow<Config>(Config.Search)
    override val selectedPage = _selectedPage.asStateFlow()

    override val childStack = childStack(
        source = navigation,
        initialConfiguration = Config.Search,
        serializer = Config.serializer(),
        handleBackButton = true,
        childFactory = ::createChild
    )

    override fun onBack() {
        if (childStack.value.backStack.isNotEmpty()) {
            navigation.pop()
        }
    }

    private fun createChild(
        config: Config,
        componentContext: ComponentContext
    ): Child {
        return when (config) {
            is Config.Search -> {
                Child.Search(
                    _koin.inject<SearchEventListComponent> {
                        parametersOf(componentContext, ::onEventSelected)
                    }.value,
                    _koin.inject<MapComponent> {
                        parametersOf(componentContext)
                    }.value
                )
            }
            is Config.EventDetail -> {
                Child.EventContent(
                    _koin.inject<DefaultEventContentComponent> {
                        parametersOf(
                            componentContext,
                            config.event,
                            ::onMatchSelected,
                            ::onNavigateToTeamSettings
                        )
                    }.value,
                    _koin.inject<MapComponent> {
                        parametersOf(componentContext)
                    }.value
                )
            }
            is Config.MatchDetail -> {
                Child.MatchContent(
                    _koin.inject<DefaultMatchContentComponent> {
                        parametersOf(componentContext, config.match, config.tournament)
                    }.value
                )
            }
            is Config.Messages -> Child.Messages(
                _koin.inject<DefaultMessagesComponent> {
                    parametersOf(componentContext, ::onEventSelected)
                }.value
            )
            is Config.Create -> Child.Create(
                _koin.inject<DefaultCreateEventComponent> {
                    parametersOf(componentContext, ::onEventCreated)
                }.value,
                _koin.inject<MapComponent> {
                    parametersOf(componentContext)
                }.value
            )
            is Config.Profile -> Child.Profile(
                _koin.inject<DefaultProfileComponent> {
                    parametersOf(
                        componentContext,
                        onNavigateToLogin,
                        ::onNavigateToTeamSettings
                        )
                }.value
            )

            is Config.Teams -> Child.Teams(
                _koin.inject<TeamManagementComponent> {
                    parametersOf(
                        componentContext,
                        config.freeAgents,
                        config.event
                    )
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
        navigation.replaceAll(Config.Search)
        _selectedPage.value = Config.Search
    }

    private fun onNavigateToTeamSettings(freeAgents: List<String>, event: EventAbs?) {
        navigation.pushNew(Config.Teams(freeAgents, event))
    }

    override fun onTabSelected(page: Config) {
        _selectedPage.value = page
        when (page) {
            Config.Search -> navigation.replaceAll(Config.Search)
            Config.Messages -> navigation.replaceAll(Config.Messages)
            Config.Create -> navigation.replaceAll(Config.Create)
            Config.Profile -> navigation.replaceAll(Config.Profile)
            else -> {}
        }
    }
}
