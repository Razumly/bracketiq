package com.razumly.mvp.core.data.util

import androidx.room.TypeConverter
import com.razumly.mvp.core.data.dataTypes.EventAuthorityCapabilities
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class EventAuthorityConverters {
    @TypeConverter
    fun fromCapabilities(value: EventAuthorityCapabilities?): String? =
        value?.let { Json.encodeToString(it) }

    @TypeConverter
    fun toCapabilities(value: String?): EventAuthorityCapabilities? =
        value?.let { Json.decodeFromString<EventAuthorityCapabilities>(it) }
}
