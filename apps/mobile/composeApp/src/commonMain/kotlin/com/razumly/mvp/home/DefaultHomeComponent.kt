package com.razumly.mvp.home

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.pushNew
import com.arkivanov.decompose.router.stack.replaceAll
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.eventCreate.DefaultCreateEventComponent
import com.razumly.mvp.eventFollowing.FollowingEventListComponent
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.eventSearch.SearchEventListComponent
import com.razumly.mvp.home.HomeComponent.Child
import com.razumly.mvp.home.HomeComponent.Config
import com.razumly.mvp.matchDetailScreen.DefaultMatchContentComponent
import com.razumly.mvp.profile.DefaultProfileComponent
import com.razumly.mvp.tournamentDetailScreen.DefaultTournamentContentComponent
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
                        parametersOf(componentContext, ::onTournamentSelected)
                    }.value,
                    _koin.inject<MapComponent> {
                        parametersOf(componentContext)
                    }.value
                )
            }
            is Config.TournamentDetail -> {
                Child.TournamentContent(
                    _koin.inject<DefaultTournamentContentComponent> {
                        parametersOf(componentContext, config.tournamentId, ::onMatchSelected)
                    }.value
                )
            }
            is Config.MatchDetail -> {
                Child.MatchContent(
                    _koin.inject<DefaultMatchContentComponent> {
                        parametersOf(componentContext, config.match)
                    }.value
                )
            }
            is Config.Following -> Child.Following(
                _koin.inject<FollowingEventListComponent> {
                    parametersOf(componentContext, ::onTournamentSelected)
                }.value
            )
            is Config.Create -> Child.Create(
                _koin.inject<DefaultCreateEventComponent> {
                    parametersOf(componentContext, ::onEventCreated)
                }.value
            )
            is Config.Profile -> Child.Profile(
                _koin.inject<DefaultProfileComponent> {
                    parametersOf(
                        componentContext,
                        onNavigateToLogin
                        )
                }.value
            )
        }
    }

    private fun onTournamentSelected(tournamentId: String) {
        navigation.pushNew(Config.TournamentDetail(tournamentId))
    }

    private fun onMatchSelected(match: MatchWithRelations) {
        navigation.pushNew(Config.MatchDetail(match))
    }

    private fun onEventCreated() {
        navigation.replaceAll(Config.Search)
        _selectedPage.value = Config.Search
    }

    override fun onTabSelected(page: Config) {
        _selectedPage.value = page
        when (page) {
            Config.Search -> navigation.replaceAll(Config.Search)
            Config.Following -> navigation.replaceAll(Config.Following)
            Config.Create -> navigation.replaceAll(Config.Create)
            Config.Profile -> navigation.replaceAll(Config.Profile)
            else -> {}
        }
    }
}
