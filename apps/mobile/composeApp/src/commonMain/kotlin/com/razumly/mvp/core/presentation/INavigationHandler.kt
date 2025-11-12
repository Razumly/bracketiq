package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.UserData

interface INavigationHandler {
    fun navigateToMatch(match: MatchWithRelations, event: Event)
    fun navigateToTeams(freeAgents: List<String> = listOf(), event: EventAbs? = null)
    fun navigateToChat(user: UserData? = null, chat: ChatGroupWithRelations? = null)
    fun navigateToSearch()
    fun navigateToEvent(event: EventAbs)
    fun navigateToEvents()
    fun navigateToRefunds()
    fun navigateToLogin()
    fun navigateBack()
}
