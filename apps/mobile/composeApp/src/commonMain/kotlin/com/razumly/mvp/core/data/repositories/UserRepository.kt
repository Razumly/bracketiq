package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
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
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

interface IUserRepository : IMVPRepository {
    val currentUser: StateFlow<Result<UserData>>
    suspend fun login(email: String, password: String): Result<UserData>
    suspend fun logout(): Result<Unit>
    suspend fun getUsersOfTournament(tournamentId: String): Result<List<UserData>>
    suspend fun getUsersOfEvent(eventId: String): Result<List<UserData>>
    suspend fun getUsers(userIds: List<String>): Result<List<UserData>>
    fun getUsersOfEventFlow(eventId: String): Flow<Result<List<UserData>>>
    fun getUsersOfTournamentFlow(tournamentId: String): Flow<Result<List<UserData>>>
    suspend fun searchPlayers(search: String): Result<List<UserData>>
    suspend fun createNewUser(
        email: String, password: String, firstName: String, lastName: String, userName: String
    ): Result<UserData>

    suspend fun updateUser(user: UserData): Result<UserData>
}

class UserRepository(
    internal val databaseService: DatabaseService,
    internal val account: Account,
    internal val database: Databases,
    private val currentUserDataSource: CurrentUserDataSource,
    private val pushNotificationsRepository: IPushNotificationsRepository
) : IUserRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _pushToken =
        currentUserDataSource.getPushToken().stateIn(scope, SharingStarted.Eagerly, "")
    private val _pushTarget =
        currentUserDataSource.getPushTarget().stateIn(scope, SharingStarted.Eagerly, "")

    private var _currentUser = MutableStateFlow(Result.failure<UserData>(Exception("No User")))
    override val currentUser: StateFlow<Result<UserData>> = _currentUser.asStateFlow()

    init {
        scope.launch { loadCurrentUser() }
    }

    override suspend fun login(email: String, password: String): Result<UserData> = runCatching {
        Napier.d("Logging in user: $email, $password")
        account.createEmailPasswordSession(email, password)
        val id = account.get().id
        currentUserDataSource.saveUserId(id)
        Napier.d("User logged in: $id")
        val currentUser = database.getDocument(
            DbConstants.DATABASE_NAME,
            DbConstants.USER_DATA_COLLECTION,
            id,
            nestedType = UserDataDTO::class
        ).data.copy(id = id).toUserData(id)
        Napier.d("User data: $currentUser")
        if (_pushToken.value.isNotBlank() && _pushTarget.value.isBlank()) {
            pushNotificationsRepository.addDeviceAsTarget()
        }
        databaseService.getUserDataDao.upsertUserData(currentUser)

        _currentUser.value = Result.success(currentUser)
        return Result.success(currentUser)
    }

    override suspend fun logout(): Result<Unit> = kotlin.runCatching {
        _currentUser.value = Result.failure(Exception("No User"))
        currentUserDataSource.saveUserId("")
        account.deleteSession("current")
        pushNotificationsRepository.removeDeviceAsTarget()
    }

    @Throws(Throwable::class)
    internal suspend fun loadCurrentUser() {
        val savedId = runCatching {
            currentUserDataSource.getUserId().first().takeIf(String::isNotBlank)
        }.getOrNull()

        val sessionId = runCatching {
            account.get().id
        }.getOrNull()

        if (sessionId.isNullOrBlank()) {
            return
        }

        if (!savedId.isNullOrBlank()) {
            val local = databaseService.getUserDataDao.getUserDataById(savedId)
            if (local == null) {
                _currentUser.value = Result.failure(Exception("No User"))
            } else {
                _currentUser.value = Result.success(local)
            }
        }

        val remoteRes = runCatching {
            database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                sessionId,
                nestedType = UserDataDTO::class
            ).data.toUserData(sessionId)
        }

        remoteRes.onFailure { err ->
            _currentUser.value = Result.failure(err)
        }.onSuccess { user ->
            databaseService.getUserDataDao.upsertUserData(user)
            currentUserDataSource.saveUserId(user.id)

            if (_pushToken.value.isNotBlank() && _pushTarget.value.isBlank()) {
                pushNotificationsRepository.addDeviceAsTarget()
            }

            val fresh = databaseService.getUserDataDao.getUserDataById(user.id)
            if (fresh == null) {
                _currentUser.value = Result.failure(Exception("No User"))
            } else {
                _currentUser.value = Result.success(fresh)
            }
        }
    }

    override suspend fun getUsersOfTournament(tournamentId: String): Result<List<UserData>> {
        val query = Query.contains(DbConstants.TOURNAMENTS_ATTRIBUTE, tournamentId)
        return getPlayers(query,
            getLocalData = { databaseService.getUserDataDao.getUsersInTournament(tournamentId) })
            .onSuccess { remoteData ->
                databaseService.getUserDataDao.upsertUserTournamentCrossRefs(remoteData.map {
                    TournamentUserCrossRef(it.id, tournamentId)
                })
            }
    }

    override suspend fun getUsersOfEvent(eventId: String): Result<List<UserData>> {
        val query = Query.contains(DbConstants.EVENTS_ATTRIBUTE, eventId)
        return getPlayers(query,
            getLocalData = { databaseService.getUserDataDao.getUsersInEvent(eventId) })
            .onSuccess { remoteData ->
                databaseService.getUserDataDao.upsertUserEventCrossRefs(remoteData.map {
                    EventUserCrossRef(it.id, eventId)
                })
            }
    }

    override suspend fun getUsers(userIds: List<String>): Result<List<UserData>> {
        val query = Query.equal("\$id", userIds)
        return getPlayers(query,
            getLocalData = { databaseService.getUserDataDao.getUserDatasById(userIds) })
    }

    override fun getUsersOfTournamentFlow(tournamentId: String): Flow<Result<List<UserData>>> {
        val localUsersFlow = databaseService.getUserDataDao.getUsersInTournamentFlow(tournamentId)
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
                listOf(query, Query.limit(500)),
                nestedType = UserDataDTO::class,
            )
            docs.documents.map { it.data.toUserData(it.id) }
        },
        saveData = { usersData ->
            databaseService.getUserDataDao.upsertUsersData(usersData)
        },
        getLocalData = getLocalData,
        deleteData = { databaseService.getUserDataDao.deleteUsersById(it) }
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
            databaseService.getUserDataDao.getUsersInEventFlow(eventId).map { Result.success(it) }

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
            databaseService.getUserDataDao.upsertUserWithRelations(newData)
        }, onReturn = { data ->
            data
        })
    }
}