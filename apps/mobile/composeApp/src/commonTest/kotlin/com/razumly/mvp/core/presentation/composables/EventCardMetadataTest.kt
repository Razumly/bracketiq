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

        assertEquals("Divisions: 14U, 16U +1", metadata.divisionLabel)
        assertEquals("Skills: Beginner, Intermediate +1", metadata.skillLevelLabel)
    }

    @Test
    fun buildNativeEventCardMetadata_omitsSkillWhenCanonicalDivisionHasNoSkillMetadata() {
        val metadata = buildNativeEventCardMetadata(Event())

        assertEquals("Division: TBD", metadata.divisionLabel)
        assertNull(metadata.skillLevelLabel)
    }
}
