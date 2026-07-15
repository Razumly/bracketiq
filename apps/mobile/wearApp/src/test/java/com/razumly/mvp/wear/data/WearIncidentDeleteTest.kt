package com.razumly.mvp.wear.data

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class WearIncidentDeleteTest {
    @Test
    fun givenAnIncidentId_whenBuildingDeletePatch_thenUsesTheMatchOperationContract() {
        val operation = incidentDeletePatch(" incident_1 ")
            .getValue("incidentOperations")
            .jsonArray
            .single()
            .jsonObject

        assertEquals("DELETE", operation.getValue("action").jsonPrimitive.content)
        assertEquals("incident_1", operation.getValue("id").jsonPrimitive.content)
    }

    @Test
    fun givenABlankIncidentId_whenBuildingDeletePatch_thenRefusesToQueueIt() {
        assertFailsWith<WearApiException> {
            incidentDeletePatch("  ")
        }
    }
}
