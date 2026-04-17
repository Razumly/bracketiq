package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.SportDTO
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventDetailsMatchRulesTest {
    @Test
    fun given_baseball_selected_without_server_template_when_resolving_rules_then_baseball_defaults_replace_stale_rules() {
        val event = Event(
            sportId = "Baseball",
            eventType = EventType.LEAGUE,
            resolvedMatchRules = stalePointRules(),
        )
        val sport = sport(id = "Baseball")

        val rules = resolveEventMatchRules(event = event, sport = sport)

        assertEquals("INNINGS", rules.scoringModel)
        assertEquals(9, rules.segmentCount)
        assertEquals("Inning", rules.segmentLabel)
        assertEquals("RUN", rules.autoCreatePointIncidentType)
        assertFalse(rules.canUseOvertime)
        assertFalse(rules.canUseShootout)
        assertTrue("RUN" in rules.supportedIncidentTypes)
    }

    @Test
    fun given_partial_sport_template_when_resolving_rules_then_sport_defaults_fill_missing_fields() {
        val event = Event(
            sportId = "Baseball",
            eventType = EventType.LEAGUE,
            resolvedMatchRules = stalePointRules(),
        )
        val sport = sport(
            id = "Baseball",
            template = MatchRulesConfigMVP(scoringModel = "INNINGS"),
        )

        val rules = resolveEventMatchRules(event = event, sport = sport)

        assertEquals("INNINGS", rules.scoringModel)
        assertEquals(9, rules.segmentCount)
        assertEquals("Inning", rules.segmentLabel)
        assertEquals("RUN", rules.autoCreatePointIncidentType)
        assertFalse(rules.canUseOvertime)
        assertFalse(rules.canUseShootout)
    }

    @Test
    fun given_volleyball_selected_when_event_has_stale_overtime_and_tiebreak_overrides_then_options_are_clamped_off() {
        val event = Event(
            sportId = "Indoor Volleyball",
            eventType = EventType.LEAGUE,
            matchRulesOverride = MatchRulesConfigMVP(
                supportsOvertime = true,
                supportsShootout = true,
            ),
        )
        val sport = sport(id = "Indoor Volleyball")

        val rules = resolveEventMatchRules(event = event, sport = sport)

        assertFalse(rules.canUseOvertime)
        assertFalse(rules.supportsOvertime)
        assertFalse(rules.canUseShootout)
        assertFalse(rules.supportsShootout)
    }

    @Test
    fun given_soccer_selected_when_tiebreak_is_enabled_then_draws_are_not_a_separate_result_path() {
        val event = Event(
            sportId = "Indoor Soccer",
            eventType = EventType.LEAGUE,
            matchRulesOverride = MatchRulesConfigMVP(supportsShootout = true),
        )
        val sport = sport(id = "Indoor Soccer")

        val rules = resolveEventMatchRules(event = event, sport = sport)

        assertTrue(rules.canUseOvertime)
        assertTrue(rules.canUseShootout)
        assertTrue(rules.supportsShootout)
        assertFalse(rules.supportsDraw)
    }

    @Test
    fun given_custom_sport_without_template_when_resolving_rules_then_persisted_rules_are_preserved() {
        val event = Event(
            sportId = "custom-sport",
            eventType = EventType.LEAGUE,
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "PERIODS",
                segmentCount = 3,
                segmentLabel = "Round",
                supportsDraw = true,
                supportedIncidentTypes = listOf("SCORE", "NOTE"),
                autoCreatePointIncidentType = "SCORE",
            ),
        )
        val sport = sport(id = "custom-sport", name = "Custom Sport")

        val rules = resolveEventMatchRules(event = event, sport = sport)

        assertEquals("PERIODS", rules.scoringModel)
        assertEquals(3, rules.segmentCount)
        assertEquals("Round", rules.segmentLabel)
        assertEquals(true, rules.supportsDraw)
        assertEquals(listOf("SCORE", "NOTE"), rules.supportedIncidentTypes)
        assertEquals("SCORE", rules.autoCreatePointIncidentType)
    }

    private fun sport(
        id: String,
        name: String = id,
        template: MatchRulesConfigMVP? = null,
    ): Sport = SportDTO(
        name = name,
        matchRulesTemplate = template,
        usePointsForWin = true,
        usePointsForLoss = true,
    ).toSport(id)

    private fun stalePointRules(): ResolvedMatchRulesMVP =
        ResolvedMatchRulesMVP(
            scoringModel = "POINTS_ONLY",
            segmentCount = 1,
            segmentLabel = "Total",
            supportedIncidentTypes = listOf("POINT", "DISCIPLINE", "NOTE", "ADMIN"),
            autoCreatePointIncidentType = "POINT",
        )
}
