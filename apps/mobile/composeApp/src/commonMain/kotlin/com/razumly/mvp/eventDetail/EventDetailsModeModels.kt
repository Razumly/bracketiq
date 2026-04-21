package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType

internal enum class EventDetailsMode {
    READ_ONLY,
    EDIT,
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

internal data class EventDetailsReadOnlyActions(
    val onOpenLocationMap: () -> Unit = {},
    val onMessageUser: (UserData) -> Unit = {},
    val onSendFriendRequest: (UserData) -> Unit = {},
    val onFollowUser: (UserData) -> Unit = {},
    val onUnfollowUser: (UserData) -> Unit = {},
    val onBlockUser: (UserData, Boolean) -> Unit = { _, _ -> },
    val onUnblockUser: (UserData) -> Unit = {},
    val onFollowOrganization: (Organization) -> Unit = {},
)

internal data class EventDetailsEditActions(
    val onPlaceSelected: (MVPPlace?) -> Unit = {},
    val onEditEvent: (Event.() -> Event) -> Unit = {},
    val onEditTournament: (Event.() -> Event) -> Unit = {},
    val onAddCurrentUser: (Boolean) -> Unit = {},
    val onEventTypeSelected: (EventType) -> Unit = {},
    val onSportSelected: (String) -> Unit = {},
)
