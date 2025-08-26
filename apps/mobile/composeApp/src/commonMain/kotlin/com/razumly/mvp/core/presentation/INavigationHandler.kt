package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament

interface INavigationHandler {
    fun navigateToMatch(match: MatchWithRelations, tournament: Tournament)
    fun navigateToTeams(freeAgents: List<String>, event: EventAbs?)
    fun navigateToChat(chatGroup: ChatGroupWithRelations)
    fun navigateToSearch()
    fun navigateToEvent(event: EventAbs)
    fun navigateToEvents()
    fun navigateToRefunds()
    fun navigateToLogin()
    fun navigateBack()
}
