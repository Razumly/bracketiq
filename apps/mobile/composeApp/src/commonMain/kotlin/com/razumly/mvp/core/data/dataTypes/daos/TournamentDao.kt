package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations

@Dao
interface TournamentDao {
    @Upsert
    suspend fun upsertTournament(tournament: Tournament)

    @Delete
    suspend fun deleteTournament(tournament: Tournament)

    @Query("SELECT * FROM Tournament WHERE id = :id")
    suspend fun getTournamentById(id: String): Tournament?

    @Transaction
    @Query("SELECT * FROM Tournament WHERE id = :id")
    suspend fun getUsersOfTournament(id: String): TournamentWithRelations
}