package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
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

    @Query("DELETE FROM EventImp")
    suspend fun deleteAllEvents()

    @Query("SELECT * FROM EventImp")
    fun getAllCachedEvents(): Flow<List<EventImp>>

    @Query("SELECT * FROM event_team_cross_ref WHERE eventId == :eventId")
    suspend fun getEventTeamCrossRefsByEventId(eventId: String): List<EventTeamCrossRef>

    @Upsert
    suspend fun upsertEventTeamCrossRefs(crossRefs: List<EventTeamCrossRef>)

    @Delete
    suspend fun deleteEventTeamCrossRefs(crossRefs: List<EventTeamCrossRef>)

    @Query("SELECT * FROM user_event_cross_ref WHERE eventId == :eventId")
    suspend fun getEventUserCrossRefsByEventId(eventId: String): List<EventUserCrossRef>

    @Delete
    suspend fun deleteEventUserCrossRefs(crossRefs: List<EventUserCrossRef>)

    @Query("DELETE FROM EventImp WHERE id = :id")
    suspend fun deleteEventById(id: String)

    @Query("SELECT * FROM EventImp WHERE id = :id")
    suspend fun getEventById(id: String): EventImp?

    @Transaction
    @Query("SELECT * FROM EventImp WHERE id = :id")
    suspend fun getEventWithRelationsById(id: String): EventWithRelations

    @Transaction
    @Query("SELECT * FROM EventImp WHERE id = :id")
    fun getEventWithRelationsFlow(id: String): Flow<EventWithRelations>

    @Transaction
    suspend fun upsertEventWithRelations(event: EventImp) {
        deleteEventCrossRefs(event.id)
        upsertEvent(event)
    }

    @Transaction
    suspend fun deleteEventWithCrossRefs(eventId: String) {
        deleteEventById(eventId)
        deleteEventCrossRefs(eventId)
    }

    @Transaction
    suspend fun deleteEventCrossRefs(eventId: String) {
        deleteEventUserCrossRefsByEventId(eventId)
        deleteEventTeamCrossRefsByEventId(eventId)
    }

    @Query("DELETE FROM user_event_cross_ref WHERE eventId = :eventId")
    suspend fun deleteEventUserCrossRefsByEventId(eventId: String)

    @Query("DELETE FROM event_team_cross_ref WHERE eventId = :eventId")
    suspend fun deleteEventTeamCrossRefsByEventId(eventId: String)
}
