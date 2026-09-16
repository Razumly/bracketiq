package com.razumly.mvp.eventDetail.data

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.network.dto.TerminalMatchResultDto
import kotlinx.serialization.Serializable

/** Keep the accepted result in the outbox until the Room transaction succeeds. */
@Serializable
internal data class TerminalMatchCommit(
    val result: TerminalMatchResultDto,
    val beforeMatches: List<MatchMVP>,
    val beforeEventEnd: String?,
)
