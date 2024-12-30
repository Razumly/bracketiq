package com.razumly.mvp

import com.razumly.mvp.core.data.MVPRepository
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.launch
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
import kotlin.random.Random
import kotlin.test.Test
import kotlin.time.Duration.Companion.minutes


@OptIn(ExperimentalCoroutinesApi::class)
class TournamentSimulator : BaseTest(), KoinComponent {
    private val repository: MVPRepository by inject()
    private lateinit var currentTournament: Tournament
    private lateinit var matches: Map<String, MatchWithRelations>
    private lateinit var time: Instant
    private val matchesLock = Mutex()
    private val testScope = TestScope(testDispatcher)

    @Test
    fun start() = runTest(timeout = 20.minutes) {
        val job = testScope.launch {
            val user = repository.getCurrentUser()
            if (user == null) {
                repository.login("camka14@gmail.com", "***REMOVED***")
            }
            val events = repository.getEvents()
            currentTournament = repository.getTournament(events[0].id)!!
            matches = repository.getMatches(currentTournament.id)
            repository.subscribeToMatches()

            testScope.launch {
                repository.matchUpdates
                    .buffer()
                    .collect { updatedMatch ->
                        matchesLock.withLock {
                            matches = matches.toMutableMap().apply {
                                put(updatedMatch.match.id, updatedMatch)
                            }
                        }
                    }
            }

            matches.values.toList().forEach { initialMatch ->
                launch {
                    while (true) {
                        delay(100)
                        var currentMatch = matchesLock.withLock {
                            matches[initialMatch.match.id]
                        } ?: break // Exit if match no longer exists
                        if (isMatchFinished(currentMatch.match.setResults)) {
                            break
                        }

                        if (!matchInPlay(currentMatch)) {
                            continue
                        }
                        time = currentMatch.match.start

                        val maxSet = if (currentMatch.match.losersBracket) {
                            currentTournament.loserSetCount
                        } else {
                            currentTournament.winnerSetCount
                        }

                        var currentSet = 0
                        while (!isMatchFinished(currentMatch.match.setResults)) {
                            val isTeam1 = Random.nextBoolean()
                            matchesLock.withLock {
                                currentSet = updateScore(currentMatch, isTeam1, currentSet)
                            }
                            // Increment tournament time by 1 minute
                            time = time.plus(1, DateTimeUnit.MINUTE)
                        }
                        repository.updateMatch(currentMatch.match.copy(end = time))
                        break
                    }
                }
            }
        }
        job.join()
        advanceUntilIdle()
    }

    private fun isMatchFinished(setResults: List<Int>): Boolean {
        return setResults.count {it == 1} == 2
    }

    private suspend fun matchInPlay(match: MatchWithRelations): Boolean {
        if (match.match.team1 != null && match.match.team2 != null) {
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

        var newSet = currentSet

        val pointLimit = if (match.match.losersBracket) {
            currentTournament.loserScoreLimitsPerSet[currentSet]
        } else {
            currentTournament.winnerScoreLimitsPerSet[currentSet]
        }

        if (currentPoints[currentSet] < pointLimit) {
            currentPoints[currentSet]++

            if (isTeam1) {
                match.match.team1Points = currentPoints
            } else {
                match.match.team2Points = currentPoints
            }

            newSet = checkSetCompletion(match.match, currentSet)

            repository.updateMatch(match.match)
        }

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
            currentTournament.loserScoreLimitsPerSet[currentSet]
        } else {
            currentTournament.winnerScoreLimitsPerSet[currentSet]
        }

        val pointsToVictory = if (match.losersBracket) {
            currentTournament.loserBracketPointsToVictory[currentSet]
        } else {
            currentTournament.winnerBracketPointsToVictory[currentSet]
        }
        val winBy2 = leaderScore - followerScore >= 2 && leaderScore >= pointsToVictory
        val winByLimit = leaderScore >= pointLimit

        return if(winBy2 || winByLimit) {
            currentSet + 1
        } else {
            currentSet
        }

    }
}