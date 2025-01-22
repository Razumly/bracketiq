package com.razumly.mvp.eventCreate

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.Tournament
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.PermissionsController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Instant

interface CreateEventComponent {
    val newTournament: StateFlow<Tournament>

    fun updateTournamentTextFields(name: String, description: String, type: String)
    fun updateTournamentParameters(
        doubleElimination: Boolean,
        winnerSetCount: Int,
        loserSetCount: Int,
        winnerBracketPointsToVictory: List<Int>,
        loserBracketPointsToVictory: List<Int>,
        winnerScoreLimitsPerSet: List<Int>,
        loserScoreLimitsPerSet: List<Int>
    )
    fun updateTournamentDates(start: Instant, end: Instant)
    fun updateTournamentLocation(location: String, lat: Double, long: Double)
    fun updateTournamentPrice(price: Double)
    fun createTournament()
}

class DefaultCreateEventComponent(
    componentContext: ComponentContext,
    private val appwriteRepository: IMVPRepository,
    val permissionsController: PermissionsController,
    val locationTracker: LocationTracker
) : CreateEventComponent, ComponentContext by componentContext {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _newTournament = MutableStateFlow(Tournament())
    override val newTournament: StateFlow<Tournament> = _newTournament.asStateFlow()

    private fun updateTournamentField(update: Tournament.() -> Tournament) {
        _newTournament.update { it.update() }
    }

    override fun createTournament() {
        scope.launch {
            appwriteRepository.createTournament(_newTournament.value)
        }
    }

    override fun updateTournamentTextFields(name: String, description: String, type: String) {
        updateTournamentField { copy(name = name, description = description, type = type) }
    }

    override fun updateTournamentParameters(
        doubleElimination: Boolean,
        winnerSetCount: Int,
        loserSetCount: Int,
        winnerBracketPointsToVictory: List<Int>,
        loserBracketPointsToVictory: List<Int>,
        winnerScoreLimitsPerSet: List<Int>,
        loserScoreLimitsPerSet: List<Int>
    ) {
        updateTournamentField {
            copy(
                doubleElimination = doubleElimination,
                winnerSetCount = winnerSetCount,
                loserSetCount = loserSetCount,
                winnerBracketPointsToVictory = winnerBracketPointsToVictory,
                loserBracketPointsToVictory = loserBracketPointsToVictory,
                winnerScoreLimitsPerSet = winnerScoreLimitsPerSet,
                loserScoreLimitsPerSet = loserScoreLimitsPerSet
            )
        }
    }

    override fun updateTournamentDates(start: Instant, end: Instant) {
        updateTournamentField {
            copy(start = start, end = end)
        }
    }

    override fun updateTournamentLocation(location: String, lat: Double, long: Double) {
        updateTournamentField {
            copy(location = location, lat = lat, long = long)
        }
    }

    override fun updateTournamentPrice(price: Double) {
        updateTournamentField { copy(price = price) }
    }
}
