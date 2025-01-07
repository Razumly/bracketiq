package com.razumly.mvp

import com.razumly.mvp.core.data.MVPRepository
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import io.github.aakira.napier.Napier
import kotlinx.atomicfu.atomic
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.Instant
import kotlinx.datetime.plus
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import org.koin.mp.ThreadLocal
import kotlin.random.Random
import kotlin.test.Test
import kotlin.time.Duration.Companion.minutes



@OptIn(ExperimentalCoroutinesApi::class)
class TournamentSimulator : BaseTest(), KoinComponent {
    private val repository: MVPRepository by inject()
    private val testScope = CoroutineScope(testDispatcher)
    private val testTournamentId = "665fd4b40001fe3199da"
    private val currentTournament = repository.getTournamentFlow(testTournamentId)
        .stateIn(
            scope = testScope,
            started = SharingStarted.Eagerly,
            initialValue = null
        )
    private val matches = repository.getMatchesFlow(testTournamentId)
        .stateIn(
            scope = testScope,
            started = SharingStarted.Eagerly,
            initialValue = null
        )
    private lateinit var time: Instant
    private val matchCache = mutableMapOf<String, MatchWithRelations>()
    private val matchesLock = Mutex()
    private val timeLock = Mutex()
    // For each active match, we store a (Job, Channel<Unit>) pair
    data class MatchControl(val job: Job, val tickChannel: Channel<Unit>)
    private val activeMatchControls = mutableMapOf<String, MatchControl>()

    @Test
    fun start() = runBlocking {
        // 1) Optional: Log in / subscribe to your repository
        val user = repository.getCurrentUser()
        if (user == null) {
            repository.login("camka14@gmail.com", "***REMOVED***")
        }
        repository.getTournament(testTournamentId)
        repository.subscribeToMatches()

        // 2) Initialize time from the tournament
        val tournament = currentTournament.first { it != null }!!
        time = tournament.start

        // 3) Collect matches in a separate coroutine, to detect new or updated matches
        val matchCollector = launch(testDispatcher) {
            matches.collect { newMatchesMap ->
                if (newMatchesMap != null) {
                    for ((matchId, matchWithRel) in newMatchesMap) {
                        matchesLock.withLock {
                            matchCache[matchId] = matchWithRel
                            // If this match can be started (team1/team2 exist, etc.) but no job is running, start one
                            maybeStartMatchJob(matchWithRel)
                        }
                    }
                }
            }
        }

        // 4) “Timekeeper” coroutine: increments time and sends a tick signal to each active match
        val timekeeper = launch(testDispatcher) {
            while (isActive) {
                // If no matches are active, do a small delay and check again
                if (activeMatchControls.isEmpty()) {
                    delay(100)
                    continue
                }

                // Delay between minutes in the simulation
                delay(1000)

                // Increment time by a minute
                timeLock.withLock {
                    time = time.plus(1, DateTimeUnit.MINUTE)
                    println("Time incremented to: $time")
                }

                // Send a “tick” to each match’s channel
                matchesLock.withLock {
                    for ((id, control) in activeMatchControls) {
                        // Try to send a signal
                        control.tickChannel.send(Unit)
                    }
                }
            }
        }

        // Let the simulation run
        println("Cancelling simulation")

        // Clean up
        timekeeper.join()
        matchCollector.join()
    }

    /**
     * If match is playable (teams assigned, etc.) and no match job is running,
     * create a new job for it. That job will loop, waiting for each “tick” from
     * our Channel<Unit> and doing exactly one scoring update per tick, until finished.
     */
    private suspend fun maybeStartMatchJob(match: MatchWithRelations) {
        // If we already have a job, do nothing
        if (activeMatchControls.containsKey(match.match.id)) return

        // Check if match is ready
        if (!matchInPlay(match)) return

        if (isMatchFinished(match)) return

        // Create a new channel for this match
        val channel = Channel<Unit>(capacity = 0)

        // Create a job for this match
        val job = testScope.launch(testDispatcher) {
            // First, if ref is not checked in, do so
            if (match.match.refCheckedIn != true) {
                repository.updateMatch(match.match.copy(refCheckedIn = true))
            }
            var currentSet = 0

            // Now, loop while match is not finished
            while (isActive && !isMatchFinished(match)) {
                // Wait for a “tick” signal
                val signal = channel.receive() // suspends until the timekeeper sends it

                // Update score exactly once per tick
                val isTeam1 = Random.nextBoolean()
                currentSet = updateScore(match, isTeam1, currentSet)
            }

            // Mark the match as ended in DB
            repository.updateMatch(match.match.copy(end = time))

            // Remove from active controls
            matchesLock.withLock {
                activeMatchControls.remove(match.match.id)
            }

            println("Ended job for match: ${match.match.matchNumber}")
        }

        // Store control
        activeMatchControls[match.match.id] = MatchControl(job, channel)
        println("Started match job for: ${match.match.matchNumber}")
    }

    private fun isMatchFinished(match: MatchWithRelations): Boolean {
        val maxSets = if (match.match.losersBracket) {
            currentTournament.value?.loserSetCount
        } else {
            currentTournament.value?.winnerSetCount
        }
        if (maxSets != null) {
            return if (match.match.setResults.count { it == 1} >= maxSets / 2) {
                true
            } else if (match.match.setResults.count { it == 2} >= maxSets / 2) {
                true
            } else {
                false
            }
        }
        return false
    }

    private suspend fun matchInPlay(match: MatchWithRelations): Boolean {
        if (match.match.team1 != null && match.match.team2 != null && time == match.match.start) {
            if (match.match.refCheckedIn != true) {
                repository.updateMatch(match.match.copy(refCheckedIn = true))
                return false
            }
            return true
        } else {
            return false
        }
    }

    private suspend fun updateScore(match: MatchWithRelations, isTeam1: Boolean, currentSet: Int) : Int {
        val currentPoints = if (isTeam1) {
            match.match.team1Points.toMutableList()
        } else {
            match.match.team2Points.toMutableList()
        }

        currentPoints[currentSet]++

        if (isTeam1) {
            match.match.team1Points = currentPoints
        } else {
            match.match.team2Points = currentPoints
        }

        val newSet = checkSetCompletion(match.match, currentSet)

        println("Updating-\nmatchId: ${match.match.matchNumber}\nteam1Points: ${match.match.team1Points}\nteam2Points: ${match.match.team2Points}\nstart: ${match.match.start}\nend: ${match.match.end}")
        repository.updateMatch(match.match)

        return newSet
    }

    private fun checkSetCompletion(match: MatchMVP, currentSet: Int): Int {
        val team1Score = match.team1Points[currentSet]
        val team2Score = match.team2Points[currentSet]
        if (team1Score == team2Score) return currentSet

        val isTeam1Leader = team1Score > team2Score
        val leaderScore: Int
        val followerScore: Int
        if (isTeam1Leader) {
            leaderScore = team1Score
            followerScore = team2Score
        } else {
            leaderScore = team2Score
            followerScore = team1Score
        }

        val pointLimit = if (match.losersBracket) {
            currentTournament.value?.loserScoreLimitsPerSet?.get(currentSet)
        } else {
            currentTournament.value?.winnerScoreLimitsPerSet?.get(currentSet)
        }

        val pointsToVictory = if (match.losersBracket) {
            currentTournament.value?.loserBracketPointsToVictory?.get(currentSet)
        } else {
            currentTournament.value?.winnerBracketPointsToVictory?.get(currentSet)
        }
        val winBy2 = leaderScore - followerScore >= 2 && leaderScore >= pointsToVictory!!
        val winByLimit = leaderScore >= pointLimit!!

        return if(winBy2 || winByLimit) {
            currentSet + 1
        } else {
            currentSet
        }

    }
}