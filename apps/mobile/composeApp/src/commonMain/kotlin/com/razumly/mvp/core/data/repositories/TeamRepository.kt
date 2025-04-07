package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
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
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class TeamRepository(
    private val database: Databases,
    private val mvpDatabase: MVPDatabase,
    private val userRepository: IUserRepository
) : ITeamRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    override fun getTeamsOfTournamentFlow(tournamentId: String): Flow<Result<List<TeamWithPlayers>>> =
        channelFlow {
            val localJob = launch {
                mvpDatabase.getTeamDao.getTeamsInTournamentFlow(tournamentId).collect { teams ->
                        send(Result.success(teams))
                    }
            }

            getTeamsOfTournament(tournamentId).onFailure { remoteResult ->
                send(Result.failure(remoteResult))
            }

            awaitClose { localJob.cancel() }
        }

    override fun getTeamsOfEventFlow(eventId: String): Flow<Result<List<TeamWithPlayers>>> {
        val localFlow =
            mvpDatabase.getTeamDao.getTeamsInEventFlow(eventId).map { Result.success(it) }
        scope.launch {
            getTeamsOfEvent(eventId)
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
                mvpDatabase.getTeamDao.upsertTeamsWithRelations(teams)
            },
            deleteData = { teamIds ->
                mvpDatabase.getTeamDao.deleteTeamsByIds(teamIds)
            })

    override suspend fun getTeamsOfEvent(eventId: String): Result<List<Team>> = multiResponse(
        getRemoteData = {
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
        saveData = { teams -> mvpDatabase.getTeamDao.upsertTeamsWithRelations(teams) },
        deleteData = { teamIds -> mvpDatabase.getTeamDao.deleteTeamsByIds(teamIds) })

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> {
        val addResult = runCatching {
            mvpDatabase.getTeamDao.upsertTeamPlayerCrossRef(
                TeamPlayerCrossRef(
                    team.id, player.id
                )
            )
        }

        if (!team.players.contains(player.id) && team.pending.contains(player.id)) {
            val updatedTeam =
                team.copy(players = team.players + player.id, pending = team.pending - player.id)
            updateTeam(updatedTeam).onFailure {
                mvpDatabase.getTeamDao.deleteTeamPlayerCrossRef(
                    TeamPlayerCrossRef(
                        team.id, player.id
                    )
                )
                return Result.failure(it)
            }
        }
        if (!player.teamIds.contains(team.id)) {
            val updatedUserData = player.copy(teamIds = player.teamIds + team.id)
            userRepository.updateUser(updatedUserData).onFailure {
                mvpDatabase.getTeamDao.deleteTeamPlayerCrossRef(
                    TeamPlayerCrossRef(
                        team.id, player.id
                    )
                )
                return Result.failure(it)
            }
        }

        return addResult
    }

    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> {
        val deleteResult = runCatching {
            mvpDatabase.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(team.id, player.id))
        }
        if (team.players.contains(player.id)) {
            val updatedTeam = team.copy(players = team.players - player.id)
            updateTeam(updatedTeam).onFailure {
                mvpDatabase.getTeamDao.upsertTeamPlayerCrossRef(
                    TeamPlayerCrossRef(
                        team.id, player.id
                    )
                )
                return Result.failure(it)
            }
        }
        if (player.teamIds.contains(team.id)) {
            val updatedUserData = player.copy(teamIds = player.teamIds - team.id)
            userRepository.updateUser(updatedUserData).onFailure {
                mvpDatabase.getTeamDao.upsertTeamPlayerCrossRef(
                    TeamPlayerCrossRef(
                        team.id, player.id
                    )
                )
                return Result.failure(it)
            }
        }

        return deleteResult
    }

    override suspend fun createTeam(team: Team): Result<Team> {
        val id = ID.unique()
        val currentUser = userRepository.currentUserFlow.value
            ?: return Result.failure(Exception("No current user"))

        return singleResponse(networkCall = {
            val remoteTeam = database.createDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                documentId = id,
                data = team,
                nestedType = TeamDTO::class,
            ).data.toTeam(id)
            remoteTeam
        }, saveCall = { remoteTeam ->
            mvpDatabase.getTeamDao.upsertTeamWithRelations(remoteTeam)
            userRepository.updateUser(currentUser.copy(teamIds = currentUser.teamIds + id))
                .getOrThrow()
            userRepository.getUsers(team.pending).onSuccess { players ->
                players.forEach { player ->
                    userRepository.updateUser(
                        player.copy(teamInvites = player.teamInvites + team.id)
                    )
                }
            }
        }, onReturn = { it })
    }

    override suspend fun updateTeam(newTeam: Team): Result<Team> = singleResponse(networkCall = {
        database.updateDocument(
            databaseId = DbConstants.DATABASE_NAME,
            collectionId = DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
            documentId = newTeam.id,
            data = newTeam.toTeamDTO(),
            nestedType = TeamDTO::class
        ).data.toTeam(newTeam.id)
    }, saveCall = { newData ->
        val oldTeam = mvpDatabase.getTeamDao.getTeam(newData.id)
        mvpDatabase.getTeamDao.upsertTeamWithRelations(newData)
        userRepository.getUsers(oldTeam.players.filterNot {
            newTeam.players.contains(it)
        }).onSuccess { removedPlayers ->
            removedPlayers.forEach { player ->
                removePlayerFromTeam(newData, player)
            }
        }
        userRepository.getUsers(newData.pending).onSuccess { players ->
            players.forEach { player ->
                userRepository.updateUser(
                    player.copy(teamInvites = player.teamInvites + newData.id)
                )
            }
        }
    }, onReturn = { team ->
        team
    })

    override fun getTeamsWithPlayersFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> {
        val localTeamsFlow = mvpDatabase.getTeamDao.getTeamsWithPlayersFlowByIds(ids).map {
            Result.success(it)
        }.stateIn(scope, SharingStarted.Eagerly, Result.success(emptyList()))

        scope.launch {
            multiResponse(getRemoteData = {
                val teams = database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                    queries = listOf(
                        Query.equal("\$id", ids), Query.limit(200)
                    ),
                    TeamDTO::class,
                ).documents.map { dtoDoc ->
                    dtoDoc.convert { it.toTeam(dtoDoc.id) }.data
                }
                teams.forEach { team ->
                    userRepository.getUsers(team.players)
                }
                teams
            }, getLocalData = {
                mvpDatabase.getTeamDao.getTeams(ids)
            }, saveData = { teams ->
                mvpDatabase.getTeamDao.upsertTeamsWithRelations(teams)
            }, deleteData = { teamIds ->
                mvpDatabase.getTeamDao.deleteTeamsByIds(teamIds)
            })
        }

        return localTeamsFlow
    }

    override suspend fun getTeam(teamId: String): Result<Team> = singleResponse(
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
