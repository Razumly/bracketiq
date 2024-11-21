package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations

@Dao
interface MatchDao {
    @Upsert
    suspend fun upsertMatch(match: MatchMVP)

    @Upsert
    suspend fun upsertMatches(matches: List<MatchMVP>)

    @Delete
    suspend fun deleteMatch(match: MatchMVP)

    @Transaction
    @Query("SELECT * FROM MatchMVP WHERE id = :id")
    suspend fun getMatchById(id: String): MatchWithRelations?

    @Transaction
    @Query("SELECT * FROM MatchMVP WHERE tournamentId = :tournamentId")
    suspend fun getMatchesByTournamentId(tournamentId: String): List<MatchWithRelations>

}