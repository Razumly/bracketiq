package com.razumly.mvp.wear.data

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class WearDtosTest {
    @Test
    fun givenPaginatedSchedule_whenDecoded_thenRetainsCompletenessMetadata() {
        val schedule = createWearJson().decodeFromString<WearScheduleResponseDto>(
            """
            {
              "events": [],
              "matches": [],
              "teams": [],
              "fields": [],
              "pagination": {
                "limit": 200,
                "hasMore": true,
                "nextCursor": "cursor_2",
                "isComplete": false,
                "windowFrom": "2026-07-01T00:00:00Z",
                "windowTo": "2026-07-31T00:00:00Z"
              }
            }
            """.trimIndent(),
        )

        val pagination = assertNotNull(schedule.pagination)
        assertEquals(200, pagination.limit)
        assertTrue(pagination.hasMore)
        assertEquals("cursor_2", pagination.nextCursor)
        assertFalse(pagination.isComplete ?: true)
    }

    @Test
    fun givenScheduleMatchWithNullOfficialIds_whenDecoded_thenUsesEmptyAssignments() {
        val schedule = createWearJson().decodeFromString<WearScheduleResponseDto>(
            """
            {
              "events": [],
              "matches": [
                {
                  "id": "match_1",
                  "eventId": "event_1",
                  "matchId": 1,
                  "officialIds": null
                }
              ],
              "teams": [],
              "fields": []
            }
            """.trimIndent(),
        )

        assertEquals(emptyList(), schedule.matches.single().officialIds)
    }

    @Test
    fun givenWatchSetupMessage_whenDecoded_thenReadsSetupToken() {
        val message = createWearJson().decodeFromString<WearWatchSetupMessageDto>(
            """
            {
              "setupToken": "setup.jwt",
              "issuedAt": "2026-06-08T18:00:00Z"
            }
            """.trimIndent(),
        )

        assertEquals("setup.jwt", message.setupToken)
        assertEquals("2026-06-08T18:00:00Z", message.issuedAt)
    }

    @Test
    fun givenWatchExchangeRequest_whenEncoded_thenUsesSetupTokenField() {
        val encoded = createWearJson().encodeToString(
            WearWatchExchangeRequestDto(setupToken = "setup.jwt"),
        )

        assertEquals("""{"setupToken":"setup.jwt"}""", encoded)
    }

    @Test
    fun givenFirstHalfCompleteAndSecondHalfNotCreated_whenChecked_thenCanStartNextHalf() {
        val match = WearMatch(
            id = "match_1",
            number = 1,
            eventId = "event_1",
            eventName = "Event",
            startIso = null,
            endIso = null,
            fieldLabel = null,
            division = null,
            status = "IN_PROGRESS",
            team1 = WearTeam(id = "team_1", label = "Home", players = emptyList()),
            team2 = WearTeam(id = "team_2", label = "Away", players = emptyList()),
            officialCheckedIn = true,
            rules = WearResolvedMatchRulesDto(segmentCount = 2, segmentLabel = "Half"),
            raw = WearMatchDto(
                id = "match_1",
                eventId = "event_1",
                status = "IN_PROGRESS",
                segments = listOf(
                    WearMatchSegmentDto(
                        id = "segment_1",
                        matchId = "match_1",
                        sequence = 1,
                        status = "COMPLETE",
                    ),
                ),
            ),
        )

        assertEquals(2, match.raw.nextPlayableSequence(match.rules))
        assertTrue(match.canStartSegmentFromDetail())
        assertEquals("Start Second Half", match.startSegmentActionLabel())
    }

    @Test
    fun givenTwoHalvesCompleteWithoutTieBreaker_whenChecked_thenCannotStartAnotherHalf() {
        val match = WearMatch(
            id = "match_1",
            number = 1,
            eventId = "event_1",
            eventName = "Event",
            startIso = null,
            endIso = null,
            fieldLabel = null,
            division = null,
            status = "IN_PROGRESS",
            team1 = WearTeam(id = "team_1", label = "Home", players = emptyList()),
            team2 = WearTeam(id = "team_2", label = "Away", players = emptyList()),
            officialCheckedIn = true,
            rules = WearResolvedMatchRulesDto(segmentCount = 2, segmentLabel = "Half"),
            raw = WearMatchDto(
                id = "match_1",
                eventId = "event_1",
                status = "IN_PROGRESS",
                segments = listOf(
                    WearMatchSegmentDto(
                        id = "segment_1",
                        matchId = "match_1",
                        sequence = 1,
                        status = "COMPLETE",
                    ),
                    WearMatchSegmentDto(
                        id = "segment_2",
                        matchId = "match_1",
                        sequence = 2,
                        status = "COMPLETE",
                    ),
                ),
            ),
        )

        assertEquals(null, match.raw.nextPlayableSequence(match.rules))
        assertFalse(match.canStartSegmentFromDetail())
    }

    @Test
    fun givenTiedRegulationWithOvertime_whenChecked_thenLabelsStartOvertime() {
        val match = completedRegulationMatch(
            rules = WearResolvedMatchRulesDto(
                segmentCount = 2,
                segmentLabel = "Half",
                supportsOvertime = true,
            ),
        )

        assertTrue(match.shouldOfferFinishAndStart())
        assertEquals("Start Overtime", match.startSegmentActionLabel())
    }

    @Test
    fun givenTiedRegulationWithShootoutOnly_whenChecked_thenLabelsStartPenalties() {
        val match = completedRegulationMatch(
            rules = WearResolvedMatchRulesDto(
                segmentCount = 2,
                segmentLabel = "Half",
                supportsShootout = true,
            ),
        )

        assertTrue(match.shouldOfferFinishAndStart())
        assertEquals("Start Penalties", match.startSegmentActionLabel())
    }

    private fun completedRegulationMatch(rules: WearResolvedMatchRulesDto): WearMatch =
        WearMatch(
            id = "match_1",
            number = 1,
            eventId = "event_1",
            eventName = "Event",
            startIso = null,
            endIso = null,
            fieldLabel = null,
            division = null,
            status = "IN_PROGRESS",
            team1 = WearTeam(id = "team_1", label = "Home", players = emptyList()),
            team2 = WearTeam(id = "team_2", label = "Away", players = emptyList()),
            officialCheckedIn = true,
            rules = rules,
            raw = WearMatchDto(
                id = "match_1",
                eventId = "event_1",
                status = "IN_PROGRESS",
                segments = listOf(
                    WearMatchSegmentDto(
                        id = "segment_1",
                        matchId = "match_1",
                        sequence = 1,
                        status = "COMPLETE",
                    ),
                    WearMatchSegmentDto(
                        id = "segment_2",
                        matchId = "match_1",
                        sequence = 2,
                        status = "COMPLETE",
                    ),
                ),
            ),
        )
}
