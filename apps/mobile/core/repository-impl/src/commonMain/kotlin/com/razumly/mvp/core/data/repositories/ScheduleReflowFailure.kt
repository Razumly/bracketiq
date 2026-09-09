package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.dto.ScheduleReflowResultDto
import com.razumly.mvp.core.network.dto.ScheduleReflowStatus

class ScheduleReflowFailure(val result: ScheduleReflowResultDto) : Exception(
    when (result.status) {
        ScheduleReflowStatus.INFEASIBLE -> "The affected Matches cannot be scheduled with the current constraints. The Schedule did not change."
        ScheduleReflowStatus.SEARCH_LIMIT -> "The Reflow search reached its limit. The Schedule did not change."
        ScheduleReflowStatus.STALE -> "The Schedule changed. Load its current revision and try again."
        else -> "Unexpected Reflow failure."
    },
)

class ScheduleReflowSyncPending(val result: ScheduleReflowResultDto, cause: Throwable) : Exception(
    "Reflow succeeded on the server. The local Schedule could not be refreshed. Reload the Event.", cause,
)
