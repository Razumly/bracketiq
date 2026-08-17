package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.presentation.guides.EventGuideTargets
import com.razumly.mvp.core.presentation.guides.eventBracketTabGuide
import com.razumly.mvp.core.presentation.guides.eventParticipantsTabGuide
import com.razumly.mvp.core.presentation.guides.eventScheduleTabGuide
import com.razumly.mvp.core.presentation.guides.eventStandingsTabGuide
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventDetailOnboardingGuideTest {
    @Test
    fun event_detail_tab_guide_required_targets_include_tabs_only_for_participants() {
        assertEquals(
            setOf(EventGuideTargets.DetailTabs, EventGuideTargets.ParticipantsContent),
            eventDetailTabGuideRequiredTargetIds(
                selectedTab = DetailTab.PARTICIPANTS,
                selectedTabContentTarget = EventGuideTargets.ParticipantsContent,
            ),
        )

        assertEquals(
            setOf(EventGuideTargets.ScheduleContent),
            eventDetailTabGuideRequiredTargetIds(
                selectedTab = DetailTab.SCHEDULE,
                selectedTabContentTarget = EventGuideTargets.ScheduleContent,
            ),
        )
    }

    @Test
    fun event_detail_tab_guides_highlight_tabs_only_for_participants() {
        assertTrue(eventParticipantsTabGuide("participants").targets(EventGuideTargets.DetailTabs))
        assertFalse(eventScheduleTabGuide("schedule").targets(EventGuideTargets.DetailTabs))
        assertFalse(eventBracketTabGuide("bracket").targets(EventGuideTargets.DetailTabs))
        assertFalse(eventStandingsTabGuide("standings").targets(EventGuideTargets.DetailTabs))
    }

    private fun com.razumly.mvp.core.presentation.guides.AppGuide.targets(targetId: String): Boolean =
        steps.any { step -> step.targetId == targetId }
}
