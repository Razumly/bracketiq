package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.encodeToString
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.assertNull

class TeamDtosTest {
    @Test
    fun to_update_dto_includes_player_registration_jersey_numbers() {
        val team = Team(
            division = "OPEN",
            name = "Aces",
            captainId = "user-1",
            playerIds = listOf("user-1", "user-2"),
            pending = listOf("user-3"),
            teamSize = 6,
            playerRegistrations = listOf(
                TeamPlayerRegistration(
                    id = "registration-1",
                    teamId = "team-1",
                    userId = "user-1",
                    status = "ACTIVE",
                    jerseyNumber = "7",
                    isCaptain = true,
                ),
                TeamPlayerRegistration(
                    id = "registration-2",
                    teamId = "team-1",
                    userId = "user-2",
                    status = "ACTIVE",
                    jerseyNumber = null,
                ),
                TeamPlayerRegistration(
                    id = "registration-3",
                    teamId = "team-1",
                    userId = "user-3",
                    status = "INVITED",
                    jerseyNumber = "12",
                ),
                TeamPlayerRegistration(
                    id = "registration-4",
                    teamId = "team-1",
                    userId = "user-4",
                    status = "INVITED",
                    jerseyNumber = "abc",
                ),
            ),
            id = "team-1",
        )

        val registrations = team.toUpdateDto().playerRegistrations.orEmpty()

        assertEquals(4, registrations.size)
        assertEquals("7", registrations.first { it.userId == "user-1" }.jerseyNumber)
        assertNull(registrations.first { it.userId == "user-2" }.jerseyNumber)
        assertEquals("12", registrations.first { it.userId == "user-3" }.jerseyNumber)
        assertNull(registrations.first { it.userId == "user-4" }.jerseyNumber)
    }

    @Test
    fun update_team_request_serialization_omits_derived_division_fields() {
        val team = Team(
            division = "c_skill_open_age_u18",
            name = "Aces",
            captainId = "user-1",
            playerIds = listOf("user-1"),
            pending = emptyList(),
            teamSize = 6,
            divisionTypeId = "skill_open_age_u18",
            divisionTypeName = "Open • U18",
            skillDivisionTypeId = "skill_open",
            skillDivisionTypeName = "Open",
            ageDivisionTypeId = "age_u18",
            ageDivisionTypeName = "U18",
            divisionGender = "C",
            id = "team-1",
        )

        val serialized = jsonMVP.encodeToString(
            UpdateTeamRequestDto(team = team.toUpdateDto())
        )

        assertTrue(serialized.contains("\"divisionTypeId\":\"skill_open_age_u18\""))
        assertTrue(serialized.contains("\"divisionTypeName\":\"Open • U18\""))
        assertFalse(serialized.contains("skillDivisionTypeId"))
        assertFalse(serialized.contains("skillDivisionTypeName"))
        assertFalse(serialized.contains("ageDivisionTypeId"))
        assertFalse(serialized.contains("ageDivisionTypeName"))
        assertFalse(serialized.contains("divisionGender"))
    }

    @Test
    fun update_team_request_serialization_omits_requested_fields() {
        val team = Team(
            division = "OPEN",
            name = "Aces",
            captainId = "user-1",
            managerId = "user-1",
            playerIds = listOf("user-1"),
            pending = listOf("user-2"),
            teamSize = 6,
            openRegistration = true,
            registrationPriceCents = 2500,
            playerRegistrations = listOf(
                TeamPlayerRegistration(
                    id = "registration-1",
                    teamId = "team-1",
                    userId = "user-1",
                    status = "ACTIVE",
                    isCaptain = true,
                ),
            ),
            parentTeamId = "parent-1",
            id = "team-1",
        )

        val serialized = jsonMVP.encodeToString(
            UpdateTeamRequestDto(
                team = team.toUpdateDto(
                    omitFields = setOf(
                        "assistantCoachIds",
                        "parentTeamId",
                        "playerRegistrations",
                        "openRegistration",
                        "registrationPriceCents",
                    ),
                ),
            ),
        )

        assertFalse(serialized.contains("assistantCoachIds"))
        assertFalse(serialized.contains("parentTeamId"))
        assertFalse(serialized.contains("playerRegistrations"))
        assertFalse(serialized.contains("openRegistration"))
        assertFalse(serialized.contains("registrationPriceCents"))
        assertTrue(serialized.contains("\"coachIds\":[]"))
        assertTrue(serialized.contains("\"captainId\":\"user-1\""))
    }

    @Test
    fun team_api_dto_parses_required_templates_and_consent_registration_fields() {
        val dto = TeamApiDto(
            id = "team-1",
            name = "Aces",
            division = "OPEN",
            captainId = "user-1",
            playerIds = listOf("user-1"),
            teamSize = 6,
            requiredTemplateIds = listOf(" template-a ", "", "template-a", "template-b "),
            playerRegistrations = listOf(
                TeamPlayerRegistrationApiDto(
                    id = "registration-1",
                    teamId = "team-1",
                    userId = "child-1",
                    registrantId = "child-1",
                    parentId = "parent-1",
                    registrantType = "CHILD",
                    rosterRole = "PARTICIPANT",
                    status = "STARTED",
                    consentDocumentId = "doc-1",
                    consentStatus = "sent",
                    createdBy = "parent-1",
                ),
            ),
        )

        val team = dto.toTeamOrNull()

        assertEquals(listOf("template-a", "template-b"), team?.requiredTemplateIds)
        val registration = team?.playerRegistrations?.firstOrNull { it.userId == "child-1" }
        assertEquals("child-1", registration?.registrantId)
        assertEquals("parent-1", registration?.parentId)
        assertEquals("CHILD", registration?.registrantType)
        assertEquals("PARTICIPANT", registration?.rosterRole)
        assertEquals("doc-1", registration?.consentDocumentId)
        assertEquals("sent", registration?.consentStatus)
        assertEquals("parent-1", registration?.createdBy)
    }

    @Test
    fun update_team_request_serialization_includes_required_templates_and_registration_metadata() {
        val team = Team(
            division = "OPEN",
            name = "Aces",
            captainId = "user-1",
            playerIds = listOf("user-1"),
            pending = emptyList(),
            teamSize = 6,
            requiredTemplateIds = listOf(" template-a ", "", "template-a", "template-b "),
            playerRegistrations = listOf(
                TeamPlayerRegistration(
                    id = "registration-1",
                    teamId = "team-1",
                    userId = "child-1",
                    registrantId = "child-1",
                    parentId = "parent-1",
                    registrantType = "CHILD",
                    rosterRole = "PARTICIPANT",
                    status = "STARTED",
                    consentDocumentId = "doc-1",
                    consentStatus = "sent",
                    createdBy = "parent-1",
                ),
            ),
            id = "team-1",
        )

        val serialized = jsonMVP.encodeToString(
            UpdateTeamRequestDto(team = team.toUpdateDto()),
        )

        assertTrue(serialized.contains("\"requiredTemplateIds\":[\"template-a\",\"template-b\"]"))
        assertTrue(serialized.contains("\"registrantId\":\"child-1\""))
        assertTrue(serialized.contains("\"parentId\":\"parent-1\""))
        assertTrue(serialized.contains("\"registrantType\":\"CHILD\""))
        assertTrue(serialized.contains("\"rosterRole\":\"PARTICIPANT\""))
        assertTrue(serialized.contains("\"consentDocumentId\":\"doc-1\""))
        assertTrue(serialized.contains("\"consentStatus\":\"sent\""))
        assertTrue(serialized.contains("\"createdBy\":\"parent-1\""))
    }
}
