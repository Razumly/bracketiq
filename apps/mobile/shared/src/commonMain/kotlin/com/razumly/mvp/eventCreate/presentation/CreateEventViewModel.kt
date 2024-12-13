package com.razumly.mvp.eventCreate.presentation

import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.rickclephas.kmp.observableviewmodel.MutableStateFlow
import com.rickclephas.kmp.observableviewmodel.ViewModel
import com.rickclephas.kmp.observableviewmodel.launch
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.PermissionsController
import kotlinx.coroutines.flow.update
import kotlinx.datetime.Instant

class CreateEventViewModel(
    private val appwriteRepository: IMVPRepository,
    val permissionsController: PermissionsController,
    val locationTracker: LocationTracker
) : ViewModel() {
    val newTournament = MutableStateFlow(
        viewModelScope,
        Tournament()
    )

    fun updateTournamentField(update: Tournament.() -> Tournament) {
        newTournament.update { it.update() }
    }

    fun createTournament() {
        viewModelScope.launch {
            appwriteRepository.createTournament(
                newTournament.value
            )
        }
    }

    fun updateTournamentTextFields(name: String, description: String, type: String) {
        updateTournamentField { copy(name = name, description = description, type = type) }
    }

    fun updateTournamentParameters(
        doubleElimination: Boolean,
        winnerSetCount: Int,
        loserSetCount: Int,
        winnerBracketPointsToVictory: List<Int>,
        loserBracketPointsToVictory: List<Int>,
        winnerScoreLimitsPerSet: List<Int>,
        loserScoreLimitsPerSet: List<Int>,
    ) {
        updateTournamentField {
            copy(
                doubleElimination = doubleElimination,
                winnerSetCount = winnerSetCount,
                loserSetCount = loserSetCount,
                winnerBracketPointsToVictory = winnerBracketPointsToVictory,
                loserBracketPointsToVictory = loserBracketPointsToVictory,
                winnerScoreLimitsPerSet = winnerScoreLimitsPerSet,
                loserScoreLimitsPerSet = loserScoreLimitsPerSet,
            )
        }
    }

    fun updateTournamentDates(start: Instant, end: Instant) {
        updateTournamentField {
            copy(start = start, end = end)
        }
    }

    fun updateTournamentLocation(location: String, lat: Double, long: Double) {
        updateTournamentField {
            copy(location = location, lat = lat, long = long)
        }
    }

    fun updateTournamentPrice(price: Double) {
        updateTournamentField { copy(price = price) }
    }
}