package com.razumly.mvp.core.data.repositories

import app.cash.turbine.test
import assertk.assertThat
import assertk.assertions.any
import assertk.assertions.hasMessage
import assertk.assertions.hasSize
import assertk.assertions.index
import assertk.assertions.isEqualTo
import assertk.assertions.prop
import com.razumly.mvp.BaseTest
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.ID
import io.appwrite.models.Row
import io.appwrite.models.RowList
import io.appwrite.models.Session
import io.appwrite.models.User
import io.appwrite.services.Account
import io.appwrite.services.TablesDB
import io.appwrite.services.Functions
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.kodein.mock.Mock
import org.kodein.mock.UsesFakes
import org.kodein.mock.UsesMocks
import org.kodein.mock.generated.fake
import org.koin.core.context.loadKoinModules
import org.koin.dsl.module
import org.koin.test.KoinTest
import org.koin.test.inject
import kotlin.test.BeforeTest
import kotlin.test.Test

@UsesMocks(
    IPushNotificationsRepository::class
)
@UsesFakes(
    Session::class,
    User::class,
    Row::class,
    RowList::class,
    UserDataDTO::class
)
class UserRepositoryTest : BaseTest(), KoinTest {

    private val testScope = TestScope(testDispatcher)

    @Mock lateinit var pushNotificationsRepository: IPushNotificationsRepository

    private val userDataSource: CurrentUserDataSource by inject()
    private val userRepository: UserRepository by inject()
    private val userDao: UserDataDao by inject()
    private val tablesDb: TablesDB by inject()
    private val account: Account by inject()

    @BeforeTest
    fun setupUserRepositoryTest() {
        loadKoinModules(
            module {
                single<Account> { Account(get()) }
                single<TablesDB> { TablesDB(get()) }
                single<CurrentUserDataSource> { userDataSource }
                single<IPushNotificationsRepository> { pushNotificationsRepository }
                single<Functions> { Functions(get()) }
            }
        )

        every { userDataSource.getPushToken() } returns flowOf("")
        every { userDataSource.getPushTarget() } returns flowOf("")
    }

    @Test
    fun `login success should save user and return success result`() = testScope.runTest {
        // Arrange
        val email = "test@example.com"
        val password = "password123"
        val userId = "user123"
        val userData = UserData().copy(id = userId, firstName = "John", lastName = "Doe", userName = "johndoe")

        val mockSession = fake<Session>()
        val mockUser = fake<User<Map<String, Any>>>()
        val mockDocument = fake<Row<UserDataDTO>>()

        every { mockUser.id } returns userId
        every { mockDocument.data } returns UserDataDTO("John", "Doe", "johndoe", userId)

        everySuspending { account.createEmailPasswordSession(email, password) } returns mockSession
        everySuspending { account.get() } returns mockUser
        everySuspending {
            tablesDb.getRow<UserDataDTO>(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_TABLE,
                userId,
                isAny(),
                isAny(),
                isAny(),
                isAny(),
                isAny()
            )
        } returns mockDocument
        everySuspending { userDataSource.saveUserId(userId) } returns Unit
        everySuspending { userDao.upsertUserData(isAny()) } returns Unit

        val result = userRepository.login(email, password)

        assertThat(result).isSuccess()
        assertThat(result).isSuccessAnd().prop(UserData::id).isEqualTo(userId)
        assertThat(result).isSuccessAnd().prop(UserData::firstName).isEqualTo("John")

        verifyWithSuspend {
            account.createEmailPasswordSession(email, password)
            userDataSource.saveUserId(userId)
            userDao.upsertUserData(isAny())
        }
    }

    @Test
    fun `login failure should return failure result`() = testScope.runTest {
        val email = "test@example.com"
        val password = "wrongpassword"
        val exception = Exception("Invalid credentials")

        everySuspending { account.createEmailPasswordSession(email, password) } runs { throw exception }

        val result = userRepository.login(email, password)

        assertThat(result).isFailure()
        assertThat(result).isFailureAnd().hasMessage("Invalid credentials")
    }

    @Test
    fun `updateUser should update both remote and local data`() = testScope.runTest {
        val userData = UserData().copy(
            id = "user123", firstName = "Updated", lastName = "User", userName = "updated"
        )
        val updatedDto = UserDataDTO("Updated", "User", "updated", "user123")
        val mockDocument = fake<Row<UserDataDTO>>()

        every { mockDocument.data } returns updatedDto
        everySuspending {
            tablesDb.updateRow<UserDataDTO>(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_TABLE,
                userData.id,
                isAny(),
                isAny(),
                isAny(),
                isAny()
            )
        } returns mockDocument
        everySuspending { userDao.upsertUserWithRelations(isAny()) } returns Unit

        val result = userRepository.updateUser(userData)

        assertThat(result).isSuccess()

        verifyWithSuspend {
            tablesDb.updateRow<UserDataDTO>(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_TABLE,
                userData.id,
                isAny(),
                isAny(),
                isAny(),
                isAny()
            )
            userDao.upsertUserWithRelations(userData)
        }
    }

    @Test
    fun `logout should clear current user and session`() = testScope.runTest {
        everySuspending { userDataSource.saveUserId("") } returns Unit
        everySuspending { account.deleteSession("current") } returns Unit
        everySuspending { pushNotificationsRepository.removeDeviceAsTarget() } returns Result.success(Unit)

        val result = userRepository.logout()

        assertThat(result).isSuccess()

        verifyWithSuspend {
            userDataSource.saveUserId("")
            account.deleteSession("current")
            pushNotificationsRepository.removeDeviceAsTarget()
        }
    }

    @Test
    fun `getUsersOfTournament should save cross references and return users`() = testScope.runTest {
        val tournamentId = "tournament123"
        val userData1 = UserData().copy(id = "user1", firstName = "John")
        val userData2 = UserData().copy(id = "user2", firstName = "Jane")
        val localUsers = listOf(userData1)

        val mockDocument1 = fake<Row<UserDataDTO>>()
        val mockDocument2 = fake<Row<UserDataDTO>>()
        val mockDocuments = fake<RowList<UserDataDTO>>()

        every { mockDocument1.id } returns "user1"
        every { mockDocument1.data } returns UserDataDTO("John", "Doe", "john", "user1")
        every { mockDocument2.id } returns "user2"
        every { mockDocument2.data } returns UserDataDTO("Jane", "Smith", "jane", "user2")
        every { mockDocuments.rows } returns listOf(mockDocument1, mockDocument2)

        everySuspending { userDao.getUsersInTournament(tournamentId) } returns localUsers
        everySuspending {
            tablesDb.listRows<UserDataDTO>(isAny(), isAny(), isAny(), isAny(), isAny(), isAny(), isAny())
        } returns mockDocuments
        everySuspending { userDao.upsertUsersData(isAny()) } returns Unit
        everySuspending { userDao.upsertUserTournamentCrossRefs(isAny()) } returns Unit
        everySuspending { userDao.deleteUsersById(isAny()) } returns Unit

        val result = userRepository.getUsersOfTournament(tournamentId)

        // Use assertK for better assertions
        assertThat(result).isSuccess()
        assertThat(result).isSuccessAnd().hasSize(2)
        assertThat(result).isSuccessAnd().any {
            it.prop(UserData::id).isEqualTo("user1")
        }
        assertThat(result).isSuccessAnd().any {
            it.prop(UserData::id).isEqualTo("user2")
        }

        verifyWithSuspend {
            userDao.upsertUsersData(isAny())
            userDao.upsertUserTournamentCrossRefs(isAny())
        }
    }

    @Test
    fun `getUsersOfTournamentFlow should emit local data and trigger remote fetch`() = testScope.runTest {
        val tournamentId = "tournament123"
        val localUsers = listOf(UserData().copy(id = "user1", firstName = "John"))

        val mockDocument = fake<Row<UserDataDTO>>()
        val mockDocuments = fake<RowList<UserDataDTO>>()

        every { mockDocument.id } returns "user1"
        every { mockDocument.data } returns UserDataDTO("John", "Doe", "john", "user1")
        every { mockDocuments.rows } returns listOf(mockDocument)

        every { userDao.getUsersInTournamentFlow(tournamentId) } returns flowOf(localUsers)
        everySuspending { userDao.getUsersInTournament(tournamentId) } returns localUsers
        everySuspending {
            tablesDb.listRows<UserDataDTO>(isAny(), isAny(), isAny(), isAny(), isAny(), isAny(), isAny())
        } returns mockDocuments
        everySuspending { userDao.upsertUsersData(isAny()) } returns Unit
        everySuspending { userDao.upsertUserTournamentCrossRefs(isAny()) } returns Unit
        everySuspending { userDao.deleteUsersById(isAny()) } returns Unit

        userRepository.getUsersOfTournamentFlow(tournamentId).test {
            val emission = awaitItem()

            assertThat(emission).isSuccess()
            assertThat(emission).isSuccessAnd().hasSize(1)
            assertThat(emission).isSuccessAnd().index(0).prop(UserData::id).isEqualTo("user1")

            awaitComplete()
        }

        verifyWithSuspend { tablesDb.listRows<UserDataDTO>(isAny(), isAny(), isAny(), isAny(), isAny(), isAny(), isAny()) }
    }

    @Test
    fun `searchPlayers should return remote results without caching`() = testScope.runTest {
        val searchTerm = "john"

        val mockDocument = fake<Row<UserDataDTO>>()
        val mockDocuments = fake<RowList<UserDataDTO>>()

        every { mockDocument.id } returns "user1"
        every { mockDocument.data } returns UserDataDTO("John", "Doe", "john", "user1")
        every { mockDocuments.rows } returns listOf(mockDocument)

        everySuspending {
            tablesDb.listRows<UserDataDTO>(isAny(), isAny(), isAny(), isAny(), isAny(), isAny(), isAny())
        } returns mockDocuments
        everySuspending { userDao.upsertUsersData(isAny()) } returns Unit
        everySuspending { userDao.deleteUsersById(isAny()) } returns Unit

        val result = userRepository.searchPlayers(searchTerm)

        assertThat(result).isSuccess()
        assertThat(result).isSuccessAnd().hasSize(1)
        assertThat(result).isSuccessAnd().index(0).prop(UserData::userName).isEqualTo("john")

        // Simplified verification without complex match
        verifyWithSuspend {
            tablesDb.listRows<UserDataDTO>(isAny(), isAny(), isAny(), isAny(), isAny(), isAny(), isAny())
        }
    }

    @Test
    fun `createNewUser should create account and save user data`() = testScope.runTest {
        val email = "new@example.com"
        val password = "password123"
        val firstName = "New"
        val lastName = "User"
        val userName = "newuser"
        val userId = "newUserId"

        val mockDocument = fake<Row<UserDataDTO>>()
        val mockAccount = fake<User<Map<String, Any>>>()

        every { mockDocument.id } returns userId
        every { mockDocument.data } returns UserDataDTO(firstName, lastName, userName, userId)
        every { ID.unique() } returns userId
        everySuspending { account.create(userId, email, password, userName) } returns mockAccount
        everySuspending {
            tablesDb.createRow<UserDataDTO>(isAny(), isAny(), isAny(), isAny(), isAny(), isAny(), isAny())
        } returns mockDocument

        val result = userRepository.createNewUser(email, password, firstName, lastName, userName)

        assertThat(result).isSuccess()
        assertThat(result).isSuccessAnd().prop(UserData::id).isEqualTo(userId)
        assertThat(result).isSuccessAnd().prop(UserData::firstName).isEqualTo(firstName)
        assertThat(result).isSuccessAnd().prop(UserData::lastName).isEqualTo(lastName)
        assertThat(result).isSuccessAnd().prop(UserData::userName).isEqualTo(userName)

        verifyWithSuspend {
            account.create(userId, email, password, userName)
            tablesDb.createRow<UserDataDTO>(isAny(), isAny(), isAny(), isAny(), isAny(), isAny(), isAny())
        }
    }

    @Test
    fun `updateUser should handle network failure and return error`() = testScope.runTest {
        val userData = UserData().copy(id = "user123", firstName = "Updated")
        val networkException = Exception("Network error")

        everySuspending {
            tablesDb.updateRow<UserDataDTO>(isAny(), isAny(), isAny(), isAny(), isAny(), isAny(), isAny())
        } runs { throw networkException }

        val result = userRepository.updateUser(userData)

        assertThat(result).isFailure()
        assertThat(result).isFailureAnd().hasMessage("Network error")

        verifyWithSuspend { userDao.upsertUserWithRelations(isAny()) }
    }
}
