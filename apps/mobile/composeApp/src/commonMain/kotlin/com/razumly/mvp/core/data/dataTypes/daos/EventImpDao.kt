package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import kotlinx.coroutines.flow.Flow

@Dao
interface EventImpDao {
    @Upsert
    suspend fun upsertEvent(game: EventImp)

    @Upsert
    suspend fun upsertEvents(games: List<EventImp>)

    @Delete
    suspend fun deleteEvent(game: EventImp)

    @Query("DELETE FROM EventImp WHERE id IN (:ids)")
    suspend fun deleteEventsById(ids: List<String>)

    @Query("SELECT * FROM EventImp")
    fun getAllCachedEvents(): Flow<List<EventWithRelations>>

    @Query("DELETE FROM EventImp WHERE id = :id")
    suspend fun deleteEventById(id: String)

    @Query("SELECT * FROM EventImp WHERE id = :id")
    suspend fun getEventById(id: String): EventImp?

    @Query("SELECT * FROM EventImp WHERE id = :id")
    suspend fun getEventWithRelationsById(id: String): EventWithRelations

    @Transaction
    @Query("SELECT * FROM EventImp WHERE id = :id")
    fun getEventWithRelationsFlow(id: String): Flow<EventWithRelations?>


    @Transaction
    suspend fun upsertEventWithRelations(event: EventImp) {
        deleteEventWithCrossRefs(event.id)
        upsertEvent(event)
    }

    @Transaction
    suspend fun deleteEventWithCrossRefs(eventId: String) {
        deleteEventUserCrossRefs(eventId)
        deleteEventTeamCrossRefs(eventId)
        deleteEventById(eventId)
    }

    @Query("DELETE FROM EventUserCrossRef WHERE eventId = :eventId")
    suspend fun deleteEventUserCrossRefs(eventId: String)

    @Query("DELETE FROM EventTeamCrossRef WHERE eventId = :eventId")
    suspend fun deleteEventTeamCrossRefs(eventId: String)
}