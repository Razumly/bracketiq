package com.razumly.mvp.core.network.dto

import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

class EventEditorClientToSiteCoverageTest {
    @Test
    fun mobile_commands_reach_the_real_site_parser_without_field_loss() {
        val json = Json
        val fixtures = json.parseToJsonElement(completeEventEditorWireFixtures).jsonObject
        val cases = fixtures.getValue("cases").jsonArray
        val commands = JsonArray(cases.map { entry ->
            encodeEventEditorCreateCommand(json.decodeFromJsonElement<EventEditorCreateCommandDto>(entry.jsonObject.getValue("command")))
        })
        val operations = JsonArray(fixtures.getValue("operations").jsonArray.map { entry ->
            val operation = entry.jsonObject
            encodeCoverageOperation(operation.getValue("kind").jsonPrimitive.content, coverageOperationCommand(fixtures, operation))
        })
        val pairwise = JsonArray(fixtures.getValue("pairwise").jsonObject.getValue("rows").jsonArray.map { row ->
            encodeEventEditorCreateCommand(json.decodeFromJsonElement<EventEditorCreateCommandDto>(coveragePairwiseCommand(fixtures, row.jsonObject)))
        })
        val input = JsonObject(mapOf("commands" to commands, "operations" to operations, "pairwise" to pairwise))
        val site = System.getenv("MVP_SITE_DIR")?.let(::File)
            ?: generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
                .map { File(it, "apps/site") }.first { File(it, "package.json").isFile }
        val process = ProcessBuilder("node", "--import", "tsx", "scripts/test-event-editor-coverage-contract.ts")
            .directory(site).redirectErrorStream(true).start()
        val output = CompletableFuture.supplyAsync { process.inputStream.bufferedReader().readText() }
        try {
            process.outputStream.bufferedWriter().use { it.write(input.toString()) }
            check(process.waitFor(60, TimeUnit.SECONDS)) { "The site parser did not finish within 60 seconds." }
            val result = output.get(5, TimeUnit.SECONDS)
            assertEquals(0, process.exitValue(), result)
            assertEquals("{\"accepted\":${cases.size + operations.size + pairwise.size}}", result.trim())
        } finally {
            if (process.isAlive) process.destroyForcibly()
        }
    }
}
