package com.razumly.mvp.eventDetail

import androidx.compose.runtime.Composable
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.layout.ColumnScope

internal fun LazyListScope.eventDetailsHeroSectionForMode(
    useSimpleSectionContent: Boolean,
    state: EventDetailsHeroState,
    actions: EventDetailsHeroActions,
) {
    if (useSimpleSectionContent) {
        simpleEventDetailsHeroSection(state, actions)
    } else {
        eventDetailsHeroSection(state, actions)
    }
}

internal fun LazyListScope.eventDetailsBasicInfoSectionForMode(
    useSimpleSectionContent: Boolean,
    state: EventDetailsBasicInfoState,
    actions: EventDetailsBasicInfoActions,
    showContainer: Boolean,
) {
    if (useSimpleSectionContent) {
        simpleEventDetailsBasicInfoSection(state, actions, showContainer = false)
    } else {
        eventDetailsBasicInfoSection(state, actions, showContainer)
    }
}

internal fun LazyListScope.eventDetailsRegistrationSectionForMode(
    useSimpleSectionContent: Boolean,
    state: EventDetailsRegistrationState,
    actions: EventDetailsRegistrationActions,
    showContainer: Boolean,
) {
    if (useSimpleSectionContent) {
        simpleEventDetailsRegistrationSection(state, actions, showContainer = false)
    } else {
        eventDetailsRegistrationSection(state, actions, showContainer)
    }
}

internal fun LazyListScope.eventDetailsMatchRulesSectionForMode(
    useSimpleSectionContent: Boolean,
    state: EventDetailsMatchRulesState,
    actions: EventDetailsMatchRulesActions,
    showContainer: Boolean,
) {
    if (useSimpleSectionContent) {
        simpleEventDetailsMatchRulesSection(state, actions, showContainer = false)
    } else {
        eventDetailsMatchRulesSection(state, actions, showContainer)
    }
}

internal fun LazyListScope.eventDetailsStaffSectionForMode(
    useSimpleSectionContent: Boolean,
    state: EventDetailsStaffState,
    actions: EventDetailsStaffActions,
    showContainer: Boolean,
) {
    if (useSimpleSectionContent) {
        simpleEventDetailsStaffSection(state, actions, showContainer = false)
    } else {
        eventDetailsStaffSection(state, actions, showContainer)
    }
}

internal fun LazyListScope.eventDetailsDivisionsSectionForMode(
    useSimpleSectionContent: Boolean,
    state: EventDetailsDivisionsSectionState,
    actions: EventDetailsDivisionsSectionActions,
    showContainer: Boolean,
    editContent: @Composable ColumnScope.() -> Unit,
) {
    if (useSimpleSectionContent) {
        simpleEventDetailsDivisionsSection(
            state = state,
            actions = actions,
            showContainer = false,
            editContent = editContent,
        )
    } else {
        eventDetailsDivisionsSection(
            state = state,
            actions = actions,
            showContainer = showContainer,
            editContent = editContent,
        )
    }
}

internal fun LazyListScope.eventDetailsLeagueScoringSectionForMode(
    useSimpleSectionContent: Boolean,
    state: EventDetailsLeagueScoringState,
    actions: EventDetailsLeagueScoringActions,
    showContainer: Boolean,
) {
    if (useSimpleSectionContent) {
        simpleEventDetailsLeagueScoringSection(state, actions, showContainer = false)
    } else {
        eventDetailsLeagueScoringSection(state, actions, showContainer)
    }
}

internal fun LazyListScope.eventDetailsScheduleSectionForMode(
    useSimpleSectionContent: Boolean,
    state: EventDetailsScheduleState,
    actions: EventDetailsScheduleActions,
    showContainer: Boolean,
) {
    if (useSimpleSectionContent) {
        simpleEventDetailsScheduleSection(state, actions, showContainer = false)
    } else {
        eventDetailsScheduleSection(state, actions, showContainer)
    }
}
