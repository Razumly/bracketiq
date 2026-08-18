package com.razumly.mvp.core.data

import android.content.Context
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.db.MVPDatabaseService
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.After
import org.junit.Before
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MatchGraphPersistenceTest {
    private lateinit var context: Context
    private val databaseName = "match-graph-persistence"

    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        context.deleteDatabase(databaseName)
    }

    @After
    fun tearDown() {
        context.deleteDatabase(databaseName)
    }

    @Test
    fun room_reopen_preserves_unplaced_graph_identity_and_phase_ownership() = runBlocking {
        val first = Room.databaseBuilder<MVPDatabaseService>(
            context,
            MVPDatabaseService::class.java,
            databaseName,
        ).allowMainThreadQueries().build()
        try {
            first.getMatchDao.upsertMatches(
                listOf(
                    MatchMVP(
                        id = "event-graph:match:1",
                        matchId = 1,
                        eventId = "event-graph",
                        placementState = "UNPLACED",
                        phase = "POOL",
                        sourceDivisionId = "entry-open",
                        phaseDivisionId = "phase-pool",
                        team1Seed = 1,
                        team2Seed = 2,
                        winnerNextMatchId = "event-graph:match:3",
                        previousLeftId = null,
                        previousRightId = null,
                        fieldId = null,
                        start = null,
                        end = null,
                    ),
                    MatchMVP(
                        id = "event-graph:match:3",
                        matchId = 3,
                        eventId = "event-graph",
                        placementState = "UNPLACED",
                        phase = "BRACKET",
                        sourceDivisionId = "phase-pool",
                        phaseDivisionId = "phase-bracket",
                        division = "phase-pool",
                        fieldId = null,
                        start = null,
                        end = null,
                    ),
                ),
            )
            assertEquals(2, first.getMatchDao.getMatchesOfTournament("event-graph").size)
        } finally {
            first.close()
        }

        val reopened = Room.databaseBuilder<MVPDatabaseService>(
            context,
            MVPDatabaseService::class.java,
            databaseName,
        ).allowMainThreadQueries().build()
        try {
            val matches = reopened.getMatchDao.getMatchesOfTournament("event-graph")
                .associateBy(MatchMVP::id)
            val poolMatch = matches.getValue("event-graph:match:1")
            val bracketMatch = matches.getValue("event-graph:match:3")

            assertEquals("UNPLACED", poolMatch.placementState)
            assertEquals("POOL", poolMatch.phase)
            assertEquals("entry-open", poolMatch.sourceDivisionId)
            assertEquals("phase-pool", poolMatch.phaseDivisionId)
            assertEquals("entry-open", poolMatch.division)
            assertEquals(1, poolMatch.team1Seed)
            assertEquals(2, poolMatch.team2Seed)
            assertEquals("event-graph:match:3", poolMatch.winnerNextMatchId)
            assertNull(poolMatch.fieldId)
            assertNull(poolMatch.start)
            assertNull(poolMatch.end)
            assertEquals("BRACKET", bracketMatch.phase)
            assertEquals("phase-pool", bracketMatch.sourceDivisionId)
            assertEquals("phase-bracket", bracketMatch.phaseDivisionId)
            assertEquals("phase-pool", bracketMatch.division)
            assertEquals("event-graph:match:1", bracketMatch.previousLeftId)
            assertEquals("event-graph:match:2", bracketMatch.previousRightId)
            assertTrue(matches.values.all { it.eventId == "event-graph" })
        } finally {
            reopened.close()
        }
    }
}
