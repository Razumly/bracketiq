package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class DivisionPhaseSettingsSerializationTest {
    @Test
    fun given_all_competition_phases_when_serialized_then_they_round_trip() {
        val detail = DivisionDetail(
            id = "division-1",
            phaseSettings = DivisionCompetitionPhase.entries.associate { phase ->
                phase.name to DivisionPhaseSettingsMVP(
                    matchRulesOverride = MatchRulesConfigMVP(segmentCount = phase.ordinal + 1),
                    autoCreatePointMatchIncidents = phase == DivisionCompetitionPhase.LEAGUE,
                    segmentLengthMinutes = 10 + phase.ordinal,
                    segmentBreakMinutes = phase.ordinal,
                )
            },
        )

        val encoded = Json.encodeToString(detail)
        val decoded = Json.decodeFromString<DivisionDetail>(encoded)

        assertEquals(detail.phaseSettings, decoded.phaseSettings)
        assertEquals(
            setOf("LEAGUE", "POOL", "BRACKET", "PLAYOFF"),
            decoded.phaseSettings.keys,
        )
    }
}
