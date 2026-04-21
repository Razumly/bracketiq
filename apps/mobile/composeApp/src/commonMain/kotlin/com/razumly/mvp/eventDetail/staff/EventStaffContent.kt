package com.razumly.mvp.eventDetail.staff

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.eventDetail.EventStaffRole
import com.razumly.mvp.eventDetail.PendingStaffInviteDraft
import com.razumly.mvp.eventDetail.displayName
import com.razumly.mvp.eventDetail.hasRole
import com.razumly.mvp.eventDetail.includesEventStaffRole
import com.razumly.mvp.eventDetail.label
import com.razumly.mvp.eventDetail.normalized
import com.razumly.mvp.eventDetail.normalizedStatusOrNull

private const val STAFF_LAZY_LIST_THRESHOLD = 4

@Composable
internal fun EditableStaffCardList(
    cards: List<StaffAssignmentCardModel>,
    emptyText: String,
    lazyListHeight: androidx.compose.ui.unit.Dp,
    cardContent: @Composable (StaffAssignmentCardModel) -> Unit,
) {
    if (cards.isEmpty()) {
        Text(
            text = emptyText,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    if (cards.size >= STAFF_LAZY_LIST_THRESHOLD) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .height(lazyListHeight),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(cards) { card ->
                cardContent(card)
            }
        }
        return
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        cards.forEach { card ->
            cardContent(card)
        }
    }
}

internal fun userDisplayName(user: UserData): String {
    val fullName = user.fullName.trim()
    return when {
        fullName.isNotBlank() -> fullName
        user.userName.trim().isNotBlank() -> user.userName.trim()
        else -> user.id
    }
}

internal data class StaffAssignmentCardModel(
    val key: String,
    val title: String,
    val subtitle: String? = null,
    val email: String? = null,
    val statusLabel: String? = null,
    val role: EventStaffRole,
    val userId: String? = null,
    val draftEmail: String? = null,
    val isDraft: Boolean = false,
)

private fun eventStaffStatusLabel(status: String?): String? = when (status?.trim()?.uppercase()) {
    "PENDING" -> "Pending"
    "DECLINED" -> "Declined"
    else -> null
}

internal fun buildAssignedStaffCards(
    role: EventStaffRole,
    userIds: List<String>,
    knownUsersById: Map<String, UserData>,
    staffInvites: List<Invite>,
): List<StaffAssignmentCardModel> {
    return userIds
        .map { userId -> userId.trim() }
        .filter(String::isNotBlank)
        .distinct()
        .map { userId ->
            val user = knownUsersById[userId]
            val invite = staffInvites.firstOrNull { candidate ->
                candidate.userId?.trim() == userId && candidate.includesEventStaffRole(role)
            }
            StaffAssignmentCardModel(
                key = "${role.name}:$userId",
                title = user?.let(::userDisplayName) ?: userId,
                email = invite?.email?.trim()?.takeIf(String::isNotBlank),
                statusLabel = eventStaffStatusLabel(invite?.normalizedStatusOrNull()),
                role = role,
                userId = userId,
            )
        }
}

internal fun buildDraftStaffCards(
    role: EventStaffRole,
    drafts: List<PendingStaffInviteDraft>,
): List<StaffAssignmentCardModel> {
    return drafts
        .map(PendingStaffInviteDraft::normalized)
        .filter { draft -> draft.hasRole(role) }
        .map { draft ->
            StaffAssignmentCardModel(
                key = "draft:${role.name}:${draft.email}",
                title = draft.displayName(),
                subtitle = role.label(),
                email = draft.email,
                statusLabel = "Email invite",
                role = role,
                draftEmail = draft.email,
                isDraft = true,
            )
        }
}

@Composable
internal fun StaffAssignmentCard(
    card: StaffAssignmentCardModel,
    onRemoveAssigned: (String, EventStaffRole) -> Unit,
    onRemoveDraft: (String, EventStaffRole) -> Unit,
    extraContent: (@Composable () -> Unit)? = null,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = card.title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
            card.subtitle?.takeIf(String::isNotBlank)?.let { subtitle ->
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            card.email?.takeIf(String::isNotBlank)?.let { email ->
                Text(
                    text = email,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            card.statusLabel?.takeIf(String::isNotBlank)?.let { statusLabel ->
                Text(
                    text = statusLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (statusLabel.equals("Declined", ignoreCase = true)) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                )
            }
            extraContent?.invoke()
            val removeAction: (() -> Unit)? = when {
                    card.isDraft && !card.draftEmail.isNullOrBlank() -> {
                        { onRemoveDraft(card.draftEmail, card.role) }
                    }

                    !card.userId.isNullOrBlank() -> {
                        { onRemoveAssigned(card.userId, card.role) }
                    }

                    else -> null
                }
            removeAction?.let { onRemove ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        Text(
                            text = "Remove",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier
                                .clickable(onClick = onRemove)
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                }
        }
    }
}