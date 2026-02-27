package com.razumly.mvp.core.data.util

import androidx.room.TypeConverter
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
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
