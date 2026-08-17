package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.InvitesResponseDto
import io.ktor.http.encodeURLQueryComponent

private const val INVITE_PAGE_LIMIT = 100

/** Fetches the complete actionable invite set before callers replace Room state. */
internal suspend fun fetchAllPendingInvitePages(
    api: MvpApiClient,
    userId: String,
    type: String? = null,
): List<Invite> {
    val baseParams = buildList {
        add("userId=${userId.encodeURLQueryComponent()}")
        type?.let { inviteType -> add("type=${inviteType.encodeURLQueryComponent()}") }
        add("status=PENDING")
        add("limit=$INVITE_PAGE_LIMIT")
    }
    val invitesById = linkedMapOf<String, Invite>()
    val seenCursors = mutableSetOf<String>()
    var cursor: String? = null

    do {
        val params = buildList {
            addAll(baseParams)
            cursor?.let { add("cursor=${it.encodeURLQueryComponent()}") }
        }.joinToString("&")
        val response = api.get<InvitesResponseDto>("api/invites?$params")
        response.invites.forEach { invite ->
            val inviteId = invite.id.trim()
            if (inviteId.isNotEmpty()) invitesById[inviteId] = invite
        }
        val nextCursor = response.nextCursor?.trim()?.takeIf(String::isNotEmpty)
        check(nextCursor == null || nextCursor != cursor && seenCursors.add(nextCursor)) {
            "Invite pagination returned a repeated cursor"
        }
        cursor = nextCursor
    } while (cursor != null)

    return invitesById.values.toList()
}
