package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.canManageEventsForViewer
import com.razumly.mvp.core.data.dataTypes.isDraftLikeState
import com.razumly.mvp.core.data.dataTypes.isPrivateState
import com.razumly.mvp.core.data.dataTypes.enums.EventType

internal data class EventDetailAccessPresentation(
    val isTemplateEvent: Boolean,
    val canShowQrCode: Boolean,
    val eventType: EventType,
    val tournamentPoolPlayEnabled: Boolean,
    val hasBracketView: Boolean,
    val hasScheduleView: Boolean,
    val hasStandingsView: Boolean,
    val isAssistantHost: Boolean,
    val isEventOfficial: Boolean,
    val canManageTemplate: Boolean,
    val canEditEventDetails: Boolean,
    val canDeleteEvent: Boolean,
    val canCreateTemplateFromCurrentEvent: Boolean,
    val canManageLeagueStandings: Boolean,
    val showOfficialsPanel: Boolean,
    val selectedSport: Sport?,
    val showStandingsDrawColumn: Boolean,
    val canConfirmLeagueResultsFromDock: Boolean,
    val canManageMatchEditingFromDock: Boolean,
    val canEditMatches: Boolean,
    val showScheduleMatchManagement: Boolean,
    val canManageParticipantsFromDock: Boolean,
    val showEventCheckInBadges: Boolean,
    val currentUserManagedEventTeam: TeamWithPlayers?,
)

internal fun buildEventDetailAccessPresentation(
    selectedEvent: EventWithFullRelations,
    editedEvent: Event,
    sports: List<Sport>,
    currentUser: UserData,
    currentUserManagedEventTeamId: String?,
    isHost: Boolean,
    isEditingMatches: Boolean,
): EventDetailAccessPresentation {
    val event = selectedEvent.event
    val isTemplateEvent = event.state.equals("TEMPLATE", ignoreCase = true)
    val canShowQrCode = !isTemplateEvent &&
        !event.isDraftLikeState() &&
        !event.isPrivateState()
    val eventType = event.eventType
    val isTournamentEvent = eventType == EventType.TOURNAMENT
    val tournamentPoolPlayEnabled = event.isTournamentPoolPlayEnabled()
    val hasBracketView = isTournamentEvent ||
        (eventType == EventType.LEAGUE && event.includePlayoffs)
    val hasScheduleView = eventType == EventType.LEAGUE ||
        eventType == EventType.TOURNAMENT ||
        eventType == EventType.WEEKLY_EVENT ||
        selectedEvent.matches.isNotEmpty()
    val hasStandingsView = eventType == EventType.LEAGUE || tournamentPoolPlayEnabled
    val currentUserId = currentUser.id.trim()
    val isAssistantHost = currentUserId.isNotBlank() && event.assistantHostIds.any { assistantHostId ->
        assistantHostId.trim() == currentUserId
    }
    val isEventOfficial = isCurrentUserEventOfficial(
        currentUserId = currentUser.id,
        event = event,
    )
    val isOrganizationManager = selectedEvent.organization?.canManageEventsForViewer(currentUserId) == true
    val canManageTemplate = isHost || isAssistantHost || isOrganizationManager
    val canEditEventDetails = canEditEventDetailsOnMobile(
        event = event,
        isHost = isHost,
        canManageTemplate = canManageTemplate,
    )
    val canDeleteEvent = if (isTemplateEvent) canManageTemplate else isHost
    val canCreateTemplateFromCurrentEvent = isHost &&
        !isTemplateEvent &&
        event.organizationId.isNullOrBlank()
    val canManageLeagueStandings = currentUserId.isNotBlank() && (
        event.hostId.trim() == currentUserId ||
            event.assistantHostIds.any { assistantHostId -> assistantHostId.trim() == currentUserId }
        )
    val showOfficialsPanel = canViewOfficialsPanel(
        currentUserId = currentUser.id,
        event = event,
        organization = selectedEvent.organization,
    )
    val selectedSport = sports.firstOrNull { it.id == editedEvent.sportId }
    val standingsSport = sports.firstOrNull { it.id == event.sportId }
    val showStandingsDrawColumn = resolveLeagueStandingsSupportsDraw(
        event = event,
        sport = standingsSport,
    )
    val canConfirmLeagueResultsFromDock = hasStandingsView && canManageLeagueStandings
    val canManageMatchEditingFromDock = canManageTemplate
    val canEditMatches = canManageMatchEditingFromDock && isEditingMatches
    val showScheduleMatchManagement = canManageMatchEditingFromDock &&
        shouldShowScheduleMatchManagement(eventType)
    val canManageParticipantsFromDock = canManageTemplate
    val showEventCheckInBadges = event.teamSignup &&
        event.teamCheckInMode.name == "EVENT" &&
        (canManageParticipantsFromDock || isEventOfficial)
    val currentUserManagedEventTeam = selectedEvent.teams.firstOrNull { team ->
        team.team.id == currentUserManagedEventTeamId
    }

    return EventDetailAccessPresentation(
        isTemplateEvent = isTemplateEvent,
        canShowQrCode = canShowQrCode,
        eventType = eventType,
        tournamentPoolPlayEnabled = tournamentPoolPlayEnabled,
        hasBracketView = hasBracketView,
        hasScheduleView = hasScheduleView,
        hasStandingsView = hasStandingsView,
        isAssistantHost = isAssistantHost,
        isEventOfficial = isEventOfficial,
        canManageTemplate = canManageTemplate,
        canEditEventDetails = canEditEventDetails,
        canDeleteEvent = canDeleteEvent,
        canCreateTemplateFromCurrentEvent = canCreateTemplateFromCurrentEvent,
        canManageLeagueStandings = canManageLeagueStandings,
        showOfficialsPanel = showOfficialsPanel,
        selectedSport = selectedSport,
        showStandingsDrawColumn = showStandingsDrawColumn,
        canConfirmLeagueResultsFromDock = canConfirmLeagueResultsFromDock,
        canManageMatchEditingFromDock = canManageMatchEditingFromDock,
        canEditMatches = canEditMatches,
        showScheduleMatchManagement = showScheduleMatchManagement,
        canManageParticipantsFromDock = canManageParticipantsFromDock,
        showEventCheckInBadges = showEventCheckInBadges,
        currentUserManagedEventTeam = currentUserManagedEventTeam,
    )
}
