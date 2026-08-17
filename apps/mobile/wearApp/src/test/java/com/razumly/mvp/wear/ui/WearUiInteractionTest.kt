package com.razumly.mvp.wear.ui

import android.app.Application
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.razumly.mvp.wear.MvpWearActions
import com.razumly.mvp.wear.MvpWearUiState
import com.razumly.mvp.wear.WearIncidentField
import com.razumly.mvp.wear.WearIncidentMode
import com.razumly.mvp.wear.WearRoute
import com.razumly.mvp.wear.data.WearIncidentTypeDefinitionDto
import com.razumly.mvp.wear.data.WearMatch
import com.razumly.mvp.wear.data.WearMatchDto
import com.razumly.mvp.wear.data.WearMatchIncidentDto
import com.razumly.mvp.wear.data.WearResolvedMatchRulesDto
import com.razumly.mvp.wear.data.WearTeam
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class WearUiInteractionTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun givenAnEmptyMatchList_whenRendered_thenOnlyOneRefreshActionIsShown() {
        composeRule.setContent {
            MvpWearApp(
                state = MvpWearUiState(
                    route = WearRoute.MATCHES,
                    isAuthenticated = true,
                    matches = emptyList(),
                ),
                actions = actions(),
            )
        }

        composeRule.onAllNodesWithText("Refresh").assertCountEquals(1)
    }

    @Test
    fun givenAnEditedIncident_whenDeleting_thenConfirmationIsRequiredBeforeTheDeleteCallback() {
        val route = mutableStateOf(WearRoute.INCIDENT_EDITOR)
        val deleteCalls = AtomicInteger(0)
        composeRule.setContent {
            MvpWearApp(
                state = incidentState(route.value),
                actions = actions(
                    onBack = { route.value = WearRoute.INCIDENT_EDITOR },
                    onRequestDeleteIncident = { route.value = WearRoute.INCIDENT_DELETE_CONFIRM },
                    onDeleteIncident = { deleteCalls.incrementAndGet() },
                ),
            )
        }

        composeRule.onNodeWithText("Delete incident").performClick()
        composeRule.onNodeWithText("Remove this Goal?").assertExists()
        assertEquals(0, deleteCalls.get())

        composeRule.onNodeWithText("Keep").performClick()
        composeRule.onNodeWithText("Delete incident").assertExists()
        assertEquals(0, deleteCalls.get())

        composeRule.onNodeWithText("Delete incident").performClick()
        composeRule.onNodeWithText("Delete").performClick()
        assertEquals(1, deleteCalls.get())
    }

    private fun incidentState(route: WearRoute): MvpWearUiState {
        val incident = WearMatchIncidentDto(
            id = "incident_1",
            eventId = "event_1",
            matchId = "match_1",
            eventTeamId = "team_1",
            incidentType = "GOAL",
            sequence = 1,
            minute = 74,
            clock = "73:00",
            clockSeconds = 73 * 60,
        )
        val rules = WearResolvedMatchRulesDto(
            incidentTypeDefinitions = listOf(
                WearIncidentTypeDefinitionDto(code = "GOAL", label = "Goal"),
            ),
        )
        val team = WearTeam(id = "team_1", label = "Harbor FC", players = emptyList())
        val match = WearMatch(
            id = "match_1",
            number = 1,
            eventId = "event_1",
            eventName = "Spring Invitational",
            startIso = null,
            endIso = null,
            fieldLabel = "Field 1",
            division = "Premier",
            status = "IN_PROGRESS",
            team1 = team,
            team2 = WearTeam(id = "team_2", label = "Summit", players = emptyList()),
            officialCheckedIn = true,
            rules = rules,
            raw = WearMatchDto(
                id = "match_1",
                eventId = "event_1",
                team1Id = "team_1",
                team2Id = "team_2",
                incidents = listOf(incident),
            ),
        )
        return MvpWearUiState(
            route = route,
            isAuthenticated = true,
            matches = listOf(match),
            selectedMatchId = match.id,
            selectedTeamId = team.id,
            selectedIncidentCode = incident.incidentType,
            selectedIncidentId = incident.id,
            incidentMinute = incident.minute ?: 1,
            incidentClockSeconds = incident.clockSeconds ?: 0,
            incidentMode = WearIncidentMode.EDIT,
        )
    }

    private fun actions(
        onBack: () -> Unit = {},
        onRequestDeleteIncident: () -> Unit = {},
        onDeleteIncident: () -> Unit = {},
    ): MvpWearActions = MvpWearActions(
        onEmailChange = {},
        onPasswordChange = {},
        onSignIn = {},
        onLogout = {},
        onRefresh = {},
        onMatchSelected = {},
        onBack = onBack,
        onCheckIn = {},
        onStartTimer = {},
        onOpenTimer = {},
        onTimerTapped = {},
        onResetTimer = {},
        onEndSegment = {},
        onStartNextSegment = {},
        onEndMatch = {},
        onShowActionMenu = {},
        onShowIncidentList = {},
        onTeamSelected = {},
        onOpenIncident = {},
        onEditIncidentField = { _: WearIncidentField -> },
        onIncidentSelected = {},
        onPlayerSelected = {},
        onMinuteAdjusted = {},
        onTimeDone = {},
        onFinishIncident = {},
        onRequestDeleteIncident = onRequestDeleteIncident,
        onDeleteIncident = onDeleteIncident,
        onCancelIncident = {},
    )
}
