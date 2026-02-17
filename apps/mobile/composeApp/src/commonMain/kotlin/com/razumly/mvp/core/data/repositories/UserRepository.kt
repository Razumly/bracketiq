package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.AuthResponseDto
import com.razumly.mvp.core.network.dto.EnsureUserByEmailRequestDto
import com.razumly.mvp.core.network.dto.GoogleMobileLoginRequestDto
import com.razumly.mvp.core.network.dto.LoginRequestDto
import com.razumly.mvp.core.network.dto.OkResponseDto
import com.razumly.mvp.core.network.dto.PasswordRequestDto
import com.razumly.mvp.core.network.dto.RegisterRequestDto
import com.razumly.mvp.core.network.dto.UpdateUserRequestDto
import com.razumly.mvp.core.network.dto.UserResponseDto
import com.razumly.mvp.core.network.dto.UserUpdateDto
import com.razumly.mvp.core.network.dto.UsersResponseDto
import com.razumly.mvp.core.network.dto.toAuthAccountOrNull
import com.razumly.mvp.core.network.dto.toUserDataOrNull
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

data class FamilyChild(
    val userId: String,
    val firstName: String,
    val lastName: String,
    val dateOfBirth: String? = null,
    val age: Int? = null,
    val linkStatus: String? = null,
    val relationship: String? = null,
    val email: String? = null,
    val hasEmail: Boolean? = null,
)

interface IUserRepository : IMVPRepository {
    val currentUser: StateFlow<Result<UserData>>
    val currentAccount: StateFlow<Result<AuthAccount>>

    suspend fun login(email: String, password: String): Result<UserData>
    suspend fun logout(): Result<Unit>

    suspend fun getUsers(userIds: List<String>): Result<List<UserData>>
    fun getUsersFlow(userIds: List<String>): Flow<Result<List<UserData>>>

    suspend fun searchPlayers(search: String): Result<List<UserData>>

    /**
     * Server-side only behavior: ensures a public user profile exists for the given email.
     * Used for invite flows where we only have an email address.
     *
     * The returned [UserData] must not contain sensitive information (email/password/etc).
     */
    suspend fun ensureUserByEmail(email: String): Result<UserData>
    suspend fun listChildren(): Result<List<FamilyChild>>
    suspend fun createChildAccount(
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String? = null,
        relationship: String? = null,
    ): Result<Unit>

    suspend fun updateChildAccount(
        childUserId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String? = null,
        relationship: String? = null,
    ): Result<Unit>

    suspend fun linkChildToParent(
        childEmail: String? = null,
        childUserId: String? = null,
        relationship: String? = null,
    ): Result<Unit>

    suspend fun createNewUser(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        userName: String,
        dateOfBirth: String? = null,
    ): Result<UserData>

    suspend fun updateUser(user: UserData): Result<UserData>

    suspend fun updateEmail(email: String, password: String): Result<Unit>

    suspend fun updatePassword(currentPassword: String, newPassword: String): Result<Unit>

    suspend fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        currentPassword: String,
        newPassword: String,
        userName: String,
    ): Result<Unit>

    suspend fun getCurrentAccount(): Result<Unit>

    suspend fun sendFriendRequest(user: UserData): Result<Unit>
    suspend fun acceptFriendRequest(user: UserData): Result<Unit>
    suspend fun declineFriendRequest(userId: String): Result<Unit>
    suspend fun followUser(userId: String): Result<Unit>
    suspend fun unfollowUser(userId: String): Result<Unit>
    suspend fun removeFriend(userId: String): Result<Unit>
}

class UserRepository(
    internal val databaseService: DatabaseService,
    private val api: MvpApiClient,
    private val tokenStore: AuthTokenStore,
    private val currentUserDataSource: CurrentUserDataSource,
) : IUserRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _currentUser = MutableStateFlow(Result.failure<UserData>(Exception("No User")))
    override val currentUser: StateFlow<Result<UserData>> = _currentUser.asStateFlow()

    private val _currentAccount = MutableStateFlow(Result.failure<AuthAccount>(Exception("No Account")))
    override val currentAccount: StateFlow<Result<AuthAccount>> = _currentAccount.asStateFlow()

    init {
        scope.launch { runCatching { loadCurrentUser() }.onFailure { Napier.w("loadCurrentUser failed", it) } }
    }

    override suspend fun login(email: String, password: String): Result<UserData> = runCatching {
        val res = api.post<LoginRequestDto, AuthResponseDto>(
            path = "api/auth/login",
            body = LoginRequestDto(email = email, password = password),
        )

        val token = res.token?.takeIf(String::isNotBlank)
            ?: error("Login response missing token")
        tokenStore.set(token)

        val account = res.user?.toAuthAccountOrNull()
            ?: error("Login response missing user")
        _currentAccount.value = Result.success(account)

        val profile = res.profile?.toUserDataOrNull() ?: fetchUserProfile(account.id)
            ?: error("Login response missing profile")

        databaseService.getUserDataDao.upsertUserData(profile)
        currentUserDataSource.saveUserId(profile.id)
        _currentUser.value = Result.success(profile)
        profile
    }

    suspend fun loginWithGoogleIdToken(idToken: String): Result<UserData> = runCatching {
        val res = api.post<GoogleMobileLoginRequestDto, AuthResponseDto>(
            path = "api/auth/google/mobile",
            body = GoogleMobileLoginRequestDto(idToken = idToken),
        )

        val token = res.token?.takeIf(String::isNotBlank)
            ?: error("Google login response missing token")
        tokenStore.set(token)

        val account = res.user?.toAuthAccountOrNull()
            ?: error("Google login response missing user")
        _currentAccount.value = Result.success(account)

        val profile = res.profile?.toUserDataOrNull() ?: fetchUserProfile(account.id)
            ?: error("Google login response missing profile")

        databaseService.getUserDataDao.upsertUserData(profile)
        currentUserDataSource.saveUserId(profile.id)
        _currentUser.value = Result.success(profile)
        profile
    }

    override suspend fun createNewUser(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        userName: String,
        dateOfBirth: String?,
    ): Result<UserData> = runCatching {
        val res = api.post<RegisterRequestDto, AuthResponseDto>(
            path = "api/auth/register",
            body = RegisterRequestDto(
                email = email,
                password = password,
                name = userName,
                firstName = firstName,
                lastName = lastName,
                userName = userName,
                dateOfBirth = dateOfBirth,
            ),
        )

        val token = res.token?.takeIf(String::isNotBlank)
            ?: error("Register response missing token")
        tokenStore.set(token)

        val account = res.user?.toAuthAccountOrNull()
            ?: error("Register response missing user")
        _currentAccount.value = Result.success(account)

        val profile = res.profile?.toUserDataOrNull()
            ?: error("Register response missing profile")

        databaseService.getUserDataDao.upsertUserData(profile)
        currentUserDataSource.saveUserId(profile.id)
        _currentUser.value = Result.success(profile)
        profile
    }

    override suspend fun logout(): Result<Unit> = runCatching {
        runCatching { api.postNoResponse("api/auth/logout") }

        tokenStore.clear()
        currentUserDataSource.saveUserId("")

        _currentUser.value = Result.failure(Exception("No User"))
        _currentAccount.value = Result.failure(Exception("No Account"))
    }

    override suspend fun getCurrentAccount(): Result<Unit> = runCatching {
        loadCurrentUser()
    }

    private suspend fun loadCurrentUser() {
        val token = tokenStore.get().takeIf(String::isNotBlank) ?: return

        // If we have a stored user id, surface cached data quickly while validating token.
        val savedId = runCatching {
            currentUserDataSource.getUserId().first().takeIf(String::isNotBlank)
        }.getOrNull()

        if (!savedId.isNullOrBlank()) {
            val local = databaseService.getUserDataDao.getUserDataById(savedId)
            if (local != null) {
                _currentUser.value = Result.success(local)
            }
        }

        val me = api.get<AuthResponseDto>("api/auth/me")
        val account = me.user?.toAuthAccountOrNull()
        if (account == null) {
            clearLoginState()
            return
        }

        _currentAccount.value = Result.success(account)

        val refreshed = me.token?.takeIf(String::isNotBlank)
        if (!refreshed.isNullOrBlank() && refreshed != token) {
            tokenStore.set(refreshed)
        }

        val remoteProfile = me.profile?.toUserDataOrNull() ?: fetchUserProfile(account.id)
        if (remoteProfile != null) {
            databaseService.getUserDataDao.upsertUserData(remoteProfile)
            currentUserDataSource.saveUserId(remoteProfile.id)
            _currentUser.value = Result.success(remoteProfile)
        }
    }

    private suspend fun clearLoginState() {
        runCatching { tokenStore.clear() }
        runCatching { currentUserDataSource.saveUserId("") }
        _currentUser.value = Result.failure(Exception("No User"))
        _currentAccount.value = Result.failure(Exception("No Account"))
    }

    private suspend fun fetchUserProfile(userId: String): UserData? {
        return runCatching {
            val res = api.get<UserResponseDto>("api/users/$userId")
            res.user?.toUserDataOrNull()
        }.getOrNull()
    }

    override suspend fun searchPlayers(search: String): Result<List<UserData>> = runCatching {
        val query = search.trim()
        if (query.isBlank()) return@runCatching emptyList()
        val encoded = query.encodeURLQueryComponent()
        val res = api.get<UsersResponseDto>("api/users?query=$encoded")
        res.users.mapNotNull { it.toUserDataOrNull() }
    }

    override suspend fun ensureUserByEmail(email: String): Result<UserData> = runCatching {
        val normalized = email.trim().lowercase()
        if (normalized.isBlank()) error("Email is required")

        val res = api.post<EnsureUserByEmailRequestDto, UserResponseDto>(
            path = "api/users/ensure",
            body = EnsureUserByEmailRequestDto(email = normalized),
        )

        val user = res.user?.toUserDataOrNull() ?: error("Ensure user response missing user")
        databaseService.getUserDataDao.upsertUserData(user)
        user
    }

    override suspend fun listChildren(): Result<List<FamilyChild>> = runCatching {
        val response = api.get<FamilyChildrenResponseDto>(path = "api/family/children")
        response.error?.takeIf(String::isNotBlank)?.let { error(it) }
        response.children.mapNotNull { it.toFamilyChildOrNull() }
    }

    override suspend fun createChildAccount(
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String?,
    ): Result<Unit> = runCatching {
        val normalizedFirstName = firstName.trim()
        val normalizedLastName = lastName.trim()
        val normalizedDateOfBirth = dateOfBirth.trim()

        if (normalizedFirstName.isBlank() || normalizedLastName.isBlank() || normalizedDateOfBirth.isBlank()) {
            error("First name, last name, and date of birth are required.")
        }

        val response = api.post<CreateChildAccountRequestDto, FamilyActionResponseDto>(
            path = "api/family/children",
            body = CreateChildAccountRequestDto(
                firstName = normalizedFirstName,
                lastName = normalizedLastName,
                email = email?.trim()?.takeIf(String::isNotBlank),
                dateOfBirth = normalizedDateOfBirth,
                relationship = relationship?.trim()?.takeIf(String::isNotBlank),
            ),
        )
        response.error?.takeIf(String::isNotBlank)?.let { error(it) }
    }

    override suspend fun updateChildAccount(
        childUserId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String?,
    ): Result<Unit> = runCatching {
        val normalizedChildUserId = childUserId.trim()
        val normalizedFirstName = firstName.trim()
        val normalizedLastName = lastName.trim()
        val normalizedDateOfBirth = dateOfBirth.trim()

        if (
            normalizedChildUserId.isBlank() ||
            normalizedFirstName.isBlank() ||
            normalizedLastName.isBlank() ||
            normalizedDateOfBirth.isBlank()
        ) {
            error("Child user ID, first name, last name, and date of birth are required.")
        }

        val response = api.patch<UpdateChildAccountRequestDto, FamilyActionResponseDto>(
            path = "api/family/children/${normalizedChildUserId.encodeURLQueryComponent()}",
            body = UpdateChildAccountRequestDto(
                firstName = normalizedFirstName,
                lastName = normalizedLastName,
                email = email?.trim()?.takeIf(String::isNotBlank),
                dateOfBirth = normalizedDateOfBirth,
                relationship = relationship?.trim()?.takeIf(String::isNotBlank),
            ),
        )
        response.error?.takeIf(String::isNotBlank)?.let { error(it) }
    }

    override suspend fun linkChildToParent(
        childEmail: String?,
        childUserId: String?,
        relationship: String?,
    ): Result<Unit> = runCatching {
        val normalizedChildEmail = childEmail?.trim()?.lowercase()?.takeIf(String::isNotBlank)
        val normalizedChildUserId = childUserId?.trim()?.takeIf(String::isNotBlank)
        if (normalizedChildEmail == null && normalizedChildUserId == null) {
            error("Provide a child email or user ID.")
        }

        val response = api.post<LinkChildToParentRequestDto, FamilyActionResponseDto>(
            path = "api/family/links",
            body = LinkChildToParentRequestDto(
                childEmail = normalizedChildEmail,
                childUserId = normalizedChildUserId,
                relationship = relationship?.trim()?.takeIf(String::isNotBlank),
            ),
        )
        response.error?.takeIf(String::isNotBlank)?.let { error(it) }
    }

    override suspend fun getUsers(userIds: List<String>): Result<List<UserData>> {
        val ids = userIds.distinct().filter(String::isNotBlank)
        if (ids.isEmpty()) return Result.success(emptyList())

        return multiResponse(
            getRemoteData = {
                ids.mapNotNull { fetchUserProfile(it) }
            },
            getLocalData = { databaseService.getUserDataDao.getUserDatasById(ids) },
            saveData = { usersData -> databaseService.getUserDataDao.upsertUsersData(usersData) },
            deleteData = { databaseService.getUserDataDao.deleteUsersById(it) },
        )
    }

    override fun getUsersFlow(userIds: List<String>): Flow<Result<List<UserData>>> {
        val ids = userIds.distinct().filter(String::isNotBlank)
        val localUsersFlow = databaseService.getUserDataDao.getUserDatasByIdFlow(ids)
            .map { Result.success(it) }

        scope.launch {
            getUsers(ids)
        }

        return localUsersFlow
    }

    override suspend fun updateUser(user: UserData): Result<UserData> = runCatching {
        val currentId = currentUser.value.getOrNull()?.id
            ?: currentAccount.value.getOrNull()?.id
            ?: error("No user")

        if (user.id != currentId) {
            error("Forbidden")
        }

        val request = UpdateUserRequestDto(
            data = UserUpdateDto(
                firstName = user.firstName,
                lastName = user.lastName,
                userName = user.userName,
                teamIds = user.teamIds,
                friendIds = user.friendIds,
                friendRequestIds = user.friendRequestIds,
                friendRequestSentIds = user.friendRequestSentIds,
                followingIds = user.followingIds,
                hasStripeAccount = user.hasStripeAccount,
                uploadedImages = user.uploadedImages,
                profileImageId = user.profileImageId,
            )
        )

        val res = api.patch<UpdateUserRequestDto, UserResponseDto>(
            path = "api/users/${user.id}",
            body = request,
        )

        val responseUser = res.user
        val updated = responseUser?.toUserDataOrNull()?.copy(
            firstName = responseUser.firstName ?: user.firstName,
            lastName = responseUser.lastName ?: user.lastName,
            userName = responseUser.userName ?: user.userName,
            teamIds = responseUser.teamIds ?: user.teamIds,
            friendIds = responseUser.friendIds ?: user.friendIds,
            friendRequestIds = responseUser.friendRequestIds ?: user.friendRequestIds,
            friendRequestSentIds = responseUser.friendRequestSentIds ?: user.friendRequestSentIds,
            followingIds = responseUser.followingIds ?: user.followingIds,
            hasStripeAccount = responseUser.hasStripeAccount ?: user.hasStripeAccount,
            uploadedImages = responseUser.uploadedImages ?: user.uploadedImages,
            profileImageId = responseUser.profileImageId ?: user.profileImageId,
        ) ?: user
        databaseService.getUserDataDao.upsertUserWithRelations(updated)

        // Update current user state.
        _currentUser.value = Result.success(updated)
        updated
    }

    override suspend fun updateEmail(email: String, password: String): Result<Unit> {
        return Result.failure(NotImplementedError("Email update is not supported by the Next.js API yet."))
    }

    override suspend fun updatePassword(currentPassword: String, newPassword: String): Result<Unit> = runCatching {
        api.post<PasswordRequestDto, OkResponseDto>(
            path = "api/auth/password",
            body = PasswordRequestDto(
                currentPassword = currentPassword,
                newPassword = newPassword,
            ),
        )

        // /api/auth/password does not return a token; refresh via /api/auth/me.
        loadCurrentUser()
    }

    override suspend fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        currentPassword: String,
        newPassword: String,
        userName: String,
    ): Result<Unit> = runCatching {
        val currentUserData = currentUser.value.getOrThrow()

        if (newPassword.isNotBlank()) {
            if (currentPassword.isBlank()) error("Current password is required")
            updatePassword(currentPassword, newPassword).getOrThrow()
        }

        val updatedUser = currentUserData.copy(
            firstName = firstName,
            lastName = lastName,
            userName = userName,
        )

        updateUser(updatedUser).getOrThrow()

        // TODO(server): add an email update endpoint. For now, ignore email changes.
        if (email != currentAccount.value.getOrNull()?.email) {
            Napier.w("Email update requested but not supported by API yet")
        }
    }

    override suspend fun sendFriendRequest(user: UserData): Result<Unit> {
        return Result.failure(NotImplementedError("Friend requests are not implemented in the Next.js API yet."))
    }

    override suspend fun acceptFriendRequest(user: UserData): Result<Unit> {
        return Result.failure(NotImplementedError("Friend requests are not implemented in the Next.js API yet."))
    }

    override suspend fun declineFriendRequest(userId: String): Result<Unit> {
        return Result.failure(NotImplementedError("Friend requests are not implemented in the Next.js API yet."))
    }

    override suspend fun followUser(userId: String): Result<Unit> {
        return Result.failure(NotImplementedError("Following is not implemented in the Next.js API yet."))
    }

    override suspend fun unfollowUser(userId: String): Result<Unit> {
        return Result.failure(NotImplementedError("Following is not implemented in the Next.js API yet."))
    }

    override suspend fun removeFriend(userId: String): Result<Unit> {
        return Result.failure(NotImplementedError("Friend management is not implemented in the Next.js API yet."))
    }
}

@Serializable
private data class FamilyChildrenResponseDto(
    val children: List<FamilyChildDto> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class FamilyChildDto(
    val userId: String? = null,
    @SerialName("\$id") val legacyUserId: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val dateOfBirth: String? = null,
    val age: Int? = null,
    val linkStatus: String? = null,
    val relationship: String? = null,
    val email: String? = null,
    val hasEmail: Boolean? = null,
) {
    fun toFamilyChildOrNull(): FamilyChild? {
        val resolvedUserId = userId ?: legacyUserId
        if (resolvedUserId.isNullOrBlank()) return null

        return FamilyChild(
            userId = resolvedUserId,
            firstName = firstName.orEmpty(),
            lastName = lastName.orEmpty(),
            dateOfBirth = dateOfBirth,
            age = age,
            linkStatus = linkStatus,
            relationship = relationship,
            email = email,
            hasEmail = hasEmail,
        )
    }
}

@Serializable
private data class CreateChildAccountRequestDto(
    val firstName: String,
    val lastName: String,
    val email: String? = null,
    val dateOfBirth: String,
    val relationship: String? = null,
)

@Serializable
private data class UpdateChildAccountRequestDto(
    val firstName: String,
    val lastName: String,
    val email: String? = null,
    val dateOfBirth: String,
    val relationship: String? = null,
)

@Serializable
private data class LinkChildToParentRequestDto(
    val childEmail: String? = null,
    val childUserId: String? = null,
    val relationship: String? = null,
)

@Serializable
private data class FamilyActionResponseDto(
    val error: String? = null,
)
