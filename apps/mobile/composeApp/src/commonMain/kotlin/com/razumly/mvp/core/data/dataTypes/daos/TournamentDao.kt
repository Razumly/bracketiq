package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import kotlinx.coroutines.flow.Flow

@Dao
interface TournamentDao {

    @Upsert
    suspend fun upsertTournament(event: Event)

    @Upsert
    suspend fun upsertTournaments(events: List<Event>)

    @Delete
    suspend fun deleteTournament(event: Event)

    @Query("DELETE FROM Event")
    suspend fun deleteAllTournaments()

    @Query("DELETE FROM Event WHERE id = :id")
    suspend fun deleteTournamentById(id: String)

    @Query("DELETE FROM Event WHERE id IN (:ids)")
    suspend fun deleteTournamentsById(ids: List<String>)

    @Query("SELECT * FROM Event WHERE id = :id")
    fun getTournamentFlowById(id: String): Flow<Event>

    @Query("SELECT * FROM Event WHERE id = :id")
    suspend fun getTournamentById(id: String): Event

    @Query("SELECT * FROM Event")
    fun getAllCachedTournamentsFlow(): Flow<List<Event>>

    @Transaction
    @Query("SELECT * FROM Event WHERE id = :id")
    fun getTournamentWithRelationsFlow(id: String): Flow<TournamentWithRelations>

    @Transaction
    @Query("SELECT * FROM Event WHERE id = :id")
    suspend fun getTournamentWithRelations(id: String): TournamentWithRelations

    @Transaction
    suspend fun upsertTournamentWithRelations(event: Event) {
        deleteTournamentCrossRefs(event.id)
        upsertTournament(event)
    }

    @Transaction
    suspend fun deleteTournamentWithCrossRefs(tournamentId: String) {
        deleteTournamentById(tournamentId)
        deleteTournamentCrossRefs(tournamentId)
    }

    @Transaction
    suspend fun deleteTournamentCrossRefs(tournamentId: String) {
        deleteTournamentUserCrossRefs(tournamentId)
        deleteTournamentMatchCrossRefs(tournamentId)
        deleteTournamentTeamCrossRefs(tournamentId)
    }

    @Query("DELETE FROM user_tournament_cross_ref WHERE tournamentId = :tournamentId")
    suspend fun deleteTournamentUserCrossRefs(tournamentId: String)

    @Query("DELETE FROM tournament_match_cross_ref WHERE tournamentId = :tournamentId")
    suspend fun deleteTournamentMatchCrossRefs(tournamentId: String)

    @Query("DELETE FROM tournament_team_cross_ref WHERE tournamentId = :tournamentId")
    suspend fun deleteTournamentTeamCrossRefs(tournamentId: String)
}
