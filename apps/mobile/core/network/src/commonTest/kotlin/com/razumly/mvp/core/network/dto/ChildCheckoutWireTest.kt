package com.razumly.mvp.core.network.dto

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class ChildCheckoutWireTest {
    @Test
    fun given_child_purchase_when_encoded_then_payer_and_registrant_are_distinct() {
        val body = Json.encodeToJsonElement(PurchaseIntentRequestDto(
            user = BillingUserRefDto("parent"),
            eventRegistration = BillingEventRegistrationTargetDto("child", "CHILD", "parent"),
        )).jsonObject
        assertEquals("parent", body.getValue("user").jsonObject.getValue("id").jsonPrimitive.content)
        val target = body.getValue("eventRegistration").jsonObject
        assertEquals("child", target.getValue("registrantId").jsonPrimitive.content)
        assertEquals("parent", target.getValue("parentId").jsonPrimitive.content)
        assertEquals("CHILD", target.getValue("registrantType").jsonPrimitive.content)
        assertFalse(Json.encodeToJsonElement(PurchaseIntentRequestDto()).jsonObject.containsKey("eventRegistration"))
    }
}
