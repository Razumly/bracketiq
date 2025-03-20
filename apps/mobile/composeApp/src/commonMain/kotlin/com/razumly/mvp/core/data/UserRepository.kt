package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toUserData
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.ID
import io.appwrite.Query
import io.appwrite.services.Account
import io.appwrite.services.Databases
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow

class UserRepository(
    private val tournamentDB: MVPDatabase,
    private val account: Account,
    private val database: Databases,
    private val currentUserDataSource: CurrentUserDataSource
) : IUserRepository {
    override suspend fun login(email: String, password: String): Result<UserData> =
        runCatching {
            val session = account.createEmailPasswordSession(email, password)
            val id = account.get().id
            currentUserDataSource.saveUserId(id)
            val currentUser = database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                id,
                nestedType = UserDataDTO::class
            ).data.copy(id = id).toUserData(id)
            tournamentDB.getUserDataDao.upsertUserData(currentUser)

            return Result.success(currentUser)
        }

    override suspend fun logout(): Result<Unit> = kotlin.runCatching {
        currentUserDataSource.saveUserId("")
        account.deleteSession("current")
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    override suspend fun getCurrentUserFlow(): Flow<Result<UserData>> {
        return currentUserDataSource.getUserId().flatMapLatest { userId ->
            if (userId.isBlank()) {
                flow {
                    emit(IMVPRepository.singleResponse(
                        networkCall = {
                            val fetchedUserId = account.get().id
                            currentUserDataSource.saveUserId(fetchedUserId)
                            database.getDocument(
                                DbConstants.DATABASE_NAME,
                                DbConstants.USER_DATA_COLLECTION,
                                fetchedUserId,
                                nestedType = UserDataDTO::class,
                            ).data.toUserData(fetchedUserId)
                        }, saveCall = { userData ->
                            tournamentDB.getUserDataDao.upsertUserData(userData)
                            tournamentDB.getTeamDao.upsertTeamPlayerCrossRefs(
                                userData.teamIds.map { teamId ->
                                    TeamPlayerCrossRef(teamId, userData.id)
                                })
                        }, onReturn = { data ->
                            data
                        }))
                }
            } else {
                tournamentDB.getUserDataDao.getUserFlowById(userId).flatMapLatest { user ->
                    flow {
                        if (user != null) {
                            emit(Result.success(user))
                        } else {
                            currentUserDataSource.saveUserId("")
                            emit(Result.failure<UserData>(Exception("User id not found locally")))
                        }
                    }
                }
            }
        }
    }

    override suspend fun getUsersOfTournament(tournamentId: String): Result<List<UserData>> =
        IMVPRepository.multiResponse(
            networkCall = {
                val docs = database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.USER_DATA_COLLECTION,
                    listOf(Query.contains(DbConstants.TOURNAMENTS_ATTRIBUTE, tournamentId)),
                    nestedType = UserDataDTO::class,
                )
                docs.documents.map { it.data.toUserData(it.id) }
            },
            saveData = { usersData ->
                tournamentDB.getUserDataDao.upsertUsersData(usersData)
            },
            getLocalIds = { tournamentDB.getUserDataDao.getUsers(tournamentId).toSet() },
            deleteStaleData = { ids -> tournamentDB.getUserDataDao.deleteUsersById(ids) },
        )

    override suspend fun getUsersOfTournamentFlow(tournamentId: String): Flow<Result<List<UserData>>> {
        TODO("Not yet implemented")
    }


    override suspend fun createNewUser(
        email: String, password: String, firstName: String, lastName: String, userName: String
    ): Result<UserData> {
        return runCatching {
            val userId = ID.unique()
            account.create(
                userId = userId, email = email, password = password, name = userName
            )
            val doc = database.createDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.USER_DATA_COLLECTION,
                documentId = userId,
                nestedType = UserDataDTO::class,
                data = UserDataDTO(firstName, lastName, userName, userId),
            )
            doc.data.toUserData(doc.id)
        }
    }

    override suspend fun updateUser(user: UserData): Result<UserData> {
        return IMVPRepository.singleResponse(networkCall = {
            database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                user.id,
                user,
                nestedType = UserDataDTO::class
            ).data.toUserData(user.id)
        }, saveCall = { newData ->
            tournamentDB.getUserDataDao.upsertUserData(newData)
        }, onReturn = { data ->
            data
        })
    }
}