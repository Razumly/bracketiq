package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType

internal enum class EventDetailsMode {
    READ_ONLY,
    EDIT,
}

data class EventDetailsSectionVisibility(
    val hero: Boolean = true,
    val basics: Boolean = true,
    val registration: Boolean = true,
    val matchRules: Boolean = true,
    val staff: Boolean = true,
    val divisions: Boolean = true,
    val leagueScoring: Boolean = true,
    val schedule: Boolean = true,
) {
    companion object {
        val All = EventDetailsSectionVisibility()
        val None = EventDetailsSectionVisibility(
            hero = false,
            basics = false,
            registration = false,
            matchRules = false,
            staff = false,
            divisions = false,
            leagueScoring = false,
            schedule = false,
        )
    }
}

internal data class EventDetailsReadOnlyUiModel(
    val eventId: String,
    val basics: ReadOnlySectionModel,
    val registration: ReadOnlySectionModel,
    val matchRules: ReadOnlySectionModel,
    val staff: ReadOnlySectionModel,
    val divisions: ReadOnlySectionModel,
    val leagueScoring: ReadOnlySectionModel,
    val schedule: ReadOnlySectionModel,
)

internal data class ReadOnlySectionModel(
    val sectionId: String,
    val title: String,
    val summary: String? = null,
)

internal data class EventDetailsEditUiModel(
    val eventId: String,
    val mode: EventDetailsMode = EventDetailsMode.EDIT,
    val isNewEvent: Boolean,
    val basics: EditSectionModel,
    val registration: EditSectionModel,
    val matchRules: EditSectionModel,
    val staff: EditSectionModel,
    val divisions: EditSectionModel,
    val leagueScoring: EditSectionModel,
    val schedule: EditSectionModel,
)

internal data class EditSectionModel(
    val sectionId: String,
    val title: String,
    val summary: String? = null,
    val requiredMissingCount: Int = 0,
)

internal fun shouldShowMatchRulesSection(eventType: EventType): Boolean =
    eventType != EventType.EVENT && eventType != EventType.TRYOUT && eventType != EventType.WEEKLY_EVENT

internal fun selectableMobileEventTypes(
    isNewEvent: Boolean,
    rentalTimeLocked: Boolean,
    currentEventType: EventType,
): List<EventType> = EventType.entries.filterNot { eventType ->
    (isNewEvent && rentalTimeLocked && eventType == EventType.WEEKLY_EVENT) ||
        (eventType == EventType.TRYOUT && currentEventType != EventType.TRYOUT)
}

internal data class EventDetailsReadOnlyActions(
    val onOpenLocationMap: () -> Unit = {},
    val onMessageUser: (UserData) -> Unit = {},
    val onSendFriendRequest: (UserData) -> Unit = {},
    val onFollowUser: (UserData) -> Unit = {},
    val onUnfollowUser: (UserData) -> Unit = {},
    val onBlockUser: (UserData, Boolean) -> Unit = { _, _ -> },
    val onUnblockUser: (UserData) -> Unit = {},
)

internal data class EventDetailsEditActions(
    val onPlaceSelected: (MVPPlace?) -> Unit = {},
    val onEditEvent: (Event.() -> Event) -> Unit = {},
    val onEditTournament: (Event.() -> Event) -> Unit = {},
    val onAddCurrentUser: (Boolean) -> Unit = {},
    val onEventTypeSelected: (EventType) -> Unit = {},
    val onSportSelected: (String) -> Unit = {},
)
