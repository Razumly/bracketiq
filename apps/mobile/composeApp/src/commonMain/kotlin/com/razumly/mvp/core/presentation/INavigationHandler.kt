package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.repositories.SeededEventTemplateDraft

interface INavigationHandler {
    fun navigateToMatch(matchId: String, eventId: String)
    fun navigateToMatchFromSchedule(matchId: String, eventId: String) {
        navigateToMatch(matchId, eventId)
    }

    fun navigateToTeams(
        freeAgents: List<String> = listOf(),
        eventId: String? = null,
        selectedFreeAgentId: String? = null,
    )
    fun navigateToChat(messageUserId: String? = null, chatId: String? = null)
    fun navigateToCreate()
    fun navigateToCreate(seed: SeededEventTemplateDraft) {
        navigateToCreate()
    }
    fun navigateToSearch()
    fun navigateToEvent(eventId: String)
    fun navigateToOrganization(organizationId: String, initialTab: OrganizationDetailTab = OrganizationDetailTab.OVERVIEW)
    fun navigateToEvents()
    fun navigateToRefunds()
    fun navigateToLogin()
    fun navigateBack()
    fun onPendingInviteCountUpdated(count: Int) {}
}
