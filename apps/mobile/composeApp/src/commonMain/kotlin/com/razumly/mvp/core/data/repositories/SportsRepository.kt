package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.SportsResponseDto

interface ISportsRepository {
    suspend fun getSports(): Result<List<Sport>>
}

class SportsRepository(
    private val api: MvpApiClient,
) : ISportsRepository {
    override suspend fun getSports(): Result<List<Sport>> = runCatching {
        api.get<SportsResponseDto>("api/sports")
            .sports
            .mapNotNull { it.toSportOrNull() }
            .sortedBy { it.name.lowercase() }
    }
}
