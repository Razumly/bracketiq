package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_ACKED
import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry
import com.razumly.mvp.core.db.MVPDatabaseService
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MatchOperationOutboxDaoBehaviorTest {

    @Test
    fun given_oldAcknowledgements_when_outboxDaoPrunes_then_retainsSequenceSentinel() = runBlocking {
        val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(
            InstrumentationRegistry.getInstrumentation().targetContext,
        ).allowMainThreadQueries().build()

        try {
            val acknowledged = (1L..3L).map { sequence ->
                MatchOperationOutboxEntry(
                    id = "device-1:match-1:$sequence",
                    eventId = "event-1",
                    matchId = "match-1",
                    operationKind = "SCORE_SET",
                    payloadJson = "{}",
                    status = MATCH_OPERATION_STATUS_ACKED,
                    sourceDevice = "PHONE",
                    clientDeviceId = "device-1",
                    clientSequence = sequence,
                    clientCreatedAt = "2026-01-0${sequence}T00:00:00Z",
                    ackedAt = "2026-01-0${sequence}T00:01:00Z",
                )
            }
            database.getMatchOperationOutboxDao.upsertOperations(acknowledged)

            database.getMatchOperationOutboxDao.deleteAckedOlderThan("2026-02-01T00:00:00Z")

            assertEquals(
                listOf(3L),
                database.getMatchOperationOutboxDao
                    .getOperationsByIds(acknowledged.map(MatchOperationOutboxEntry::id))
                    .map(MatchOperationOutboxEntry::clientSequence),
            )
            assertEquals(3L, database.getMatchOperationOutboxDao.maxClientSequence())
        } finally {
            database.close()
        }
    }
}
