package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class EventCardMetadataTest {
    @Test
    fun buildNativeEventCardMetadata_formatsOneCanonicalDivisionAndSkillLevel() {
        val metadata = buildNativeEventCardMetadata(
            Event(
                divisions = listOf("open"),
                divisionDetails = listOf(
                    DivisionDetail(
                        id = "open",
                        name = "Open",
                        skillDivisionTypeName = "Advanced",
                    ),
                ),
            ),
        )

        assertEquals("Division: Open", metadata.divisionLabel)
        assertEquals("Skill: Advanced", metadata.skillLevelLabel)
    }

    @Test
    fun buildNativeEventCardMetadata_compactsLongDistinctDivisionAndSkillLists() {
        val metadata = buildNativeEventCardMetadata(
            Event(
                divisions = listOf("14u", "16u", "18u"),
                divisionDetails = listOf(
                    DivisionDetail(id = "14u", name = "14U", skillDivisionTypeName = "Beginner"),
                    DivisionDetail(id = "16u", name = "16U", skillDivisionTypeName = "Intermediate"),
                    DivisionDetail(id = "18u", name = "18U", skillDivisionTypeName = "Advanced"),
                ),
            ),
        )

        assertEquals("U14–U18 · Beginner–Advanced · 3 divisions", metadata.divisionLabel)
        assertNull(metadata.skillLevelLabel)
    }

    @Test
    fun buildNativeEventCardMetadata_formatsGenderAgeSkillRangesAndCount() {
        val details = buildList {
            listOf("M", "F").forEach { gender ->
                listOf("u6", "u18").forEach { age ->
                    listOf("recreational", "premier").forEach { skill ->
                        val id = "${gender.lowercase()}_skill_${skill}_age_${age}"
                        add(
                            DivisionDetail(
                                id = id,
                                key = id,
                                gender = gender,
                                ageDivisionTypeId = age,
                                skillDivisionTypeId = skill,
                            ),
                        )
                    }
                }
            }
        }
        val metadata = buildNativeEventCardMetadata(
            Event(
                divisions = details.map(DivisionDetail::id),
                divisionDetails = details,
            ),
        )

        assertEquals("Men/Women · U6–U18 · Rec–Premier · 8 divisions", metadata.divisionLabel)
        assertNull(metadata.skillLevelLabel)
    }

    @Test
    fun buildNativeEventCardMetadata_prefersCompactCanonicalAgeTokens() {
        val details = listOf("u16", "u14", "u9").map { age ->
            DivisionDetail(
                id = "c_$age",
                key = "c_$age",
                name = age.removePrefix("u") + "U",
                gender = "C",
                skillDivisionTypeId = "c_$age",
                ageDivisionTypeId = "18plus",
            )
        }
        val metadata = buildNativeEventCardMetadata(
            Event(
                divisions = details.map(DivisionDetail::id),
                divisionDetails = details,
            ),
        )

        assertEquals("Coed · U9–U16 · 3 divisions", metadata.divisionLabel)
        assertNull(metadata.skillLevelLabel)
    }

    @Test
    fun buildNativeEventCardMetadata_omitsSkillWhenCanonicalDivisionHasNoSkillMetadata() {
        val metadata = buildNativeEventCardMetadata(Event())

        assertEquals("Division: TBD", metadata.divisionLabel)
        assertNull(metadata.skillLevelLabel)
    }
}
