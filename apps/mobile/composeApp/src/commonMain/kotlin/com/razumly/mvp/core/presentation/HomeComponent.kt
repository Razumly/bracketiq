package com.razumly.mvp.core.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.pushNew
import com.arkivanov.decompose.router.stack.replaceCurrent
import com.arkivanov.decompose.value.Value
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.eventContent.presentation.DefaultMatchContentComponent
import com.razumly.mvp.eventContent.presentation.DefaultTournamentContentComponent
import com.razumly.mvp.eventContent.presentation.MatchContentComponent
import com.razumly.mvp.eventContent.presentation.TournamentContentComponent
import com.razumly.mvp.eventCreate.presentation.CreateEventComponent
import com.razumly.mvp.eventCreate.presentation.DefaultCreateEventComponent
import com.razumly.mvp.eventFollowing.presentation.FollowingEventListComponent
import com.razumly.mvp.eventSearch.presentation.SearchEventListComponent
import com.razumly.mvp.profile.presentation.DefaultProfileComponent
import com.razumly.mvp.profile.presentation.ProfileComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

interface HomeComponent {
    val childStack: Value<ChildStack<*, Child>>
    val selectedTab: StateFlow<Tab>
    fun onTabSelected(tab: Tab)

    sealed class Child {
        data class Search(val component: SearchEventListComponent) : Child()
        data class TournamentContent(val component: TournamentContentComponent) : Child()
        data class MatchContent(val component: MatchContentComponent) : Child()
        data class Following(val component: FollowingEventListComponent) : Child()
        data class Create(val component: CreateEventComponent) : Child()
        data class Profile(val component: ProfileComponent) : Child()
    }
}

class DefaultHomeComponent(
    componentContext: ComponentContext,
) : HomeComponent, ComponentContext by componentContext {

    private val navigation = StackNavigation<ConfigHome>()
    private val _koin = getKoin()
    private val _selectedTab = MutableStateFlow(Tab.EventList)
    override val selectedTab = _selectedTab.asStateFlow()

    private val _showBottomBar = MutableStateFlow(true)

    override val childStack = childStack(
        source = navigation,
        initialConfiguration = ConfigHome.Search,
        serializer = ConfigHome.serializer(),
        handleBackButton = true,
        childFactory = ::createChild
    )

    private fun createChild(
        config: ConfigHome,
        componentContext: ComponentContext
    ): HomeComponent.Child = when (config) {
        is ConfigHome.Search -> HomeComponent.Child.Search(
            _koin.inject<SearchEventListComponent> {
                parametersOf(componentContext, ::onTournamentSelected)
            }.value
        )

        is ConfigHome.TournamentDetail -> HomeComponent.Child.TournamentContent(
            _koin.inject<DefaultTournamentContentComponent> {
                parametersOf(componentContext, config.tournamentId, ::onMatchSelected)
            }.value
        )

        is ConfigHome.MatchDetail -> HomeComponent.Child.MatchContent(
            _koin.inject<DefaultMatchContentComponent> {
                parametersOf(componentContext, config.match)
            }.value
        )

        is ConfigHome.Following -> HomeComponent.Child.Following(
            _koin.inject<FollowingEventListComponent> {
                parametersOf(componentContext, ::onTournamentSelected)
            }.value
        )

        is ConfigHome.Create -> HomeComponent.Child.Create(
            _koin.inject<DefaultCreateEventComponent> {
                parametersOf(componentContext)
            }.value
        )

        is ConfigHome.Profile -> HomeComponent.Child.Profile(
            _koin.inject<DefaultProfileComponent> {
                parametersOf(componentContext)
            }.value
        )
    }


    private fun onTournamentSelected(tournamentId: String) {
        navigation.pushNew(ConfigHome.TournamentDetail(tournamentId))
    }

    private fun onMatchSelected(match: MatchMVP) {
        navigation.pushNew(ConfigHome.MatchDetail(match))
    }

    override fun onTabSelected(tab: Tab) {
        _selectedTab.value = tab
        when (tab) {
            Tab.EventList -> navigation.replaceCurrent(ConfigHome.Search)
            Tab.Following -> navigation.replaceCurrent(ConfigHome.Following)
            Tab.Create -> navigation.replaceCurrent(ConfigHome.Create)
            Tab.Profile -> navigation.replaceCurrent(ConfigHome.Profile)
        }
    }
}
