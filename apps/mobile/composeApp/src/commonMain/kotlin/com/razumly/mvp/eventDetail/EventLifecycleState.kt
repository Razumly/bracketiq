package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event

internal enum class EditableLifecycleState(
    val label: String,
) {
    PUBLISHED("Published"),
    PRIVATE("Private"),
    DRAFT("Draft"),
}

internal fun Event.toEditableLifecycleState(): EditableLifecycleState {
    return when (state.trim().uppercase()) {
        "PUBLISHED" -> EditableLifecycleState.PUBLISHED
        "PRIVATE" -> EditableLifecycleState.PRIVATE
        else -> EditableLifecycleState.DRAFT
    }
}

internal fun EditableLifecycleState.toEventState(currentState: String): String {
    return when (this) {
        EditableLifecycleState.PUBLISHED -> "PUBLISHED"
        EditableLifecycleState.PRIVATE -> "PRIVATE"
        EditableLifecycleState.DRAFT ->
            if (currentState.trim().uppercase() == "DRAFT") {
                "DRAFT"
            } else {
                "UNPUBLISHED"
            }
    }
}
