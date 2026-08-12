package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.network.dto.EventEditorBootstrapQueryDto
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations

interface INavigationHandler {
    fun navigateToMatch(matchId: String, eventId: String)
    fun navigateToMatch(match: MatchWithRelations, eventId: String = match.match.eventId) {
        navigateToMatch(match.match.id, eventId)
    }

    fun navigateToMatchFromSchedule(matchId: String, eventId: String) {
        navigateToMatch(matchId, eventId)
    }
    fun navigateToMatchFromSchedule(match: MatchWithRelations, eventId: String = match.match.eventId) {
        navigateToMatchFromSchedule(match.match.id, eventId)
    }

    fun navigateToTeams(
        freeAgents: List<String> = listOf(),
        eventId: String? = null,
        selectedFreeAgentId: String? = null,
    )
    fun navigateToChat(messageUserId: String? = null, chatId: String? = null)
    fun navigateToCreate()
    fun navigateToCreate(bootstrap: EventEditorBootstrapQueryDto)
    fun navigateToCreateFromRental(rentalBookingId: String) {
        navigateToCreate(
            EventEditorBootstrapQueryDto(rentalBookingId = rentalBookingId),
        )
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
