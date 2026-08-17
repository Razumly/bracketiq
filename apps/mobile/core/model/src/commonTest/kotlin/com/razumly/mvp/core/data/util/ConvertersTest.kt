package com.razumly.mvp.core.data.util

import kotlinx.serialization.SerializationException
import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class ConvertersTest {
    @Test
    fun malformed_json_throws_for_every_room_json_converter() {
        val converters = Converters()
        val decoders: List<Pair<String, () -> Any?>> = listOf(
            "string list" to { converters.toStringList("not-json") },
            "notification settings" to { converters.toNotificationSettings("not-json") },
            "int list" to { converters.toIntList("not-json") },
            "double list" to { converters.toDoubleList("not-json") },
            "event official positions" to { converters.toEventOfficialPositions("not-json") },
            "event officials" to { converters.toEventOfficials("not-json") },
            "event tags" to { converters.toEventTags("not-json") },
            "match official assignments" to { converters.toMatchOfficialAssignments("not-json") },
            "match segments" to { converters.toMatchSegments("not-json") },
            "match incidents" to { converters.toMatchIncidents("not-json") },
            "resolved match rules" to { converters.toResolvedMatchRules("not-json") },
            "match rules config" to { converters.toMatchRulesConfig("not-json") },
            "team player registrations" to { converters.toTeamPlayerRegistrations("not-json") },
            "team staff assignments" to { converters.toTeamStaffAssignments("not-json") },
            "manual payment links" to { converters.toManualPaymentLinks("not-json") },
            "division list JSON" to { DivisionConverters().toDivisionsList("[not-json") },
            "division details" to { DivisionDetailConverters().toDivisionDetails("not-json") },
        )

        decoders.forEach { (label, decode) ->
            assertFailsWith<SerializationException>("$label must surface corrupt persisted JSON") {
                decode()
            }
        }
    }

    @Test
    fun absent_nullable_json_remains_absent_instead_of_being_treated_as_corruption() {
        val converters = Converters()

        assertNull(converters.toResolvedMatchRules(null))
        assertNull(converters.toResolvedMatchRules("   "))
        assertNull(converters.toMatchRulesConfig(null))
        assertNull(converters.toMatchRulesConfig("   "))
    }
}
