package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.TeamDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toTeam
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.convert
import io.appwrite.ID
import io.appwrite.Query
import io.appwrite.services.Databases
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class TeamRepository(
    private val database: Databases,
    private val mvpDatabase: MVPDatabase,
    private val userRepository: IUserRepository
) : ITeamRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    override fun getTeamsOfTournamentFlow(tournamentId: String): Flow<Result<List<TeamWithRelations>>> {
        val localFlow = mvpDatabase.getTeamDao.getTeamsInTournamentFlow(tournamentId).map { Result.success(it) }
        scope.launch {
            getTeamsOfTournament(tournamentId)
        }
        return localFlow
    }

    override fun getTeamsOfEventFlow(eventId: String): Flow<Result<List<TeamWithRelations>>> {
        val localFlow = mvpDatabase.getTeamDao.getTeamsInEventFlow(eventId).map { Result.success(it) }
        scope.launch {
            getTeamsOfTournament(eventId)
        }
        return localFlow
    }

    override suspend fun getTeamsOfTournament(tournamentId: String): Result<List<Team>> =
        multiResponse(getRemoteData = {
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
            getLocalData = { mvpDatabase.getTeamDao.getTeamsInTournament(tournamentId) },
            saveData = { teams ->
                mvpDatabase.getTeamDao.upsertTeams(teams)
                mvpDatabase.getTeamDao.upsertTournamentTeamCrossRefs(teams.map {
                    TournamentTeamCrossRef(
                        tournamentId, it.id
                    )
                })
                mvpDatabase.getTeamDao.upsertTeamPlayerCrossRefs(teams.flatMap { team ->
                    team.players.map { player -> TeamPlayerCrossRef(team.id, player) }
                })
            })


    override suspend fun getTeamsOfEvent(eventId: String): Result<List<Team>> =
        multiResponse(getRemoteData = {
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                queries = listOf(
                    Query.contains(DbConstants.EVENTS_ATTRIBUTE, eventId), Query.limit(200)
                ),
                TeamDTO::class,
            ).documents.map { dtoDoc -> dtoDoc.convert { it.toTeam(dtoDoc.id) }.data }
        },
            getLocalData = { mvpDatabase.getTeamDao.getTeamsInEvent(eventId) },
            saveData = { teams -> mvpDatabase.getTeamDao.upsertTeamsWithRelations(teams) })

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> {
        if (!team.players.contains(player.id)) {
            val updatedTeam = team.copy(players = team.players + player.id)
            updateTeam(updatedTeam).onFailure { return Result.failure(it) }
        }
        if (!player.teamIds.contains(team.id)) {
            val updatedUserData = player.copy(teamIds = player.teamIds + team.id)
            userRepository.updateUser(updatedUserData).onFailure { return Result.failure(it) }
        }

        return runCatching {
            mvpDatabase.getTeamDao.upsertTeamPlayerCrossRef(
                TeamPlayerCrossRef(
                    team.id, player.id
                )
            )
        }
    }

    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> {
        if (!team.players.contains(player.id)) {
            val updatedTeam = team.copy(players = team.players - player.id)
            updateTeam(updatedTeam).onFailure { return Result.failure(it) }
        }
        if (!player.teamIds.contains(team.id)) {
            val updatedUserData = player.copy(teamIds = player.teamIds - team.id)
            userRepository.updateUser(updatedUserData).onFailure { return Result.failure(it) }
        }

        return runCatching {
            mvpDatabase.getTeamDao.upsertTeamPlayerCrossRef(TeamPlayerCrossRef(team.id, player.id))
        }
    }

    override suspend fun createTeam(): Result<Team> {
        val id = ID.unique()
        val currentUserResult = userRepository.getCurrentUserFlow().first()

        return currentUserResult.fold(onSuccess = { currentUser ->
            singleResponse(networkCall = {
                database.createDocument(
                    databaseId = DbConstants.DATABASE_NAME,
                    collectionId = DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                    documentId = id,
                    data = Team(captainId = currentUser.user.id).toTeamDTO(),
                    nestedType = TeamDTO::class,
                ).data.toTeam(id)
            }, saveCall = { team ->
                mvpDatabase.getTeamDao.upsertTeamWithRelations(team)
            }, onReturn = { it })
        }, onFailure = { exception ->
            // If the flow result is a failure, return that as a Result.failure
            Result.failure(Exception("Missing current user", exception))
        })
    }

    override suspend fun updateTeam(newTeam: Team): Result<Team> =
        singleResponse(networkCall = {
            database.updateDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                documentId = newTeam.id,
                data = newTeam.toTeamDTO(),
                nestedType = TeamDTO::class
            ).data.toTeam(newTeam.id)
        }, saveCall = { newData ->
            mvpDatabase.getTeamDao.upsertTeamWithRelations(newData)
        }, onReturn = { team ->
            team
        })

    override fun getTeamsWithPlayersFlow(ids: List<String>): Flow<Result<List<TeamWithRelations>>> {
        val localTeamsFlow = mvpDatabase.getTeamDao.getTeamsWithPlayersFlowByIds(ids)

        val remoteFetchFlow = flow {
            emit(runCatching {
                multiResponse(getRemoteData = {
                    database.listDocuments(
                        DbConstants.DATABASE_NAME,
                        DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                        queries = listOf(
                            Query.equal("\$id", ids), Query.limit(200)
                        ),
                        TeamDTO::class,
                    ).documents.map { dtoDoc ->
                        dtoDoc.convert { it.toTeam(dtoDoc.id) }.data
                    }
                }, getLocalData = {
                    mvpDatabase.getTeamDao.getTeams(ids)
                }, saveData = { teams ->
                    mvpDatabase.getTeamDao.upsertTeamsWithRelations(teams)
                })
                mvpDatabase.getTeamDao.getTeamsWithPlayers(ids)
            })
        }.stateIn(scope, SharingStarted.Eagerly, null)

        return combine(localTeamsFlow, remoteFetchFlow) { localTeams, remoteResult ->
            remoteResult ?: Result.success(localTeams)
        }
    }

    override suspend fun getTeam(teamId: String): Result<Team> =
        singleResponse(
            networkCall = {
                database.getDocument(
                    DbConstants.DATABASE_NAME,
                    DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                    teamId,
                    nestedType = TeamDTO::class,
                ).data.toTeam(teamId)
            },
            saveCall = { team -> mvpDatabase.getTeamDao.upsertTeam(team) },
            onReturn = { team -> team },
        )

    override fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>> {
        val localFlow = mvpDatabase.getTeamDao.getTeamWithPlayersFlow(id).map { Result.success(it) }
        scope.launch {
            getTeam(id)
        }
        return localFlow
    }
}
