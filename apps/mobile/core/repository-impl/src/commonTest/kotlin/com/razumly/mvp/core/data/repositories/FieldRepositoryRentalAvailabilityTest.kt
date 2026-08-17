@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.EventRegistrationDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.configureMvpHttpClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlin.time.Instant

class FieldRepositoryRentalAvailabilityTest {
    @Test
    fun getRentalAvailability_requests_exact_window_without_overwriting_complete_cached_fields() = runTest {
        val rangeStart = Instant.parse("2026-07-13T07:00:00Z")
        val rangeEnd = Instant.parse("2026-07-20T07:00:00Z")
        val fieldDao = RentalAvailabilityTestFieldDao()
        fieldDao.upsertField(
            Field(
                id = "field_1",
                name = "Complete cached court",
                lat = 45.5,
                long = -122.6,
                divisions = listOf("OPEN"),
                rentalSlotIds = listOf("cached_slot"),
            ),
        )
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/organizations/org_1/rental-availability", request.url.encodedPath)
            assertEquals(rangeStart.toString(), request.url.parameters["start"])
            assertEquals(rangeEnd.toString(), request.url.parameters["end"])
            respond(
                content = """
                    {
                      "range": {
                        "start": "2026-07-13T07:00:00.000Z",
                        "end": "2026-07-20T07:00:00.000Z"
                      },
                      "fields": [
                        {
                          "id": "field_1",
                          "fieldNumber": null,
                          "name": "Court 1",
                          "facilityId": "facility_1",
                          "facilityName": "River City Sports Club",
                          "rentalSlots": [
                            {
                              "id": "slot_1",
                              "daysOfWeek": [0, 2],
                              "startTimeMinutes": 540,
                              "endTimeMinutes": 1260,
                              "startDate": "2026-07-01T00:00:00.000Z",
                              "endDate": null,
                              "timeZone": "America/Los_Angeles",
                              "repeating": true,
                              "price": 2500
                            }
                          ]
                        }
                      ],
                      "busyBlocks": [
                        {
                          "fieldId": "field_1",
                          "start": "2026-07-14T17:00:00.000Z",
                          "end": "2026-07-14T18:00:00.000Z"
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val repository = FieldRepository(
            api = rentalAvailabilityTestApi(engine),
            databaseService = RentalAvailabilityTestDatabaseService(fieldDao),
        )

        val snapshot = repository.getRentalAvailability(" org_1 ", rangeStart, rangeEnd).getOrThrow()

        assertEquals(rangeStart, snapshot.rangeStart)
        assertEquals(rangeEnd, snapshot.rangeEnd)
        assertEquals(listOf("field_1"), snapshot.fields.map { item -> item.field.id })
        assertEquals("River City Sports Club", snapshot.fields.single().field.facility?.name)
        assertEquals(listOf("slot_1"), snapshot.fields.single().field.rentalSlotIds)
        assertEquals(listOf(0, 2), snapshot.fields.single().rentalSlots.single().daysOfWeek)
        assertEquals("field_1", snapshot.busyBlocks.single().fieldId)
        assertEquals("Complete cached court", fieldDao.fields.getValue("field_1").name)
        assertEquals(45.5, fieldDao.fields.getValue("field_1").lat)
        assertEquals(listOf("OPEN"), fieldDao.fields.getValue("field_1").divisions)
        assertEquals(listOf("cached_slot"), fieldDao.fields.getValue("field_1").rentalSlotIds)
    }

    @Test
    fun getRentalAvailability_rejects_slot_without_required_startDate() = runTest {
        val rangeStart = Instant.parse("2026-07-13T07:00:00Z")
        val rangeEnd = Instant.parse("2026-07-20T07:00:00Z")
        val engine = MockEngine {
            respond(
                content = """
                    {
                      "range": {
                        "start": "2026-07-13T07:00:00.000Z",
                        "end": "2026-07-20T07:00:00.000Z"
                      },
                      "fields": [
                        {
                          "id": "field_1",
                          "name": "Court 1",
                          "rentalSlots": [{ "id": "slot_1", "startDate": null }]
                        }
                      ],
                      "busyBlocks": []
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val repository = FieldRepository(
            api = rentalAvailabilityTestApi(engine),
            databaseService = RentalAvailabilityTestDatabaseService(RentalAvailabilityTestFieldDao()),
        )

        val failure = repository.getRentalAvailability("org_1", rangeStart, rangeEnd).exceptionOrNull()

        assertIs<IllegalStateException>(failure)
        assertTrue(failure.message.orEmpty().contains("missing its start date"))
    }
}

private class RentalAvailabilityTestTokenStore : AuthTokenStore {
    override suspend fun get(): String = "session-token"
    override suspend fun set(token: String) = Unit
    override suspend fun clear() = Unit
}

private fun rentalAvailabilityTestApi(engine: MockEngine): MvpApiClient = MvpApiClient(
    http = HttpClient(engine) { configureMvpHttpClient() },
    baseUrl = "http://example.test",
    tokenStore = RentalAvailabilityTestTokenStore(),
)

private class RentalAvailabilityTestFieldDao : FieldDao {
    val fields = linkedMapOf<String, Field>()

    override suspend fun upsertField(field: Field) {
        fields[field.id] = field
    }

    override suspend fun upsertFields(fields: List<Field>) {
        fields.forEach { field -> this.fields[field.id] = field }
    }

    override suspend fun getFieldsByIds(ids: List<String>): List<Field> = ids.mapNotNull(fields::get)
    override suspend fun getAllFields(): List<Field> = fields.values.toList()
    override suspend fun deleteFieldsById(ids: List<String>) = ids.forEach { id -> fields.remove(id) }
    override suspend fun deleteField(field: Field) {
        fields.remove(field.id)
    }

    override fun getFieldById(id: String): Flow<FieldWithMatches?> = flowOf(null)
    override fun getFieldsWithMatches(ids: List<String>): Flow<List<FieldWithMatches>> = flowOf(emptyList())
}

private class RentalAvailabilityTestDatabaseService(
    override val getFieldDao: FieldDao,
) : DatabaseService {
    override val getMatchDao: MatchDao get() = error("unused")
    override val getTeamDao: TeamDao get() = error("unused")
    override val getUserDataDao: UserDataDao get() = error("unused")
    override val getEventDao: EventDao get() = error("unused")
    override val getEventRegistrationDao: EventRegistrationDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}
