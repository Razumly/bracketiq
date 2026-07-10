package com.razumly.mvp.core.data.dataTypes

import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlinx.serialization.Serializable

@Serializable
data class EventTag(
    val id: String? = null,
    val name: String = "",
    val slug: String = "",
    val eventCount: Int = 0,
    val isSystem: Boolean = false,
)

private const val MAX_EVENT_TAG_LENGTH = 40

private val eventTypeTags = mapOf(
    EventType.LEAGUE to EventTag(name = "League", slug = "league", isSystem = true),
    EventType.TOURNAMENT to EventTag(name = "Tournament", slug = "tournament", isSystem = true),
)

fun slugifyEventTagName(value: String): String {
    val slug = value
        .trim()
        .lowercase()
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
    return slug.ifBlank { "tag" }
}

fun EventTag.normalizedEventTag(): EventTag? {
    val normalizedName = name.replace(Regex("\\s+"), " ").trim().take(MAX_EVENT_TAG_LENGTH)
    if (normalizedName.isBlank()) return null
    val normalizedSlug = slug.trim().lowercase().ifBlank { slugifyEventTagName(normalizedName) }
    return copy(
        name = normalizedName,
        slug = normalizedSlug,
    )
}

fun EventTag.eventTagIdentity(): String =
    slug.trim().lowercase().ifBlank { slugifyEventTagName(name) }

fun EventTag.eventTagLabelWithCount(): String =
    "${name.trim()} ($eventCount)"

fun List<EventTag>.normalizedEventTags(): List<EventTag> {
    val seen = mutableSetOf<String>()
    return mapNotNull(EventTag::normalizedEventTag).filter { tag ->
        seen.add(tag.eventTagIdentity())
    }
}

fun lockedEventTypeTagSlugs(eventType: EventType): Set<String> =
    eventTypeTags[eventType]
        ?.let { setOf(it.eventTagIdentity()) }
        ?: emptySet()

fun reservedEventTypeTagSlugs(): Set<String> =
    eventTypeTags.values.map(EventTag::eventTagIdentity).toSet()

fun List<EventTag>.syncEventTypeTagsForEventType(eventType: EventType): List<EventTag> {
    val retainedTags = normalizedEventTags().filter { tag ->
        tag.eventTagIdentity() !in eventTypeTags.values.map(EventTag::eventTagIdentity).toSet()
    }
    val requiredTag = eventTypeTags[eventType]
    return if (requiredTag == null) {
        retainedTags
    } else {
        retainedTags + requiredTag
    }
}

fun Event.syncEventTypeTagsForEventType(): Event =
    copy(tags = tags.syncEventTypeTagsForEventType(eventType))
