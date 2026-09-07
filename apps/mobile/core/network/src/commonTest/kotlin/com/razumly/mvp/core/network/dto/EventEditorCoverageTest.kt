package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.enums.EventType

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

class EventEditorCoverageTest {
    private val json = Json { encodeDefaults = true; explicitNulls = true }
    private val fixtures get() = json.parseToJsonElement(completeEventEditorWireFixtures).jsonObject

    @Test
    fun given_complete_fixtures_when_commands_are_encoded_then_canonical_values_are_preserved() {
        assertEquals(EventType.entries.map { it.name }.toSet(), fixtures.getValue("cases").jsonArray.map {
            it.jsonObject.getValue("command").jsonObject.getValue("draft").jsonObject.getValue("basics").jsonObject.getValue("eventType").jsonPrimitive.content
        }.toSet())
        fixtures.getValue("cases").jsonArray.forEach { entry ->
            val expected = entry.jsonObject.getValue("command").jsonObject
            val command = json.decodeFromJsonElement<EventEditorCreateCommandDto>(expected)
            assertCanonicalValues(expected, encodeEventEditorCreateCommand(command), entry.jsonObject.getValue("name").toString())
        }
    }

    @Test
    fun given_pairwise_fixtures_when_commands_are_encoded_then_canonical_values_are_preserved() {
        fixtures.getValue("pairwise").jsonObject.getValue("rows").jsonArray.forEach { row ->
            val expected = coveragePairwiseCommand(fixtures, row.jsonObject)
            val command = json.decodeFromJsonElement<EventEditorCreateCommandDto>(expected)
            assertCanonicalValues(expected, encodeEventEditorCreateCommand(command), row.jsonObject.getValue("name").toString())
        }
    }

    @Test
    fun given_boundary_fixtures_when_commands_are_encoded_then_canonical_values_are_preserved() {
        fixtures.getValue("boundaries").jsonArray.filter { it.jsonObject.getValue("isValid").jsonPrimitive.boolean }.forEach { row ->
            val expected = coveragePairwiseCommand(fixtures, row.jsonObject)
            val command = json.decodeFromJsonElement<EventEditorCreateCommandDto>(expected)
            assertCanonicalValues(expected, encodeEventEditorCreateCommand(command), row.jsonObject.getValue("name").toString())
        }
    }

    @Test
    fun given_typed_results_when_decoded_and_encoded_then_canonical_values_are_preserved() {
        fixtures.getValue("results").jsonArray.forEach { entry ->
            val value = entry.jsonObject.getValue("value")
            val encoded = when (entry.jsonObject.getValue("kind").jsonPrimitive.content) {
                "error" -> json.encodeToJsonElement(json.decodeFromJsonElement<EventEditorErrorDto>(value))
                "created", "partialAccepted", "saved" -> json.encodeToJsonElement(json.decodeFromJsonElement<EventEditorSaveResultDto>(value))
                "createProposal" -> json.encodeToJsonElement(json.decodeFromJsonElement<EventEditorCreateProposalDto>(value))
                "maintenanceProposal" -> json.encodeToJsonElement(json.decodeFromJsonElement<EventEditorMaintenanceProposalDto>(value))
                "maintenanceAccepted" -> json.encodeToJsonElement(json.decodeFromJsonElement<EventEditorMaintenanceAcceptedResultDto>(value))
                "schedule" -> json.encodeToJsonElement(json.decodeFromJsonElement<EventEditorScheduleOutcomeDto>(value))
                "maintenanceRejected" -> json.encodeToJsonElement(json.decodeFromJsonElement<EventEditorMaintenanceRejectedResultDto>(value))
                else -> error("Unclassified result kind.")
            }
            assertCanonicalValues(value, encoded, entry.jsonObject.getValue("name").toString())
        }
    }

    @Test
    fun given_command_envelopes_when_encoded_then_canonical_values_are_preserved() {
        fixtures.getValue("operations").jsonArray.forEach { entry ->
            val operation = entry.jsonObject
            val command = coverageOperationCommand(fixtures, operation)
            assertCanonicalValues(command, encodeCoverageOperation(operation.getValue("kind").jsonPrimitive.content, command), operation.getValue("name").toString())
        }
    }

    private fun assertCanonicalValues(expected: JsonElement, actual: JsonElement?, path: String) {
        when (expected) {
            is JsonObject -> expected.forEach { (key, value) ->
                assertCanonicalValues(value, (actual as? JsonObject)?.get(key), "$path.$key")
            }
            is JsonArray -> {
                assertEquals(expected.size, (actual as? JsonArray)?.size, path)
                expected.forEachIndexed { index, value -> assertCanonicalValues(value, (actual as? JsonArray)?.get(index), "$path[$index]") }
            }
            else -> {
                val number = (expected as? JsonPrimitive)?.takeUnless { it.isString }?.doubleOrNull
                if (number != null) assertEquals(number, (actual as? JsonPrimitive)?.takeUnless { it.isString }?.doubleOrNull, path)
                else assertEquals(expected, actual, path)
            }
        }
    }
}

internal fun coveragePairwiseCommand(fixtures: JsonObject, row: JsonObject): JsonObject {
    val base = fixtures.getValue("cases").jsonArray[row.getValue("draftCase").jsonPrimitive.int].jsonObject.getValue("command").jsonObject
    return JsonObject(base + ("draft" to mergeCoveragePatch(base.getValue("draft"), row.getValue("patch"))))
}

private fun mergeCoveragePatch(value: JsonElement?, patch: JsonElement): JsonElement {
    if (value !is JsonObject || patch !is JsonObject) return patch
    return JsonObject(value + patch.mapValues { (key, entry) ->
        if (key == "schedule") entry else mergeCoveragePatch(value[key], entry)
    })
}

internal fun coverageOperationCommand(fixtures: JsonObject, operation: JsonObject): JsonObject {
    val command = operation.getValue("command").jsonObject
    val draftCase = operation["draftCase"]?.jsonPrimitive?.int ?: return command
    val draft = fixtures.getValue("cases").jsonArray[draftCase].jsonObject.getValue("command").jsonObject.getValue("draft")
    return JsonObject(command + ("draft" to draft))
}

internal fun encodeCoverageOperation(kind: String, command: JsonObject): JsonElement {
    val json = Json { encodeDefaults = true; explicitNulls = true }
    return when (kind) {
        "save" -> encodeEventEditorSaveCommand(json.decodeFromJsonElement(command))
        "accept" -> encodeEventEditorAcceptProposalCommand(json.decodeFromJsonElement(command))
        "acceptPartial" -> encodeEventEditorAcceptPartialProposalCommand(json.decodeFromJsonElement(command))
        "reject" -> json.encodeToJsonElement(json.decodeFromJsonElement<EventEditorRejectProposalCommandDto>(command))
        "maintenance" -> json.encodeToJsonElement(json.decodeFromJsonElement<EventEditorMaintenanceRequestDto>(command))
        "acceptMaintenance" -> json.encodeToJsonElement(json.decodeFromJsonElement<EventEditorAcceptMaintenanceProposalDto>(command))
        "rejectMaintenance" -> json.encodeToJsonElement(json.decodeFromJsonElement<EventEditorRejectMaintenanceProposalDto>(command))
        else -> error("Unclassified command kind: $kind")
    }
}
