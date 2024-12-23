package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Tournament
import kotlinx.serialization.Serializable

@Serializable
sealed class ConfigRoot{
    @Serializable
    data object Login : ConfigRoot()

    @Serializable
    data class Home(val selectedTab: Tab = Tab.EventList) : ConfigRoot()
}
