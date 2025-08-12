package com.razumly.mvp.core.data.dataTypes

import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Serializable
@OptIn(ExperimentalTime::class)
sealed interface EventAbs : MVPDocument {
    val location: String
    val name: String
    val description: String
    val divisions: List<Division>
    val lat: Double
    val long: Double
    val fieldType: FieldType
    val start: Instant
    val end: Instant
    val price: Double
    val rating: Float?
    val imageUrl: String
    val maxParticipants: Int
    val teamSizeLimit: Int
    val lastUpdated: Instant
    val hostId: String
    val eventType: EventType
    val teamSignup: Boolean
    val singleDivision: Boolean
    val waitList: List<String>
    val freeAgents: List<String>
    val playerIds: List<String>
    val teamIds: List<String>
    val cancellationRefundHours: Int
    val registrationCutoffHours: Int
    val seedColor: Int
    val isTaxed: Boolean

    override val id: String
}

fun EventAbs.toMVPPlace() = MVPPlace(
    name = this.name,
    id = this.id,
    lat = this.lat,
    long = this.long,
    imageUrls = listOf(this.imageUrl)
)