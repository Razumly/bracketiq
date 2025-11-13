package com.razumly.mvp.core.data.util

import androidx.room.TypeConverter
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.dataTypes.enums.EventType
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

    // Instant converter
    @TypeConverter
    @OptIn(ExperimentalTime::class)
    fun fromInstant(instant: Instant): Long {
        return instant.toEpochMilliseconds()
    }

    @TypeConverter
    @OptIn(ExperimentalTime::class)
    fun toInstant(epochMilli: Long): Instant {
        return Instant.fromEpochMilliseconds(epochMilli)
    }

    @TypeConverter
    fun fromDivisionsList(divisions: List<Division>?): String {
        return divisions?.joinToString(separator = ",") { it.name } ?: ""
    }

    @TypeConverter
    fun toDivisionsList(data: String?): List<Division> {
        if (data.isNullOrEmpty()) return emptyList()
        return data.split(",").map { Division.valueOf(it) }
    }

    @TypeConverter
    fun fromEventType(eventType: EventType): String = eventType.name

    @TypeConverter
    fun toEventType(value: String): EventType = EventType.valueOf(value)
}
