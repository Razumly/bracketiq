package com.razumly.mvp.home.presentation

import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.value.Value
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.eventContent.presentation.MatchContentComponent
import com.razumly.mvp.eventContent.presentation.TournamentContentComponent
import com.razumly.mvp.eventCreate.presentation.CreateEventComponent
import com.razumly.mvp.eventFollowing.presentation.FollowingEventListComponent
import com.razumly.mvp.eventSearch.presentation.SearchEventListComponent
import com.razumly.mvp.profile.presentation.ProfileComponent
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable


interface HomeComponent {
    val childStack: Value<ChildStack<*, Child>>
    val selectedPage: StateFlow<Page>
    fun onTabSelected(page: Page)

    fun onBack()

    sealed class Child {
        data class Search(val component: SearchEventListComponent) : Child()
        data class TournamentContent(val component: TournamentContentComponent) : Child()
        data class MatchContent(val component: MatchContentComponent) : Child()
        data class Following(val component: FollowingEventListComponent) : Child()
        data class Create(val component: CreateEventComponent) : Child()
        data class Profile(val component: ProfileComponent) : Child()
    }

    @Serializable
    sealed class Config{
        @Serializable
        data class TournamentDetail(
            val tournamentId: String,
        ) : Config()

        @Serializable
        data class MatchDetail(
            val match: MatchWithRelations,
        ) : Config()

        @Serializable
        data object Following : Config()

        @Serializable
        data object Create : Config()

        @Serializable
        data object Profile : Config()

        @Serializable
        data object Search : Config()
    }

    enum class Page {
        EventList, Following, Create, Profile
    }
}