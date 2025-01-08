package com.razumly.mvp.core.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.pushNew
import com.arkivanov.decompose.router.stack.replaceAll
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.eventContent.presentation.DefaultTournamentContentComponent
import com.razumly.mvp.eventCreate.presentation.DefaultCreateEventComponent
import com.razumly.mvp.eventFollowing.presentation.FollowingEventListComponent
import com.razumly.mvp.eventSearch.presentation.SearchEventListComponent
import com.razumly.mvp.profile.presentation.DefaultProfileComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin
import com.razumly.mvp.core.presentation.HomeComponent.*

class DefaultHomeComponent(
    componentContext: ComponentContext,
) : HomeComponent, ComponentContext by componentContext {

    init {
        println("iOS Home: Component initialized")
    }

    private val navigation = StackNavigation<Config>()
    private val _koin = getKoin()
    private val _selectedPage = MutableStateFlow(Page.EventList)
    override val selectedPage = _selectedPage.asStateFlow()

    override val childStack = childStack(
        source = navigation,
        initialConfiguration = Config.Search,
        serializer = Config.serializer(),
        handleBackButton = true,
        childFactory = ::createChild
    ).also {
        println("iOS Home: Child stack initialized with Search configuration")
    }

    override fun onBack() {
        if (childStack.value.backStack.isNotEmpty()) {
            navigation.pop()
        }
    }

    private fun createChild(
        config: Config,
        componentContext: ComponentContext
    ): Child {
        println("iOS Home: Creating child for config: $config")
        return when (config) {
            is Config.Search -> {
                println("iOS Home: Creating Search child")
                Child.Search(
                    _koin.inject<SearchEventListComponent> {
                        parametersOf(componentContext, ::onTournamentSelected)
                    }.value
                ).also { println("iOS Home: Search child created") }
            }
            is Config.TournamentDetail -> {
                println("iOS Home: Creating Tournament detail child for id: ${config.tournamentId}")
                Child.TournamentContent(
                    _koin.inject<DefaultTournamentContentComponent> {
                        parametersOf(componentContext, config.tournamentId, ::onMatchSelected)
                    }.value
                )
            }
            // ... other cases with similar logging
            else -> {
                println("iOS Home: Creating child for config: $config")
                when (config) {
                    is Config.Following -> Child.Following(
                        _koin.inject<FollowingEventListComponent> {
                            parametersOf(componentContext, ::onTournamentSelected)
                        }.value
                    )
                    is Config.Create -> Child.Create(
                        _koin.inject<DefaultCreateEventComponent> {
                            parametersOf(componentContext)
                        }.value
                    )
                    is Config.Profile -> Child.Profile(
                        _koin.inject<DefaultProfileComponent> {
                            parametersOf(componentContext)
                        }.value
                    )
                    else -> throw IllegalArgumentException("Unknown config: $config")
                }
            }
        }
    }

    private fun onTournamentSelected(tournamentId: String) {
        println("iOS Home: Tournament selected: $tournamentId")
        navigation.pushNew(Config.TournamentDetail(tournamentId))
    }

    private fun onMatchSelected(match: MatchMVP) {
        println("iOS Home: Match selected: ${match.id}")
        navigation.pushNew(Config.MatchDetail(match))
    }

    override fun onTabSelected(page: Page) {
        println("iOS Home: Tab selected: $page")
        _selectedPage.value = page
        when (page) {
            Page.EventList -> navigation.replaceAll(Config.Search)
            Page.Following -> navigation.replaceAll(Config.Following)
            Page.Create -> navigation.replaceAll(Config.Create)
            Page.Profile -> navigation.replaceAll(Config.Profile)
        }
    }
}

