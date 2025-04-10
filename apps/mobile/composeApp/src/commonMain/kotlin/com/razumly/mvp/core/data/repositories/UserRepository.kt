package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentUserCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toUserData
import com.razumly.mvp.core.data.dataTypes.toUserDataDTO
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.ID
import io.appwrite.Query
import io.appwrite.services.Account
import io.appwrite.services.Databases
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class UserRepository(
    internal val mvpDatabase: MVPDatabase,
    internal val account: Account,
    internal val database: Databases,
    private val currentUserDataSource: CurrentUserDataSource,
    private val pushNotificationsRepository: PushNotificationsRepository
) : IUserRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _pushToken = currentUserDataSource.getPushToken().stateIn(scope, SharingStarted.Eagerly, "")
    private val _pushTarget = currentUserDataSource.getPushTarget().stateIn(scope, SharingStarted.Eagerly, "")

    override val currentUser: StateFlow<UserData?> =
        getCurrentUserFlow().distinctUntilChanged().map { user ->
            user.getOrThrow()
        }.stateIn(
            scope, SharingStarted.Lazily, null
        )

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
        if (_pushToken.value.isNotBlank() && _pushTarget.value.isBlank()) {
            pushNotificationsRepository.addDeviceAsTarget()
        }
        mvpDatabase.getUserDataDao.upsertUserData(currentUser)

        return Result.success(currentUser)
    }

    override suspend fun logout(): Result<Unit> = kotlin.runCatching {
        currentUserDataSource.saveUserId("")
        account.deleteSession("current")
        pushNotificationsRepository.removeDeviceAsTarget()
    }

    private fun getCurrentUserFlow(): Flow<Result<UserData>> = flow {
        val userId = currentUserDataSource.getUserId().first() // Get the user ID only once

        val finalUserId = userId.ifBlank {
            val fetchedUserId = runCatching {
                account.get().id
            }.getOrElse {
                emit(Result.failure(Exception("Failed to fetch user ID", it)))
                return@flow
            }
            currentUserDataSource.saveUserId(fetchedUserId)
            fetchedUserId
        }

        if (_pushToken.value.isNotBlank() && _pushTarget.value.isBlank()) {
            pushNotificationsRepository.addDeviceAsTarget().onFailure {
                Napier.e("Failed to add device as target", it, "UserRepository")
            }
        }

        val userDataResult = singleResponse(networkCall = {
            database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                finalUserId,
                nestedType = UserDataDTO::class,
            ).data.toUserData(finalUserId)
        }, saveCall = { userData ->
            mvpDatabase.getUserDataDao.upsertUserData(userData)
            currentUserDataSource.saveUserId(userData.id)
        }, onReturn = { it })

        if (userDataResult.isFailure) {
            emit(Result.failure(userDataResult.exceptionOrNull()!!))
            return@flow
        }

        // Always return the Room flow to ensure it updates with new data
        emitAll(mvpDatabase.getUserDataDao.getUserFlowById(finalUserId).map { user ->
            if (user != null) {
                Napier.d("User found locally")
                Result.success(user)
            } else {
                currentUserDataSource.saveUserId("")
                Result.failure(Exception("User ID not found locally"))
            }
        })
    }

    override suspend fun getUsersOfTournament(tournamentId: String): Result<List<UserData>> {
        val query = Query.contains(DbConstants.TOURNAMENTS_ATTRIBUTE, tournamentId)
        return getPlayers(query,
            getLocalData = { mvpDatabase.getUserDataDao.getUsersInTournament(tournamentId) })
            .onSuccess { remoteData ->
                mvpDatabase.getUserDataDao.upsertUserTournamentCrossRefs(remoteData.map {
                    TournamentUserCrossRef(it.id, tournamentId)
                })
            }
            }

    override suspend fun getUsersOfEvent(eventId: String): Result<List<UserData>> {
        val query = Query.contains(DbConstants.EVENTS_ATTRIBUTE, eventId)
        return getPlayers(query,
            getLocalData = { mvpDatabase.getUserDataDao.getUsersInEvent(eventId) })
            .onSuccess { remoteData ->
                mvpDatabase.getUserDataDao.upsertUserEventCrossRefs(remoteData.map {
                    EventUserCrossRef(it.id, eventId)
                })
            }
    }

    override suspend fun getUsers(userIds: List<String>): Result<List<UserData>> {
        val query = Query.equal("\$id", userIds)
        return getPlayers(query,
            getLocalData = { mvpDatabase.getUserDataDao.getUserDatasById(userIds) })
    }

    override fun getUsersOfTournamentFlow(tournamentId: String): Flow<Result<List<UserData>>> {
        val localUsersFlow = mvpDatabase.getUserDataDao.getUsersInTournamentFlow(tournamentId)
            .map { Result.success(it) }

        scope.launch {
            getUsersOfTournament(tournamentId)
        }

        return localUsersFlow
    }

    private suspend fun getPlayers(
        query: String, getLocalData: suspend () -> List<UserData>
    ): Result<List<UserData>> = multiResponse(
        getRemoteData = {
            val docs = database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                listOf(query),
                nestedType = UserDataDTO::class,
            )
            docs.documents.map { it.data.toUserData(it.id) }
        },
        saveData = { usersData ->
            mvpDatabase.getUserDataDao.upsertUsersData(usersData)
        },
        getLocalData = getLocalData,
        deleteData = { mvpDatabase.getUserDataDao.deleteUsersById(it) }
    )

    override suspend fun searchPlayers(search: String): Result<List<UserData>> {
        val query = Query.or(
            listOf(
                Query.contains("firstName", search),
                Query.contains("lastName", search),
                Query.contains("userName", search)
            )
        )
        return getPlayers(query, getLocalData = { emptyList() })
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
                user.toUserDataDTO(),
                nestedType = UserDataDTO::class
            ).data.toUserData(user.id)
        }, saveCall = { newData ->
            mvpDatabase.getUserDataDao.upsertUserWithRelations(newData)
        }, onReturn = { data ->
            data
        })
    }

}