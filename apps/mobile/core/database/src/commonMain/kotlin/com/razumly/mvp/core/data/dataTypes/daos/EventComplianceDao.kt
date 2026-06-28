package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.EventTeamComplianceCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventUserComplianceCacheEntry
import kotlinx.coroutines.flow.Flow

@Dao
interface EventComplianceDao {

    @Upsert
    suspend fun upsertTeamSummaries(summaries: List<EventTeamComplianceCacheEntry>)

    @Upsert
    suspend fun upsertUserSummaries(summaries: List<EventUserComplianceCacheEntry>)

    @Query(
        """
        SELECT * FROM event_team_compliance_summaries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
        ORDER BY teamName, teamId
        """,
    )
    fun observeTeamSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): Flow<List<EventTeamComplianceCacheEntry>>

    @Query(
        """
        SELECT * FROM event_user_compliance_summaries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
          AND parentTeamId != ''
        ORDER BY parentTeamId, fullName, userId
        """,
    )
    fun observeTeamUserSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): Flow<List<EventUserComplianceCacheEntry>>

    @Query(
        """
        SELECT * FROM event_user_compliance_summaries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
          AND parentTeamId = ''
        ORDER BY fullName, userId
        """,
    )
    fun observeStandaloneUserSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): Flow<List<EventUserComplianceCacheEntry>>

    @Query(
        """
        SELECT * FROM event_team_compliance_summaries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
        ORDER BY teamName, teamId
        """,
    )
    suspend fun getTeamSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): List<EventTeamComplianceCacheEntry>

    @Query(
        """
        SELECT * FROM event_user_compliance_summaries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
          AND parentTeamId != ''
        ORDER BY parentTeamId, fullName, userId
        """,
    )
    suspend fun getTeamUserSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): List<EventUserComplianceCacheEntry>

    @Query(
        """
        SELECT * FROM event_user_compliance_summaries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
          AND parentTeamId = ''
        ORDER BY fullName, userId
        """,
    )
    suspend fun getStandaloneUserSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): List<EventUserComplianceCacheEntry>

    @Query(
        """
        DELETE FROM event_team_compliance_summaries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
        """,
    )
    suspend fun deleteTeamSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    )

    @Query(
        """
        DELETE FROM event_user_compliance_summaries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
          AND parentTeamId != ''
        """,
    )
    suspend fun deleteTeamUserSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    )

    @Query(
        """
        DELETE FROM event_user_compliance_summaries
        WHERE eventId = :eventId
          AND cacheSlotId = :cacheSlotId
          AND cacheOccurrenceDate = :cacheOccurrenceDate
          AND parentTeamId = ''
        """,
    )
    suspend fun deleteStandaloneUserSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    )

    @Query("DELETE FROM event_team_compliance_summaries")
    suspend fun clearTeamSummaries()

    @Query("DELETE FROM event_user_compliance_summaries")
    suspend fun clearUserSummaries()

    @Transaction
    suspend fun replaceTeamCompliance(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
        teamSummaries: List<EventTeamComplianceCacheEntry>,
        teamUserSummaries: List<EventUserComplianceCacheEntry>,
    ) {
        deleteTeamSummaries(eventId, cacheSlotId, cacheOccurrenceDate)
        deleteTeamUserSummaries(eventId, cacheSlotId, cacheOccurrenceDate)
        if (teamSummaries.isNotEmpty()) {
            upsertTeamSummaries(teamSummaries)
        }
        if (teamUserSummaries.isNotEmpty()) {
            upsertUserSummaries(teamUserSummaries)
        }
    }

    @Transaction
    suspend fun replaceStandaloneUserCompliance(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
        userSummaries: List<EventUserComplianceCacheEntry>,
    ) {
        deleteStandaloneUserSummaries(eventId, cacheSlotId, cacheOccurrenceDate)
        if (userSummaries.isNotEmpty()) {
            upsertUserSummaries(userSummaries)
        }
    }

    @Transaction
    suspend fun clearAll() {
        clearTeamSummaries()
        clearUserSummaries()
    }
}
