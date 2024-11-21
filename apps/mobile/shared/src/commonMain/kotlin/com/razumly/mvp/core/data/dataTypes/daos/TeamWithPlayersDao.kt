package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers

@Dao
interface TeamWithPlayersDao {
    @Transaction
    @Query("SELECT * FROM Team")
    suspend fun getTeamWithPlayers(): List<TeamWithPlayers>?
}