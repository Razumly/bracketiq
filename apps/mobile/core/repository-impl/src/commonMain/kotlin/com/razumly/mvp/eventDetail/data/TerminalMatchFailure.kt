package com.razumly.mvp.eventDetail.data

import com.razumly.mvp.core.network.dto.TerminalMatchResultDto

class TerminalMatchFailure(val operationId: String, val code: String, message: String, cause: Throwable? = null) :
    Exception(message, cause)

class TerminalMatchNoChange(val result: TerminalMatchResultDto) :
    Exception("The terminal operation was already applied or made no changes. Refresh the Schedule.")

class TerminalMatchSyncPending(val result: TerminalMatchResultDto, cause: Throwable) :
    Exception("The terminal operation was saved. The local Schedule still needs a refresh.", cause)
