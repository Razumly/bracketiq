package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import kotlinx.coroutines.flow.Flow

@Dao
interface EventDao {

    @Upsert
    suspend fun upsertEvent(game: Event)

    @Upsert
    suspend fun upsertEvents(games: List<Event>)

    @Delete
    suspend fun deleteEvent(game: Event)

    @Query("DELETE FROM Event WHERE id IN (:ids)")
    suspend fun deleteEventsById(ids: List<String>)

    @Query("DELETE FROM Event")
    suspend fun deleteAllEvents()

    @Query("SELECT * FROM Event")
    fun getAllCachedEvents(): Flow<List<Event>>

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

    @Query("DELETE FROM Event WHERE id = :id")
    suspend fun deleteEventById(id: String)

    @Query("SELECT * FROM Event WHERE id = :id")
    suspend fun getEventById(id: String): Event?

    @Transaction
    @Query("SELECT * FROM Event WHERE id = :id")
    suspend fun getEventWithRelationsById(id: String): EventWithRelations

    @Transaction
    @Query("SELECT * FROM Event WHERE id = :id")
    fun getEventWithRelationsFlow(id: String): Flow<EventWithRelations>

    @Transaction
    suspend fun upsertEventWithRelations(event: Event) {
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
