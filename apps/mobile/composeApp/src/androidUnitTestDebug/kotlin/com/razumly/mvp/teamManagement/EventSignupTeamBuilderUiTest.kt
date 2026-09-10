package com.razumly.mvp.teamManagement

import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class EventSignupTeamBuilderUiTest {
    @get:Rule val compose = createComposeRule()
    private val owner = UserData(
        firstName = "Taylor", lastName = "Test", userName = "taylor", id = "owner",
        friendIds = emptyList(), friendRequestIds = emptyList(), friendRequestSentIds = emptyList(),
        followingIds = emptyList(), hasStripeAccount = false, uploadedImages = emptyList(),
    )
    private val team = Team(owner.id).copy(id = "stable-team", name = "River Crew", sport = "Volleyball", teamSize = 8)

    private fun show(step: String, onFinish: (Team) -> Unit = {}, onSavePerson: (suspend (TeamBuilderPersonInvite) -> Result<Unit>)? = null) {
        compose.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    Box(Modifier.width(420.dp).height(900.dp)) {
                        CreateTeamBuilderScreen(
                            draft = TeamWithPlayers(team, owner, listOf(owner), emptyList()),
                            sports = emptyList(), freeAgents = emptyList(), suggestions = emptyList(),
                            currentUser = owner, eventSignupStep = step,
                            selectedEvent = Event(id = "event", name = "River City Cup", teamSizeLimit = 8),
                            onSavePerson = onSavePerson, onSearch = {}, onDismiss = {},
                            onFinish = { saved, _, _ -> onFinish(saved) },
                        )
                    }
                }
            }
        }
    }

    @Test
    fun givenEventTeamDetails_whenSaved_thenReturnsTheStableTeamWithoutStaffOrFreeAgentSteps() {
        var saved: Team? = null
        show("team", onFinish = { saved = it })
        compose.onAllNodes(hasSetTextAction())[0].performTextReplacement("Cascade Crew")
        compose.onNodeWithText("Save team and continue").performClick()
        assertEquals("stable-team", assertNotNull(saved).id)
        assertEquals("Cascade Crew", saved?.name)
        compose.onAllNodesWithText("Set team leadership").assertCountEquals(0)
        compose.onAllNodesWithText("Free agents").assertCountEquals(0)
    }

    @Test
    fun givenOptionalPlayers_whenSkipped_thenReturnsToTheEventWithoutCreatingAnotherTeam() {
        var saves = 0
        show("players", onFinish = { saves += 1; assertEquals(team, it) })
        compose.onNodeWithText("Add players (optional)").assertIsDisplayed()
        compose.onNodeWithText("Continue to event").performClick()
        assertEquals(1, saves)
        compose.onAllNodesWithText("Save team and continue").assertCountEquals(0)
    }

    @Test
    fun givenPlayerSaveFailure_whenRetried_thenKeepsTheSameInvitationRequestAndEnteredFields() {
        val requestIds = mutableListOf<String>()
        show("players", onSavePerson = { person ->
            requestIds += person.id
            Result.failure(IllegalStateException("Could not save the Player."))
        })
        compose.onNodeWithText("New person").performClick()
        compose.onNodeWithTag("team-builder-person-first").performTextReplacement("Jordan")
        compose.onNodeWithTag("team-builder-person-last").performTextReplacement("River")
        compose.onNodeWithText("Save invite").performScrollTo().performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Could not save the Player.").assertIsDisplayed()
        compose.onNodeWithText("Save invite").performScrollTo().performClick()
        compose.waitForIdle()
        assertEquals(2, requestIds.size)
        assertEquals(requestIds[0], requestIds[1])
    }
}
