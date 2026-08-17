package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.SportOfficialPositionTemplate
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SportDtosTest {
    @Test
    fun to_sport_or_null_infers_draw_support_for_timed_win_loss_sports_when_flag_is_missing() {
        val dto = SportApiDto(
            id = "Basketball",
            name = "Basketball",
            resourceLabelSingular = "Court",
            resourceLabelPlural = "Courts",
            usePointsForWin = true,
            usePointsForLoss = true,
            usePointsForDraw = null,
            usePointsPerSetWin = null,
            usePointsPerSetLoss = null,
        )

        val sport = dto.toSportOrNull()

        assertNotNull(sport)
        assertTrue(sport.usePointsForDraw)
    }

    @Test
    fun to_sport_or_null_keeps_draw_disabled_for_set_based_sports_when_flag_is_missing() {
        val dto = SportApiDto(
            id = "Indoor Volleyball",
            name = "Indoor Volleyball",
            resourceLabelSingular = "Court",
            resourceLabelPlural = "Courts",
            usePointsForWin = true,
            usePointsForLoss = true,
            usePointsForDraw = null,
            usePointsPerSetWin = true,
            usePointsPerSetLoss = true,
        )

        val sport = dto.toSportOrNull()

        assertNotNull(sport)
        assertFalse(sport.usePointsForDraw)
    }

    @Test
    fun to_sport_or_null_respects_explicit_draw_flag_from_backend() {
        val dto = SportApiDto(
            id = "Custom Sport",
            name = "Custom Sport",
            resourceLabelSingular = "Resource",
            resourceLabelPlural = "Resources",
            usePointsForWin = true,
            usePointsForLoss = true,
            usePointsForDraw = false,
            usePointsPerSetWin = null,
            usePointsPerSetLoss = null,
        )

        val sport = dto.toSportOrNull()

        assertNotNull(sport)
        assertFalse(sport.usePointsForDraw)
    }

    @Test
    fun to_sport_or_null_maps_official_position_templates() {
        val dto = SportApiDto(
            id = "Volleyball",
            name = "Volleyball",
            resourceLabelSingular = "Court",
            resourceLabelPlural = "Courts",
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "R1", count = 1),
                SportOfficialPositionTemplate(name = "Line Judge", count = 2),
            ),
        )

        val sport = dto.toSportOrNull()

        assertNotNull(sport)
        assertEquals(
            listOf("R1", "Line Judge"),
            sport.officialPositionTemplates.map(SportOfficialPositionTemplate::name),
        )
        assertEquals(
            listOf(1, 2),
            sport.officialPositionTemplates.map(SportOfficialPositionTemplate::count),
        )
    }

    @Test
    fun to_sport_or_null_preserves_soccer_field_labels() {
        val sport = SportApiDto(
            id = "Indoor Soccer",
            name = "Indoor Soccer",
            resourceLabelSingular = "Field",
            resourceLabelPlural = "Fields",
        ).toSportOrNull()

        assertNotNull(sport)
        assertEquals("Field", sport.resourceLabelSingular)
        assertEquals("Fields", sport.resourceLabelPlural)
    }

    @Test
    fun to_sport_or_null_rejects_missing_or_invalid_resource_labels() {
        assertNull(SportApiDto(id = "Volleyball", name = "Volleyball").toSportOrNull())
        assertNull(
            SportApiDto(
                id = "Volleyball",
                name = "Volleyball",
                resourceLabelSingular = " Court ",
                resourceLabelPlural = "Courts",
            ).toSportOrNull(),
        )
    }
}
