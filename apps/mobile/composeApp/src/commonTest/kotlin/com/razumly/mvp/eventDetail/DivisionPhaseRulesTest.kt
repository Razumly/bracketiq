package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionCompetitionPhase
import com.razumly.mvp.core.data.dataTypes.DivisionPhaseSettingsMVP
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.MatchTimekeepingConfigMVP
import com.razumly.mvp.core.data.dataTypes.SportDTO
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DivisionPhaseRulesTest {
    private val soccer = SportDTO(
        name = "Soccer",
        matchRulesTemplate = MatchRulesConfigMVP(
            scoringModel = "PERIODS",
            segmentCount = 2,
            segmentLabel = "Half",
            canUseOvertime = true,
            supportsOvertime = false,
            timekeeping = MatchTimekeepingConfigMVP(
                timerMode = "COUNT_DOWN",
                segmentDurationMinutes = 45,
            ),
        ),
    ).toSport("soccer")

    @Test
    fun given_phase_override_when_resolving_rules_then_it_wins_over_event_and_sport_defaults() {
        val event = Event(
            sportId = soccer.id,
            matchRulesOverride = MatchRulesConfigMVP(supportsOvertime = true),
        )
        val resolved = resolveDivisionPhaseMatchRules(
            event = event,
            sport = soccer,
            usesSets = false,
            settings = DivisionPhaseSettingsMVP(
                matchRulesOverride = MatchRulesConfigMVP(
                    segmentCount = 3,
                    supportsOvertime = false,
                ),
                segmentLengthMinutes = 20,
                segmentBreakMinutes = 5,
            ),
        )

        assertEquals(3, resolved.segmentCount)
        assertEquals(20, resolved.timekeeping.segmentDurationMinutes)
        assertEquals(5, resolved.timekeeping.segmentBreakDurationMinutes)
        assertFalse(resolved.supportsOvertime)
        assertEquals(70, calculateDivisionPhaseDurationMinutes(3, 20, 5))
    }

    @Test
    fun given_set_phase_when_resolving_rules_then_it_keeps_the_sport_segment_count() {
        val resolved = resolveDivisionPhaseMatchRules(
            event = Event(sportId = soccer.id),
            sport = soccer,
            usesSets = true,
            settings = DivisionPhaseSettingsMVP(
                matchRulesOverride = MatchRulesConfigMVP(segmentCount = 5),
            ),
        )

        assertEquals(2, resolved.segmentCount)
    }

    @Test
    fun given_phase_map_when_updating_one_phase_then_other_phases_stay_unchanged() {
        val league = DivisionPhaseSettingsMVP(segmentLengthMinutes = 30)
        val playoff = DivisionPhaseSettingsMVP(segmentLengthMinutes = 20)
        val settings = emptyMap<String, DivisionPhaseSettingsMVP>()
            .withPhase(DivisionCompetitionPhase.LEAGUE, league)
            .withPhase(DivisionCompetitionPhase.PLAYOFF, playoff)

        assertEquals(league, settings.forPhase(DivisionCompetitionPhase.LEAGUE))
        assertEquals(playoff, settings.forPhase(DivisionCompetitionPhase.PLAYOFF))
        assertNull(settings.forPhase(DivisionCompetitionPhase.POOL))
        assertTrue(settings.withPhase(DivisionCompetitionPhase.LEAGUE, null).containsKey("PLAYOFF"))
    }
}
