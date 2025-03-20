package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import com.razumly.mvp.core.data.dataTypes.dtos.TeamDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toTeam
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.convert
import io.appwrite.ID
import io.appwrite.Query
import io.appwrite.services.Databases
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.firstOrNull

class TeamRepository(
    private val database: Databases,
    private val tournamentDB: MVPDatabase,
    private val userRepository: UserRepository
) : ITeamRepository {
    override suspend fun getTeamsOfTournament(tournamentId: String): Result<List<Team>> =
        IMVPRepository.multiResponse(networkCall = {
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                queries = listOf(
                    Query.contains(DbConstants.TOURNAMENTS_ATTRIBUTE, tournamentId),
                    Query.limit(200)
                ),
                TeamDTO::class,
            ).documents.map { dtoDoc -> dtoDoc.convert { it.toTeam(dtoDoc.id) }.data }
        },
            getLocalIds = { tournamentDB.getTeamDao.getTeamsInTournament(tournamentId).toSet() },
            deleteStaleData = { tournamentDB.getTeamDao.deleteTeamsByIds(it) },
            saveData = { teams -> tournamentDB.getTeamDao.upsertTeams(teams) })

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> {
        TODO("Not yet implemented")
    }

    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> {
        TODO("Not yet implemented")
    }

    override suspend fun createTeam(): Result<Team> {
        val id = ID.unique()
        val currentUserResult = userRepository.getCurrentUserFlow().first()

        return currentUserResult.fold(
            onSuccess = { currentUser ->
                try {
                    // Create the team
                    val team = IMVPRepository.singleResponse(networkCall = {
                        database.createDocument(
                            databaseId = DbConstants.DATABASE_NAME,
                            collectionId = DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                            documentId = id,
                            data = Team(captainId = currentUser.id).toTeamDTO(),
                            nestedType = TeamDTO::class,
                        ).data.toTeam(id)
                    }, saveCall = { team ->
                        tournamentDB.getTeamDao.upsertTeam(team)
                    }, onReturn = { it })

                    // Return the team in Result.success
                    Result.success(team)
                } catch (e: Exception) {
                    Result.failure<Team>(Exception("Failed to create team", e))
                }
            },
            onFailure = { exception ->
                // If the flow result is a failure, return that as a Result.failure
                Result.failure<Team>(Exception("Missing current user", exception))
            }
        )
    }

    override suspend fun updateTeam(team: Team): Result<Team> {
        TODO("Not yet implemented")
    }

    override suspend fun getTeamsWithPlayersFlow(ids: List<String>): Flow<Result<List<TeamWithRelations>>> {
        TODO("Not yet implemented")
    }
}