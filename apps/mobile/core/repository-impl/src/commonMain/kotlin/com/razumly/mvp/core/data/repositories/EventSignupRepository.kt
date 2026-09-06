package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.EventSignupCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventSignupDraft
import com.razumly.mvp.core.data.dataTypes.EventSignupState
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.EventRegistrationDraftResponseDto
import com.razumly.mvp.core.network.dto.EventRegistrationDraftSaveDto
import com.razumly.mvp.core.network.dto.EventTeamCreationContextDto
import com.razumly.mvp.core.network.dto.TeamApiDto
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

internal class EventSignupRepository(
    private val database: DatabaseService,
    private val api: MvpApiClient,
    private val accountIds: Flow<String>,
    private val teamRepository: ITeamRepository,
) {
    private val mutex = Mutex()
    private fun key(accountId: String, eventId: String, occurrence: EventOccurrenceSelection?) =
        jsonMVP.encodeToString(listOf(accountId, eventId, occurrence?.slotId.orEmpty(), occurrence?.occurrenceDate.orEmpty()))

    private fun path(eventId: String, occurrence: EventOccurrenceSelection?): String =
        "api/events/${eventId.encodeURLQueryComponent()}/registration-draft" +
            (occurrence?.let { "?slotId=${it.slotId.encodeURLQueryComponent()}&occurrenceDate=${it.occurrenceDate.encodeURLQueryComponent()}" } ?: "")

    @OptIn(ExperimentalCoroutinesApi::class)
    fun observe(eventId: String, occurrence: EventOccurrenceSelection?): Flow<EventSignupState?> =
        accountIds.distinctUntilChanged().flatMapLatest { accountId ->
            if (accountId.isBlank()) flowOf(null)
            else database.getEventSignupDao.observe(key(accountId, eventId, occurrence), accountId).map { entry ->
                entry?.let { jsonMVP.decodeFromString<EventSignupState>(it.payload) }
            }
        }

    private suspend fun store(accountId: String, eventId: String, occurrence: EventOccurrenceSelection?, response: EventRegistrationDraftResponseDto): EventSignupState {
        check(accountIds.first() == accountId) { "The signed-in Account changed. Reload registration progress." }
        val id = key(accountId, eventId, occurrence)
        database.withTransaction {
            database.getEventSignupDao.upsert(EventSignupCacheEntry(id, accountId, eventId, jsonMVP.encodeToString(response.toModel())))
        }
        return jsonMVP.decodeFromString(requireNotNull(database.getEventSignupDao.get(id, accountId)).payload)
    }

    private suspend fun <T> operation(eventId: String, occurrence: EventOccurrenceSelection?, block: suspend (String) -> T): Result<T> = mutex.withLock {
        val accountId = accountIds.first().trim()
        if (accountId.isBlank()) return@withLock Result.failure(IllegalStateException("Sign in to continue registration."))
        try {
            Result.success(block(accountId))
        } catch (failure: CancellationException) {
            throw failure
        } catch (failure: ApiException) {
            val error = runCatching { jsonMVP.parseToJsonElement(failure.responseBody.orEmpty()).jsonObject }.getOrNull()
            error?.get("state")?.takeIf { it != JsonNull }?.let { state ->
                store(accountId, eventId, occurrence, jsonMVP.decodeFromJsonElement<EventRegistrationDraftResponseDto>(state))
            }
            Result.failure(IllegalStateException(error?.get("error")?.jsonPrimitive?.content ?: "Could not save registration progress.", failure))
        } catch (failure: Exception) {
            Result.failure(failure)
        }
    }

    suspend fun load(eventId: String, occurrence: EventOccurrenceSelection?): Result<EventSignupState> = operation(eventId, occurrence) { accountId ->
        store(accountId, eventId, occurrence, api.get(path(eventId, occurrence)))
    }

    suspend fun save(eventId: String, occurrence: EventOccurrenceSelection?, baseRevision: Int, draft: EventSignupDraft): Result<EventSignupState> = operation(eventId, occurrence) { accountId ->
        val patch = buildJsonObject {
            put("selectedTeamId", draft.selectedTeamId?.let(::JsonPrimitive) ?: JsonNull)
            put("selectedDivisionId", draft.selectedDivisionId?.let(::JsonPrimitive) ?: JsonNull)
            put("selectedDivisionTypeKey", draft.selectedDivisionTypeKey?.let(::JsonPrimitive) ?: JsonNull)
            put("answers", jsonMVP.encodeToJsonElement(draft.answers))
            put("step", draft.step)
            put("completedSteps", jsonMVP.encodeToJsonElement(draft.completedSteps))
            put("registrationId", draft.registrationId?.let(::JsonPrimitive) ?: JsonNull)
            put("teamCreationId", draft.teamCreationId?.let(::JsonPrimitive) ?: JsonNull)
        }
        val response = api.patch<EventRegistrationDraftSaveDto, EventRegistrationDraftResponseDto>(path(eventId, null),
            EventRegistrationDraftSaveDto(baseRevision = baseRevision, patch = patch, slotId = occurrence?.slotId, occurrenceDate = occurrence?.occurrenceDate))
        store(accountId, eventId, occurrence, response)
    }

    suspend fun createTeam(eventId: String, occurrence: EventOccurrenceSelection?, baseRevision: Int, team: Team): Result<Team> = operation(eventId, occurrence) { accountId ->
        val body = JsonObject(jsonMVP.encodeToJsonElement(team.withSynchronizedMembership()).jsonObject +
            ("registrationDraft" to jsonMVP.encodeToJsonElement(EventTeamCreationContextDto(eventId, baseRevision, occurrence?.slotId, occurrence?.occurrenceDate))))
        val saved = api.post<JsonObject, TeamApiDto>("api/teams", body).toTeamOrNull() ?: error("The saved Team response is missing.")
        teamRepository.getTeams(listOf(saved.id)).getOrThrow()
        store(accountId, eventId, occurrence, api.get(path(eventId, occurrence)))
        database.getTeamDao.getTeam(saved.id)
    }

    suspend fun clear(eventId: String, occurrence: EventOccurrenceSelection?): Result<Unit> = operation(eventId, occurrence) { accountId ->
        api.deleteNoResponse(path(eventId, occurrence))
        database.getEventSignupDao.delete(key(accountId, eventId, occurrence), accountId)
    }
}
