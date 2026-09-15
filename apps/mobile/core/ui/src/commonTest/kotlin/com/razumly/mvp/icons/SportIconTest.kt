package com.razumly.mvp.icons

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame

class SportIconTest {
    @Test
    fun given_seeded_sport_names_when_resolving_then_returns_each_canonical_vector() {
        val catalog = listOf(
            Triple("Indoor Volleyball", "indoor-volleyball", SportIcons.IndoorVolleyball),
            Triple("Beach Volleyball", "beach-volleyball", SportIcons.BeachVolleyball),
            Triple("Grass Volleyball", "grass-volleyball", SportIcons.GrassVolleyball),
            Triple("Basketball", "basketball", SportIcons.Basketball),
            Triple("Indoor Soccer", "indoor-soccer", SportIcons.IndoorSoccer),
            Triple("Grass Soccer", "grass-soccer", SportIcons.GrassSoccer),
            Triple("Beach Soccer", "beach-soccer", SportIcons.BeachSoccer),
            Triple("Tennis", "tennis", SportIcons.Tennis),
            Triple("Pickleball", "pickleball", SportIcons.Pickleball),
            Triple("Badminton", "badminton", SportIcons.Badminton),
            Triple("Racquetball", "racquetball", SportIcons.Racquetball),
            Triple("Football", "football", SportIcons.Football),
            Triple("Flag Football", "flag-football", SportIcons.FlagFootball),
            Triple("Hockey", "hockey", SportIcons.Hockey),
            Triple("Field Hockey", "field-hockey", SportIcons.FieldHockey),
            Triple("Lacrosse", "lacrosse", SportIcons.Lacrosse),
            Triple("Australian Football", "australian-football", SportIcons.AustralianFootball),
            Triple("Ball Hockey", "ball-hockey", SportIcons.BallHockey),
            Triple("Futsal", "futsal", SportIcons.Futsal),
            Triple("Baseball", "baseball", SportIcons.Baseball),
            Triple("Softball", "softball", SportIcons.Softball),
            Triple("Table Tennis", "table-tennis", SportIcons.TableTennis),
            Triple("Ultimate Frisbee", "ultimate-frisbee", SportIcons.UltimateFrisbee),
            Triple("Other", "other", SportIcons.Other),
        )

        catalog.forEach { (name, key, vector) ->
            assertEquals(key, getSportIconKey(name), name)
            assertSame(vector, getSportIcon(name), name)
        }
    }

    @Test
    fun given_legacy_labels_when_resolving_then_matches_site_alias_precedence() {
        val aliases = mapOf(
            " \tBeAcH \n VOLLEYBALL " to "beach-volleyball",
            "  soccer  " to "indoor-soccer",
            "Volleyball" to "indoor-volleyball",
            "Beach Volleyball League" to "indoor-volleyball",
            "Grass Soccer League" to "indoor-soccer",
            "American Football" to "football",
            "Ice Hockey" to "hockey",
            "Indoor Field Hockey" to "field-hockey",
            "Youth Ball Hockey" to "ball-hockey",
            "Women's Australian Football" to "australian-football",
            "Coed Flag Football" to "flag-football",
            "Table Tennis Doubles" to "table-tennis",
            "Baseball and Softball" to "softball",
            "Basketball and Volleyball" to "indoor-volleyball",
        )

        aliases.forEach { (name, key) ->
            assertEquals(key, getSportIconKey(name), name)
        }
    }

    @Test
    fun given_missing_or_unknown_sport_when_resolving_then_uses_other() {
        listOf(null, "", " \t\n ", "Unlisted Sport").forEach { name ->
            assertEquals("other", getSportIconKey(name), name)
            assertSame(SportIcons.Other, getSportIcon(name), name)
        }
        assertSame(SportIcons.Other, SportIcons["unlisted-sport"])
    }
}
