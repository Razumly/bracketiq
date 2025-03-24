package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentUserCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toUserData
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.ID
import io.appwrite.Query
import io.appwrite.services.Account
import io.appwrite.services.Databases
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class UserRepository(
    internal val mvpDatabase: MVPDatabase,
    internal val account: Account,
    internal val database: Databases,
    private val currentUserDataSource: CurrentUserDataSource,
) : IUserRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override suspend fun login(email: String, password: String): Result<UserData> = runCatching {
        account.createEmailPasswordSession(email, password)
        val id = account.get().id
        currentUserDataSource.saveUserId(id)
        val currentUser = database.getDocument(
            DbConstants.DATABASE_NAME,
            DbConstants.USER_DATA_COLLECTION,
            id,
            nestedType = UserDataDTO::class
        ).data.copy(id = id).toUserData(id)
        mvpDatabase.getUserDataDao.upsertUserData(currentUser)

        return Result.success(currentUser)
    }

    override suspend fun logout(): Result<Unit> = kotlin.runCatching {
        currentUserDataSource.saveUserId("")
        account.deleteSession("current")
    }

    override fun getCurrentUserFlow(): Flow<Result<UserWithRelations>> {
        return currentUserDataSource.getUserId().flatMapLatest { userId ->
            if (userId.isBlank()) {
                singleResponse(networkCall = {
                    val fetchedUserId = account.get().id
                    currentUserDataSource.saveUserId(fetchedUserId)
                    database.getDocument(
                        DbConstants.DATABASE_NAME,
                        DbConstants.USER_DATA_COLLECTION,
                        fetchedUserId,
                        nestedType = UserDataDTO::class,
                    ).data.toUserData(fetchedUserId)
                }, saveCall = { userData ->
                    mvpDatabase.getUserDataDao.upsertUserWithRelations(userData)
                    currentUserDataSource.saveUserId(userData.id)
                }, onReturn = { data ->
                    data
                })
                flow {
                    emit(
                        Result.success(
                            mvpDatabase.getUserDataDao.getUserWithRelationsById(
                                userId
                            )
                        )
                    )
                }
            } else {
                mvpDatabase.getUserDataDao.getUserWithRelationsFlowById(userId)
                    .flatMapLatest { user ->
                        flow {
                            if (user != null) {
                                emit(Result.success(user))
                            } else {
                                currentUserDataSource.saveUserId("")
                                emit(Result.failure<UserWithRelations>(Exception("User id not found locally")))
                            }
                        }
                    }
            }
        }
    }

    override suspend fun getUsersOfTournament(tournamentId: String): Result<List<UserData>> =
        multiResponse(
            getRemoteData = {
                val docs = database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.USER_DATA_COLLECTION,
                    listOf(Query.contains(DbConstants.TOURNAMENTS_ATTRIBUTE, tournamentId)),
                    nestedType = UserDataDTO::class,
                )
                docs.documents.map { it.data.toUserData(it.id) }
            },
            saveData = { usersData ->
                mvpDatabase.getUserDataDao.upsertUsersData(usersData)
                mvpDatabase.getUserDataDao.upsertUserTournamentCrossRefs(usersData.map {
                    TournamentUserCrossRef(
                        it.id, tournamentId
                    )
                })
            },
            getLocalData = { mvpDatabase.getUserDataDao.getUsersInTournament(tournamentId) },
        )

    override suspend fun getUsersOfEvent(eventId: String): Result<List<UserData>> = multiResponse(
        getRemoteData = {
            val docs = database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                listOf(Query.contains(DbConstants.TOURNAMENTS_ATTRIBUTE, eventId)),
                nestedType = UserDataDTO::class,
            )
            docs.documents.map { it.data.toUserData(it.id) }
        },
        saveData = { usersData ->
            mvpDatabase.getUserDataDao.upsertUsersData(usersData)
        },
        getLocalData = { mvpDatabase.getUserDataDao.getUsersInTournament(eventId) },
    )

    override suspend fun getUsers(userIds: List<String>): Result<List<UserData>> =
        multiResponse(
            getRemoteData = {
                val docs = database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.USER_DATA_COLLECTION,
                    listOf(Query.equal("\$id", userIds)),
                    nestedType = UserDataDTO::class,
                )
                docs.documents.map { it.data.toUserData(it.id) }
            },
            saveData = { usersData ->
                mvpDatabase.getUserDataDao.upsertUsersData(usersData)
            },
            getLocalData = { mvpDatabase.getUserDataDao.getUserDatasById(userIds) },
        )


    override fun getUsersOfTournamentFlow(tournamentId: String): Flow<Result<List<UserData>>> {
        val localUsersFlow = mvpDatabase.getUserDataDao.getUsersInTournamentFlow(tournamentId)
            .map { Result.success(it) }

        scope.launch {
            getUsersOfTournament(tournamentId)
        }

        return localUsersFlow
    }

    override suspend fun searchPlayers(query: String): Result<List<UserData>> {
        TODO("Not yet implemented")
    }

    override fun getUsersOfEventFlow(eventId: String): Flow<Result<List<UserData>>> {
        val localUsersFlow =
            mvpDatabase.getUserDataDao.getUsersInEventFlow(eventId).map { Result.success(it) }

        scope.launch {
            getUsersOfTournament(eventId)
        }

        return localUsersFlow
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
        return singleResponse(networkCall = {
            database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                user.id,
                user,
                nestedType = UserDataDTO::class
            ).data.toUserData(user.id)
        }, saveCall = { newData ->
            mvpDatabase.getUserDataDao.upsertUserWithRelations(newData)
        }, onReturn = { data ->
            data
        })
    }

}