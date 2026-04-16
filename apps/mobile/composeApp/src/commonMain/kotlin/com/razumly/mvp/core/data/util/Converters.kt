package com.razumly.mvp.core.data.util

import androidx.room.TypeConverter
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamStaffAssignment
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.normalizeDivisionDetails
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
class Converters {
    // List<String> converter
    @TypeConverter
    fun fromStringList(value: List<String>): String {
        return Json.encodeToString(value)
    }

    @TypeConverter
    fun toStringList(value: String): List<String> {
        return Json.decodeFromString(value)
    }

    // List<Int> converter
    @TypeConverter
    fun fromIntList(value: List<Int>): String {
        return Json.encodeToString(value)
    }

    @TypeConverter
    fun toIntList(value: String): List<Int> {
        return Json.decodeFromString(value)
    }

    // List<Double> converter
    @TypeConverter
    fun fromDoubleList(value: List<Double>): String = Json.encodeToString(value)

    @TypeConverter
    fun toDoubleList(value: String): List<Double> = Json.decodeFromString(value)

    // Instant converter
    @TypeConverter
    @OptIn(ExperimentalTime::class)
    fun fromInstant(instant: Instant): Long {
        return instant.toEpochMilliseconds()
    }

    @TypeConverter
    @OptIn(ExperimentalTime::class)
    fun fromNullableInstant(instant: Instant?): Long? {
        return instant?.toEpochMilliseconds()
    }

    @TypeConverter
    @OptIn(ExperimentalTime::class)
    fun toInstant(epochMilli: Long): Instant {
        return Instant.fromEpochMilliseconds(epochMilli)
    }

    @TypeConverter
    @OptIn(ExperimentalTime::class)
    fun toNullableInstant(epochMilli: Long?): Instant? {
        return epochMilli?.let { Instant.fromEpochMilliseconds(it) }
    }

    @TypeConverter
    fun fromEventType(eventType: EventType): String = eventType.name

    @TypeConverter
    fun toEventType(value: String): EventType = EventType.valueOf(value)

    @TypeConverter
    fun fromOfficialSchedulingMode(value: OfficialSchedulingMode): String = value.name

    @TypeConverter
    fun toOfficialSchedulingMode(value: String): OfficialSchedulingMode =
        runCatching { OfficialSchedulingMode.valueOf(value.trim().uppercase()) }
            .getOrDefault(OfficialSchedulingMode.SCHEDULE)

    @TypeConverter
    fun fromEventOfficialPositions(value: List<EventOfficialPosition>): String =
        Json.encodeToString(value)

    @TypeConverter
    fun toEventOfficialPositions(value: String): List<EventOfficialPosition> =
        runCatching { Json.decodeFromString<List<EventOfficialPosition>>(value) }
            .getOrDefault(emptyList())

    @TypeConverter
    fun fromEventOfficials(value: List<EventOfficial>): String =
        Json.encodeToString(value)

    @TypeConverter
    fun toEventOfficials(value: String): List<EventOfficial> =
        runCatching { Json.decodeFromString<List<EventOfficial>>(value) }
            .getOrDefault(emptyList())

    @TypeConverter
    fun fromMatchOfficialAssignments(value: List<MatchOfficialAssignment>): String =
        Json.encodeToString(value)

    @TypeConverter
    fun toMatchOfficialAssignments(value: String): List<MatchOfficialAssignment> =
        runCatching { Json.decodeFromString<List<MatchOfficialAssignment>>(value) }
            .getOrDefault(emptyList())

    @TypeConverter
    fun fromMatchSegments(value: List<MatchSegmentMVP>): String =
        Json.encodeToString(value)

    @TypeConverter
    fun toMatchSegments(value: String): List<MatchSegmentMVP> =
        runCatching { Json.decodeFromString<List<MatchSegmentMVP>>(value) }
            .getOrDefault(emptyList())

    @TypeConverter
    fun fromMatchIncidents(value: List<MatchIncidentMVP>): String =
        Json.encodeToString(value)

    @TypeConverter
    fun toMatchIncidents(value: String): List<MatchIncidentMVP> =
        runCatching { Json.decodeFromString<List<MatchIncidentMVP>>(value) }
            .getOrDefault(emptyList())

    @TypeConverter
    fun fromResolvedMatchRules(value: ResolvedMatchRulesMVP?): String? =
        value?.let { Json.encodeToString(it) }

    @TypeConverter
    fun toResolvedMatchRules(value: String?): ResolvedMatchRulesMVP? =
        value?.takeIf { it.isNotBlank() }?.let {
            runCatching { Json.decodeFromString<ResolvedMatchRulesMVP>(it) }.getOrNull()
        }

    @TypeConverter
    fun fromMatchRulesConfig(value: MatchRulesConfigMVP?): String? =
        value?.let { Json.encodeToString(it) }

    @TypeConverter
    fun toMatchRulesConfig(value: String?): MatchRulesConfigMVP? =
        value?.takeIf { it.isNotBlank() }?.let {
            runCatching { Json.decodeFromString<MatchRulesConfigMVP>(it) }.getOrNull()
        }

    @TypeConverter
    fun fromTeamPlayerRegistrations(value: List<TeamPlayerRegistration>): String =
        Json.encodeToString(value)

    @TypeConverter
    fun toTeamPlayerRegistrations(value: String): List<TeamPlayerRegistration> =
        runCatching { Json.decodeFromString<List<TeamPlayerRegistration>>(value) }
            .getOrDefault(emptyList())

    @TypeConverter
    fun fromTeamStaffAssignments(value: List<TeamStaffAssignment>): String =
        Json.encodeToString(value)

    @TypeConverter
    fun toTeamStaffAssignments(value: String): List<TeamStaffAssignment> =
        runCatching { Json.decodeFromString<List<TeamStaffAssignment>>(value) }
            .getOrDefault(emptyList())
}

class DivisionConverters {
    @TypeConverter
    fun fromDivisionsList(divisions: List<String>?): String {
        return divisions?.normalizeDivisionIdentifiers()?.joinToString(separator = ",") ?: ""
    }

    @TypeConverter
    fun toDivisionsList(data: String?): List<String> {
        if (data.isNullOrEmpty()) return emptyList()
        val trimmed = data.trim()
        val rawValues = if (trimmed.startsWith("[")) {
            runCatching { Json.decodeFromString<List<String>>(trimmed) }
                .getOrDefault(emptyList())
        } else {
            trimmed.split(",")
        }
        return rawValues.normalizeDivisionIdentifiers()
    }
}

class DivisionDetailConverters {
    @TypeConverter
    fun fromDivisionDetails(details: List<DivisionDetail>?): String {
        if (details.isNullOrEmpty()) return "[]"
        return Json.encodeToString(details.normalizeDivisionDetails())
    }

    @TypeConverter
    fun toDivisionDetails(data: String?): List<DivisionDetail> {
        if (data.isNullOrBlank()) return emptyList()
        return runCatching {
            Json.decodeFromString<List<DivisionDetail>>(data)
        }.getOrDefault(emptyList()).normalizeDivisionDetails()
    }
}
