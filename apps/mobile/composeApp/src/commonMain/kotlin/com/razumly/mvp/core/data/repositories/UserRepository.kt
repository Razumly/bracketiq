package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.AuthResponseDto
import com.razumly.mvp.core.network.dto.EnsureUserByEmailRequestDto
import com.razumly.mvp.core.network.dto.GoogleMobileLoginRequestDto
import com.razumly.mvp.core.network.dto.LoginRequestDto
import com.razumly.mvp.core.network.dto.OkResponseDto
import com.razumly.mvp.core.network.dto.PasswordRequestDto
import com.razumly.mvp.core.network.dto.RegisterConflictResponseDto
import com.razumly.mvp.core.network.dto.RegisterProfileSelectionDto
import com.razumly.mvp.core.network.dto.RegisterProfileSnapshotDto
import com.razumly.mvp.core.network.dto.RegisterRequestDto
import com.razumly.mvp.core.network.dto.UpdateUserRequestDto
import com.razumly.mvp.core.network.dto.UserResponseDto
import com.razumly.mvp.core.network.dto.UserProfileDto
import com.razumly.mvp.core.network.dto.UserUpdateDto
import com.razumly.mvp.core.network.dto.UsersResponseDto
import com.razumly.mvp.core.network.dto.toAuthAccountOrNull
import com.razumly.mvp.core.network.dto.toUserDataOrNull
import com.razumly.mvp.core.util.jsonMVP
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
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlin.time.Clock

private const val USER_REPOSITORY_LOG_TAG = "UserRepository"

data class FamilyChild(
    val userId: String,
    val firstName: String,
    val lastName: String,
    val userName: String? = null,
    val dateOfBirth: String? = null,
    val age: Int? = null,
    val linkStatus: String? = null,
    val relationship: String? = null,
    val email: String? = null,
    val hasEmail: Boolean? = null,
)

data class FamilyJoinRequest(
    val registrationId: String,
    val eventId: String,
    val eventName: String? = null,
    val eventStart: String? = null,
    val childUserId: String,
    val childFirstName: String? = null,
    val childLastName: String? = null,
    val childFullName: String? = null,
    val childDateOfBirth: String? = null,
    val childEmail: String? = null,
    val childHasEmail: Boolean = false,
    val consentStatus: String? = null,
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
    val requestedAt: String? = null,
    val updatedAt: String? = null,
)

enum class FamilyJoinRequestAction(val apiValue: String) {
    APPROVE("approve"),
    DECLINE("decline"),
}

data class FamilyJoinRequestResolution(
    val action: String? = null,
    val registrationStatus: String? = null,
    val consentStatus: String? = null,
    val childEmail: String? = null,
    val requiresChildEmail: Boolean = false,
    val warnings: List<String> = emptyList(),
)

enum class SignupProfileField(
    val apiName: String,
    val label: String,
) {
    FIRST_NAME(apiName = "firstName", label = "First Name"),
    LAST_NAME(apiName = "lastName", label = "Last Name"),
    USER_NAME(apiName = "userName", label = "Username"),
    DATE_OF_BIRTH(apiName = "dateOfBirth", label = "Birthday"),
    ;

    companion object {
        fun fromApiName(value: String): SignupProfileField? = entries.firstOrNull { it.apiName == value }
    }
}

data class SignupProfileSnapshot(
    val firstName: String? = null,
    val lastName: String? = null,
    val userName: String? = null,
    val dateOfBirth: String? = null,
) {
    fun valueFor(field: SignupProfileField): String? = when (field) {
        SignupProfileField.FIRST_NAME -> firstName
        SignupProfileField.LAST_NAME -> lastName
        SignupProfileField.USER_NAME -> userName
        SignupProfileField.DATE_OF_BIRTH -> dateOfBirth
    }
}

data class SignupProfileSelection(
    val firstName: String? = null,
    val lastName: String? = null,
    val userName: String? = null,
    val dateOfBirth: String? = null,
)

data class SignupProfileConflict(
    val fields: Set<SignupProfileField>,
    val existing: SignupProfileSnapshot,
    val incoming: SignupProfileSnapshot,
)

class SignupProfileConflictException(
    val conflict: SignupProfileConflict,
) : Exception(
    buildString {
        append("Signup profile conflict. Selection required for: ")
        append(conflict.fields.joinToString { it.apiName })
    },
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
    suspend fun isCurrentUserChild(minorAgeThreshold: Int = 18): Result<Boolean>
    suspend fun listChildren(): Result<List<FamilyChild>>
    suspend fun listPendingChildJoinRequests(): Result<List<FamilyJoinRequest>>
    suspend fun resolveChildJoinRequest(
        registrationId: String,
        action: FamilyJoinRequestAction,
    ): Result<FamilyJoinRequestResolution>
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
        profileSelection: SignupProfileSelection? = null,
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
        Napier.d(tag = USER_REPOSITORY_LOG_TAG) { "Email login started for ${maskEmail(email)}" }
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

        cacheCurrentUserProfile(profile)
        Napier.i(tag = USER_REPOSITORY_LOG_TAG) { "Email login succeeded for userId=${profile.id}" }
        profile
    }.onFailure { throwable ->
        Napier.e(tag = USER_REPOSITORY_LOG_TAG, throwable = throwable) {
            "Email login failed for ${maskEmail(email)}: ${throwable.message}"
        }
    }

    suspend fun loginWithGoogleIdToken(idToken: String): Result<UserData> = runCatching {
        Napier.d(tag = USER_REPOSITORY_LOG_TAG) { "Google login started" }
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

        cacheCurrentUserProfile(profile)
        Napier.i(tag = USER_REPOSITORY_LOG_TAG) { "Google login succeeded for userId=${profile.id}" }
        profile
    }.onFailure { throwable ->
        Napier.e(tag = USER_REPOSITORY_LOG_TAG, throwable = throwable) {
            "Google login failed: ${throwable.message}"
        }
    }

    override suspend fun createNewUser(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        userName: String,
        dateOfBirth: String?,
        profileSelection: SignupProfileSelection?,
    ): Result<UserData> = runCatching {
        Napier.d(tag = USER_REPOSITORY_LOG_TAG) { "Signup started for ${maskEmail(email)}" }
        val res = try {
            api.post<RegisterRequestDto, AuthResponseDto>(
                path = "api/auth/register",
                body = RegisterRequestDto(
                    email = email,
                    password = password,
                    name = userName,
                    firstName = firstName,
                    lastName = lastName,
                    userName = userName,
                    dateOfBirth = dateOfBirth,
                    enforceProfileConflictSelection = true,
                    profileSelection = profileSelection?.toDto(),
                ),
            )
        } catch (apiException: ApiException) {
            val conflict = apiException.toSignupConflictOrNull()
            if (conflict != null) throw SignupProfileConflictException(conflict)
            throw apiException
        }

        val token = res.token?.takeIf(String::isNotBlank)
            ?: error("Register response missing token")
        tokenStore.set(token)

        val account = res.user?.toAuthAccountOrNull()
            ?: error("Register response missing user")
        _currentAccount.value = Result.success(account)

        val profile = res.profile?.toUserDataOrNull()
            ?: error("Register response missing profile")

        cacheCurrentUserProfile(profile)
        Napier.i(tag = USER_REPOSITORY_LOG_TAG) { "Signup succeeded for userId=${profile.id}" }
        profile
    }.onFailure { throwable ->
        Napier.e(tag = USER_REPOSITORY_LOG_TAG, throwable = throwable) {
            "Signup failed for ${maskEmail(email)}: ${throwable.message}"
        }
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
            val local = runCatching {
                databaseService.getUserDataDao.getUserDataById(savedId)
            }.onFailure { throwable ->
                Napier.e(tag = USER_REPOSITORY_LOG_TAG, throwable = throwable) {
                    "Failed reading local cached user for id=$savedId"
                }
            }.getOrNull()
            if (local != null) _currentUser.value = Result.success(local)
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
            cacheCurrentUserProfile(remoteProfile)
        }
    }

    private suspend fun cacheCurrentUserProfile(profile: UserData) {
        runCatching {
            databaseService.getUserDataDao.upsertUserData(profile)
            currentUserDataSource.saveUserId(profile.id)
        }.onFailure { throwable ->
            Napier.e(tag = USER_REPOSITORY_LOG_TAG, throwable = throwable) {
                "Failed caching user profile locally for userId=${profile.id}"
            }
        }
        _currentUser.value = Result.success(profile)
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

    private suspend fun fetchUsersByIds(userIds: List<String>): List<UserData> {
        if (userIds.isEmpty()) return emptyList()

        val orderedIds = userIds.distinct().filter(String::isNotBlank)
        if (orderedIds.isEmpty()) return emptyList()

        val byId = LinkedHashMap<String, UserData>()
        orderedIds.chunked(100).forEach { chunk ->
            val encodedIds = chunk.joinToString(",") { it.encodeURLQueryComponent() }
            val response = api.get<UsersResponseDto>("api/users?ids=$encodedIds")
            response.users.mapNotNull { it.toUserDataOrNull() }.forEach { user ->
                byId[user.id] = user
            }
        }

        return orderedIds.mapNotNull { byId[it] }
    }

    private fun maskEmail(email: String): String {
        val atIndex = email.indexOf('@')
        if (atIndex <= 1) return "***"
        return "${email.first()}***${email.substring(atIndex)}"
    }

    private fun ApiException.toSignupConflictOrNull(): SignupProfileConflict? {
        if (statusCode != 409 || responseBody.isNullOrBlank()) return null
        val body = responseBody ?: return null
        val payload = runCatching {
            jsonMVP.decodeFromString<RegisterConflictResponseDto>(body)
        }.getOrNull() ?: return null

        val conflictDto = payload.conflict ?: return null
        val existing = conflictDto.existing.toSignupProfileSnapshot()
        val incoming = conflictDto.incoming.toSignupProfileSnapshot()

        val parsedFields = conflictDto.fields.mapNotNull(SignupProfileField::fromApiName).toSet()
        val fields = if (parsedFields.isNotEmpty()) parsedFields else inferDifferingFields(existing, incoming)
        if (fields.isEmpty()) return null

        return SignupProfileConflict(
            fields = fields,
            existing = existing,
            incoming = incoming,
        )
    }

    private fun inferDifferingFields(
        existing: SignupProfileSnapshot,
        incoming: SignupProfileSnapshot,
    ): Set<SignupProfileField> {
        return SignupProfileField.entries
            .filter { field -> existing.valueFor(field) != incoming.valueFor(field) }
            .toSet()
    }

    private fun RegisterProfileSnapshotDto?.toSignupProfileSnapshot(): SignupProfileSnapshot {
        return SignupProfileSnapshot(
            firstName = this?.firstName?.trim()?.takeIf(String::isNotBlank),
            lastName = this?.lastName?.trim()?.takeIf(String::isNotBlank),
            userName = this?.userName?.trim()?.takeIf(String::isNotBlank),
            dateOfBirth = normalizeDateOnly(this?.dateOfBirth),
        )
    }

    private fun SignupProfileSelection.toDto(): RegisterProfileSelectionDto {
        return RegisterProfileSelectionDto(
            firstName = firstName?.trim()?.takeIf(String::isNotBlank),
            lastName = lastName?.trim()?.takeIf(String::isNotBlank),
            userName = userName?.trim()?.takeIf(String::isNotBlank),
            dateOfBirth = normalizeDateOnly(dateOfBirth),
        )
    }

    private fun normalizeDateOnly(value: String?): String? {
        val trimmed = value?.trim()?.takeIf(String::isNotBlank) ?: return null
        return trimmed.substringBefore('T')
    }

    private fun isMinorDateOfBirth(dateOfBirth: String, ageThreshold: Int): Boolean {
        val normalizedDatePart = dateOfBirth.substringBefore('T').trim()
        val birthDate = runCatching { LocalDate.parse(normalizedDatePart) }.getOrNull() ?: return false
        val today = Clock.System.now().toLocalDateTime(TimeZone.UTC).date

        var age = today.year - birthDate.year
        if (today.monthNumber < birthDate.monthNumber ||
            (today.monthNumber == birthDate.monthNumber && today.dayOfMonth < birthDate.dayOfMonth)
        ) {
            age -= 1
        }

        return age in 0 until ageThreshold
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

    override suspend fun isCurrentUserChild(minorAgeThreshold: Int): Result<Boolean> = runCatching {
        val currentUserId = currentUser.value.getOrNull()?.id?.trim()
            ?.takeIf(String::isNotBlank)
            ?: return@runCatching false

        val response = api.get<UserResponseDto>("api/users/${currentUserId.encodeURLQueryComponent()}")
        val dateOfBirth = response.user?.dateOfBirth?.trim()?.takeIf(String::isNotBlank)
            ?: return@runCatching false

        isMinorDateOfBirth(dateOfBirth = dateOfBirth, ageThreshold = minorAgeThreshold)
    }

    override suspend fun listChildren(): Result<List<FamilyChild>> = runCatching {
        val response = api.get<FamilyChildrenResponseDto>(path = "api/family/children")
        response.error?.takeIf(String::isNotBlank)?.let { error(it) }
        response.children.mapNotNull { it.toFamilyChildOrNull() }
    }

    override suspend fun listPendingChildJoinRequests(): Result<List<FamilyJoinRequest>> = runCatching {
        val response = api.get<FamilyJoinRequestsResponseDto>(path = "api/family/join-requests")
        response.error?.takeIf(String::isNotBlank)?.let { error(it) }
        response.requests.mapNotNull { it.toFamilyJoinRequestOrNull() }
    }

    override suspend fun resolveChildJoinRequest(
        registrationId: String,
        action: FamilyJoinRequestAction,
    ): Result<FamilyJoinRequestResolution> = runCatching {
        val normalizedRegistrationId = registrationId.trim()
        if (normalizedRegistrationId.isBlank()) {
            error("Registration id is required.")
        }

        val response = api.patch<JoinRequestActionRequestDto, JoinRequestActionResponseDto>(
            path = "api/family/join-requests/${normalizedRegistrationId.encodeURLQueryComponent()}",
            body = JoinRequestActionRequestDto(action = action.apiValue),
        )
        response.error?.takeIf(String::isNotBlank)?.let { error(it) }
        response.toResolution()
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
                fetchUsersByIds(ids)
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
        return runCatching {
            val targetUserId = user.id.trim()
            if (targetUserId.isBlank()) error("Target user id is required.")

            val response = api.post<SocialTargetRequestDto, UserResponseDto>(
                path = "api/users/social/friend-requests",
                body = SocialTargetRequestDto(targetUserId = targetUserId),
            )
            refreshCurrentUserFromSocialResponse(response.user)
        }
    }

    override suspend fun acceptFriendRequest(user: UserData): Result<Unit> {
        return runCatching {
            val requesterId = user.id.trim()
            if (requesterId.isBlank()) error("Requester id is required.")

            val response = api.post<SocialEmptyRequestDto, UserResponseDto>(
                path = "api/users/social/friend-requests/${requesterId.encodeURLQueryComponent()}/accept",
                body = SocialEmptyRequestDto(),
            )
            refreshCurrentUserFromSocialResponse(response.user)
        }
    }

    override suspend fun declineFriendRequest(userId: String): Result<Unit> {
        return runCatching {
            val requesterId = userId.trim()
            if (requesterId.isBlank()) error("Requester id is required.")

            val response = api.delete<SocialEmptyRequestDto, UserResponseDto>(
                path = "api/users/social/friend-requests/${requesterId.encodeURLQueryComponent()}",
                body = SocialEmptyRequestDto(),
            )
            refreshCurrentUserFromSocialResponse(response.user)
        }
    }

    override suspend fun followUser(userId: String): Result<Unit> {
        return runCatching {
            val targetUserId = userId.trim()
            if (targetUserId.isBlank()) error("Target user id is required.")

            val response = api.post<SocialTargetRequestDto, UserResponseDto>(
                path = "api/users/social/following",
                body = SocialTargetRequestDto(targetUserId = targetUserId),
            )
            refreshCurrentUserFromSocialResponse(response.user)
        }
    }

    override suspend fun unfollowUser(userId: String): Result<Unit> {
        return runCatching {
            val targetUserId = userId.trim()
            if (targetUserId.isBlank()) error("Target user id is required.")

            val response = api.delete<SocialEmptyRequestDto, UserResponseDto>(
                path = "api/users/social/following/${targetUserId.encodeURLQueryComponent()}",
                body = SocialEmptyRequestDto(),
            )
            refreshCurrentUserFromSocialResponse(response.user)
        }
    }

    override suspend fun removeFriend(userId: String): Result<Unit> {
        return runCatching {
            val friendUserId = userId.trim()
            if (friendUserId.isBlank()) error("Friend user id is required.")

            val response = api.delete<SocialEmptyRequestDto, UserResponseDto>(
                path = "api/users/social/friends/${friendUserId.encodeURLQueryComponent()}",
                body = SocialEmptyRequestDto(),
            )
            refreshCurrentUserFromSocialResponse(response.user)
        }
    }

    private suspend fun refreshCurrentUserFromSocialResponse(responseUser: UserProfileDto?) {
        val updated = responseUser?.toUserDataOrNull()
            ?: currentUser.value.getOrNull()?.id?.let { fetchUserProfile(it) }
            ?: error("Failed to refresh current user after social update.")
        cacheCurrentUserProfile(updated)
    }
}

@Serializable
private data class SocialEmptyRequestDto(
    val placeholder: String = "",
)

@Serializable
private data class SocialTargetRequestDto(
    val targetUserId: String,
)

@Serializable
private data class FamilyChildrenResponseDto(
    val children: List<FamilyChildDto> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class FamilyJoinRequestsResponseDto(
    val requests: List<FamilyJoinRequestDto> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class FamilyChildDto(
    val userId: String? = null,
    @SerialName("\$id") val legacyUserId: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val userName: String? = null,
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
            userName = userName?.trim()?.takeIf(String::isNotBlank),
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
private data class FamilyJoinRequestDto(
    val registrationId: String? = null,
    val eventId: String? = null,
    val eventName: String? = null,
    val eventStart: String? = null,
    val childUserId: String? = null,
    val childFirstName: String? = null,
    val childLastName: String? = null,
    val childFullName: String? = null,
    val childDateOfBirth: String? = null,
    val childEmail: String? = null,
    val childHasEmail: Boolean? = null,
    val consentStatus: String? = null,
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
    val requestedAt: String? = null,
    val updatedAt: String? = null,
) {
    fun toFamilyJoinRequestOrNull(): FamilyJoinRequest? {
        val normalizedRegistrationId = registrationId?.trim()?.takeIf(String::isNotBlank) ?: return null
        val normalizedEventId = eventId?.trim()?.takeIf(String::isNotBlank) ?: return null
        val normalizedChildUserId = childUserId?.trim()?.takeIf(String::isNotBlank) ?: return null

        return FamilyJoinRequest(
            registrationId = normalizedRegistrationId,
            eventId = normalizedEventId,
            eventName = eventName?.trim()?.takeIf(String::isNotBlank),
            eventStart = eventStart?.trim()?.takeIf(String::isNotBlank),
            childUserId = normalizedChildUserId,
            childFirstName = childFirstName?.trim()?.takeIf(String::isNotBlank),
            childLastName = childLastName?.trim()?.takeIf(String::isNotBlank),
            childFullName = childFullName?.trim()?.takeIf(String::isNotBlank),
            childDateOfBirth = childDateOfBirth?.trim()?.takeIf(String::isNotBlank),
            childEmail = childEmail?.trim()?.takeIf(String::isNotBlank),
            childHasEmail = childHasEmail ?: childEmail?.isNotBlank() == true,
            consentStatus = consentStatus?.trim()?.takeIf(String::isNotBlank),
            divisionId = divisionId?.trim()?.takeIf(String::isNotBlank),
            divisionTypeId = divisionTypeId?.trim()?.takeIf(String::isNotBlank),
            divisionTypeKey = divisionTypeKey?.trim()?.takeIf(String::isNotBlank),
            requestedAt = requestedAt?.trim()?.takeIf(String::isNotBlank),
            updatedAt = updatedAt?.trim()?.takeIf(String::isNotBlank),
        )
    }
}

@Serializable
private data class JoinRequestActionRequestDto(
    val action: String,
)

@Serializable
private data class JoinRequestActionResponseDto(
    val action: String? = null,
    val registration: JoinRequestRegistrationDto? = null,
    val consent: JoinRequestConsentDto? = null,
    val warnings: List<String> = emptyList(),
    val error: String? = null,
) {
    fun toResolution(): FamilyJoinRequestResolution {
        return FamilyJoinRequestResolution(
            action = action?.trim()?.takeIf(String::isNotBlank),
            registrationStatus = registration?.status?.trim()?.takeIf(String::isNotBlank),
            consentStatus = consent?.status?.trim()?.takeIf(String::isNotBlank)
                ?: registration?.consentStatus?.trim()?.takeIf(String::isNotBlank),
            childEmail = consent?.childEmail?.trim()?.takeIf(String::isNotBlank),
            requiresChildEmail = consent?.requiresChildEmail ?: false,
            warnings = warnings,
        )
    }
}

@Serializable
private data class JoinRequestRegistrationDto(
    val status: String? = null,
    val consentStatus: String? = null,
)

@Serializable
private data class JoinRequestConsentDto(
    val status: String? = null,
    val childEmail: String? = null,
    val requiresChildEmail: Boolean? = null,
)

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
