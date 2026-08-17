package com.razumly.mvp.wear.data

import kotlin.test.Test
import kotlin.test.assertEquals

class WearScoreDisplayTest {
    @Test
    fun givenSetScoringWithAnActiveSecondSet_whenDisplayed_thenShowsOnlyTheActiveSetPoints() {
        val match = matchWith(
            scoringModel = "SETS",
            segments = listOf(
                segment(sequence = 1, status = "COMPLETE", home = 25, away = 20),
                segment(sequence = 2, status = "IN_PROGRESS", home = 1, away = 0),
            ),
        )

        assertEquals(1, match.displayScoreFor("home"))
        assertEquals(0, match.displayScoreFor("away"))
    }

    @Test
    fun givenPointScoringAcrossSegments_whenDisplayed_thenKeepsTheCumulativePoints() {
        val match = matchWith(
            scoringModel = "POINTS_ONLY",
            segments = listOf(
                segment(sequence = 1, status = "COMPLETE", home = 25, away = 20),
                segment(sequence = 2, status = "IN_PROGRESS", home = 1, away = 0),
            ),
        )

        assertEquals(26, match.displayScoreFor("home"))
        assertEquals(20, match.displayScoreFor("away"))
    }

    @Test
    fun givenSetScoringBeforeTheNextSetStarts_whenDisplayed_thenUsesTheNextSetZero() {
        val match = matchWith(
            scoringModel = "SETS",
            segments = listOf(
                segment(sequence = 1, status = "COMPLETE", home = 25, away = 20),
                segment(sequence = 2, status = "NOT_STARTED", home = 0, away = 0),
            ),
        )

        assertEquals(0, match.displayScoreFor("home"))
        assertEquals(0, match.displayScoreFor("away"))
    }

    private fun matchWith(
        scoringModel: String,
        segments: List<WearMatchSegmentDto>,
    ): WearMatch = WearMatch(
        id = "match_1",
        number = 1,
        eventId = "event_1",
        eventName = "Event",
        startIso = null,
        endIso = null,
        fieldLabel = null,
        division = null,
        status = "IN_PROGRESS",
        team1 = WearTeam(id = "home", label = "Home", players = emptyList()),
        team2 = WearTeam(id = "away", label = "Away", players = emptyList()),
        officialCheckedIn = true,
        rules = WearResolvedMatchRulesDto(scoringModel = scoringModel, segmentCount = 3),
        raw = WearMatchDto(
            id = "match_1",
            eventId = "event_1",
            team1Id = "home",
            team2Id = "away",
            segments = segments,
        ),
    )

    private fun segment(
        sequence: Int,
        status: String,
        home: Int,
        away: Int,
    ): WearMatchSegmentDto = WearMatchSegmentDto(
        id = "segment_$sequence",
        matchId = "match_1",
        sequence = sequence,
        status = status,
        scores = mapOf("home" to home, "away" to away),
    )
}
