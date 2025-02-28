package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.PickupGame

@Dao
interface PickupGameDao {
    @Upsert
    suspend fun upsertPickupGame(game: PickupGame)

    @Upsert
    suspend fun upsertPickupGames(games: List<PickupGame>)

    @Delete
    suspend fun deletePickupGame(game: PickupGame)

    @Query("DELETE FROM PickupGame WHERE id IN (:ids)")
    suspend fun deletePickupGamesById(ids: List<String>)

    @Query("SELECT * FROM PickupGame")
    suspend fun getAllCachedPickupGames(): List<PickupGame>

    @Query("DELETE FROM PickupGame WHERE id = :id")
    suspend fun deletePickupGameById(id: String)

    @Query("SELECT * FROM PickupGame WHERE id = :id")
    suspend fun getPickupGameById(id: String): PickupGame?
}