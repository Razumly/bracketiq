package com.razumly.mvp.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.ProfileDocumentCard
import com.razumly.mvp.core.data.repositories.ProfileDocumentType
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.util.MoneyInputUtils
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

@Composable
fun ProfilePaymentsScreen(component: ProfileComponent) {
    val hasStripeAccount by component.isStripeAccountConnected.collectAsState()

    ProfileSectionScaffold(
        title = "Payments",
        description = if (hasStripeAccount) {
            "Manage your Stripe account to update payout details."
        } else {
            "Connect a Stripe account to accept payments for your events and rentals."
        },
        onBack = component::onBackClicked,
    ) {
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = if (hasStripeAccount) component::manageStripeAccount else component::manageStripeAccountOnboarding,
        ) {
            Text(if (hasStripeAccount) "Manage Stripe Account" else "Connect Stripe Account")
        }

    }
}

@Composable
fun ProfilePaymentPlansScreen(component: ProfileComponent) {
    val plansState by component.paymentPlansState.collectAsState()
    val activeBillPaymentId by component.activeBillPaymentId.collectAsState()

    LaunchedEffect(component) {
        component.refreshPaymentPlans()
    }

    ProfileSectionScaffold(
        title = "Payment Plans",
        description = "Review and manage installment plans for your account.",
        onBack = component::onBackClicked,
        onRefresh = component::refreshPaymentPlans,
        isRefreshing = plansState.isLoading,
    ) {
        SectionHeaderRow(title = "Bills")

        plansState.error?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        when {
            plansState.isLoading -> {
                Text(
                    text = "Loading payment plans...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            plansState.plans.isEmpty() -> {
                Text(
                    text = "No payment plans are available.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            else -> {
                plansState.plans.forEach { paymentPlan ->
                    PaymentPlanCard(
                        paymentPlan = paymentPlan,
                        isProcessing = activeBillPaymentId == paymentPlan.bill.id,
                        onPayNextInstallment = { component.payNextInstallment(paymentPlan) },
                    )
                }
            }
        }
    }
}

@Composable
fun ProfileMembershipsScreen(component: ProfileComponent) {
    val membershipsState by component.membershipsState.collectAsState()
    val activeMembershipActionId by component.activeMembershipActionId.collectAsState()

    LaunchedEffect(component) {
        component.refreshMemberships()
    }

    ProfileSectionScaffold(
        title = "Memberships",
        description = "Track recurring memberships and subscription status.",
        onBack = component::onBackClicked,
        onRefresh = component::refreshMemberships,
        isRefreshing = membershipsState.isLoading,
    ) {
        SectionHeaderRow(title = "Active Memberships")

        membershipsState.error?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        when {
            membershipsState.isLoading -> {
                Text(
                    text = "Loading memberships...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            membershipsState.memberships.isEmpty() -> {
                Text(
                    text = "No active memberships.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            else -> {
                membershipsState.memberships.forEach { membership ->
                    MembershipCard(
                        membership = membership,
                        isProcessing = activeMembershipActionId == membership.subscription.id,
                        onCancel = { component.cancelMembership(membership) },
                        onRestart = { component.restartMembership(membership) },
                    )
                }
            }
        }
    }
}

@Composable
fun ProfileEventTemplatesScreen(component: ProfileComponent) {
    val templatesState by component.eventTemplatesState.collectAsState()

    LaunchedEffect(component) {
        component.refreshEventTemplates()
    }

    ProfileSectionScaffold(
        title = "Event Templates",
        description = "Reusable templates for personal (non-organization) events.",
        onBack = component::onBackClicked,
        onRefresh = component::refreshEventTemplates,
        isRefreshing = templatesState.isLoading,
    ) {
        templatesState.error?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        when {
            templatesState.isLoading && templatesState.templates.isEmpty() -> {
                Text(
                    text = "Loading event templates...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            templatesState.templates.isEmpty() -> {
                Text(
                    text = "No event templates yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            else -> {
                templatesState.templates.forEach { template ->
                    EventTemplateCard(
                        template = template,
                        onOpenTemplate = { component.openEventTemplate(template) },
                    )
                }
            }
        }
    }
}

@Composable
fun ProfileChildrenScreen(component: ProfileComponent) {
    val childrenState by component.childrenState.collectAsState()
    var childFirstName by rememberSaveable { mutableStateOf("") }
    var childLastName by rememberSaveable { mutableStateOf("") }
    var childEmail by rememberSaveable { mutableStateOf("") }
    var childDateOfBirth by rememberSaveable { mutableStateOf("") }
    var showChildBirthdayPicker by rememberSaveable { mutableStateOf(false) }
    var childRelationship by rememberSaveable { mutableStateOf("parent") }
    var showAddChildForm by rememberSaveable { mutableStateOf(false) }
    var editingChildUserId by rememberSaveable { mutableStateOf<String?>(null) }

    var linkChildEmail by rememberSaveable { mutableStateOf("") }
    var linkChildUserId by rememberSaveable { mutableStateOf("") }
    var linkRelationship by rememberSaveable { mutableStateOf("parent") }

    val relationshipOptions = remember {
        listOf(
            DropdownOption(value = "parent", label = "Parent"),
            DropdownOption(value = "guardian", label = "Guardian"),
        )
    }

    var wasCreatingChild by remember { mutableStateOf(false) }
    var wasUpdatingChild by remember { mutableStateOf(false) }
    var wasLinkingChild by remember { mutableStateOf(false) }
    val isEditingChild = editingChildUserId != null
    val isSavingChild = childrenState.isCreatingChild || childrenState.isUpdatingChild
    val childFormError = if (isEditingChild) childrenState.updateError else childrenState.createError

    val resetChildForm = {
        childFirstName = ""
        childLastName = ""
        childEmail = ""
        childDateOfBirth = ""
        childRelationship = "parent"
        editingChildUserId = null
    }

    LaunchedEffect(component) {
        component.refreshChildren()
    }

    LaunchedEffect(childrenState.isCreatingChild, childrenState.createError) {
        if (wasCreatingChild && !childrenState.isCreatingChild && childrenState.createError == null) {
            resetChildForm()
            showAddChildForm = false
        }
        wasCreatingChild = childrenState.isCreatingChild
    }

    LaunchedEffect(childrenState.isUpdatingChild, childrenState.updateError) {
        if (wasUpdatingChild && !childrenState.isUpdatingChild && childrenState.updateError == null) {
            resetChildForm()
            showAddChildForm = false
        }
        wasUpdatingChild = childrenState.isUpdatingChild
    }

    LaunchedEffect(childrenState.isLinkingChild, childrenState.linkError) {
        if (wasLinkingChild && !childrenState.isLinkingChild && childrenState.linkError == null) {
            linkChildEmail = ""
            linkChildUserId = ""
            linkRelationship = "parent"
        }
        wasLinkingChild = childrenState.isLinkingChild
    }

    ProfileSectionScaffold(
        title = "Children",
        description = "Manage linked child accounts and guardian relationships.",
        onBack = component::onBackClicked,
        onRefresh = component::refreshChildren,
        isRefreshing = childrenState.isLoading || childrenState.isLoadingJoinRequests,
    ) {
        SectionHeaderRow(title = "Child details")
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                editingChildUserId = null
                showAddChildForm = true
            },
        ) {
            Text("Add child")
        }

        if (showAddChildForm) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                ),
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = if (isEditingChild) "Edit child" else "Add a child",
                        style = MaterialTheme.typography.titleMedium,
                    )

                    childFormError?.let { message ->
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }

                    PlatformTextField(
                        modifier = Modifier.fillMaxWidth(),
                        value = childFirstName,
                        onValueChange = { childFirstName = it },
                        label = "First name",
                    )
                    PlatformTextField(
                        modifier = Modifier.fillMaxWidth(),
                        value = childLastName,
                        onValueChange = { childLastName = it },
                        label = "Last name",
                    )
                    PlatformTextField(
                        modifier = Modifier.fillMaxWidth(),
                        value = childEmail,
                        onValueChange = { childEmail = it },
                        label = "Email (optional)",
                        keyboardType = "email",
                    )
                    PlatformTextField(
                        modifier = Modifier.fillMaxWidth(),
                        value = childDateOfBirth,
                        onValueChange = {},
                        label = "Date of birth",
                        placeholder = "Select date",
                        supportingText = "Date only",
                        readOnly = true,
                        onTap = { showChildBirthdayPicker = true },
                    )
                    PlatformDropdown(
                        selectedValue = childRelationship,
                        onSelectionChange = { childRelationship = it },
                        options = relationshipOptions,
                        label = "Relationship",
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Button(
                            modifier = Modifier.weight(1f),
                            onClick = {
                                val activeChildUserId = editingChildUserId
                                if (activeChildUserId != null) {
                                    component.updateChild(
                                        childUserId = activeChildUserId,
                                        firstName = childFirstName,
                                        lastName = childLastName,
                                        dateOfBirth = childDateOfBirth,
                                        email = childEmail,
                                        relationship = childRelationship,
                                    )
                                } else {
                                    component.createChild(
                                        firstName = childFirstName,
                                        lastName = childLastName,
                                        dateOfBirth = childDateOfBirth,
                                        email = childEmail,
                                        relationship = childRelationship,
                                    )
                                }
                            },
                            enabled = !isSavingChild,
                        ) {
                            val buttonText = when {
                                childrenState.isUpdatingChild -> "Saving..."
                                childrenState.isCreatingChild -> "Adding child..."
                                isEditingChild -> "Save child"
                                else -> "Add child"
                            }
                            Text(buttonText)
                        }
                        Button(
                            modifier = Modifier.weight(1f),
                            onClick = {
                                resetChildForm()
                                showAddChildForm = false
                            },
                            enabled = !isSavingChild,
                        ) {
                            Text("Cancel")
                        }
                    }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
            ),
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "Link an existing child",
                    style = MaterialTheme.typography.titleMedium,
                )

                childrenState.linkError?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                PlatformTextField(
                    value = linkChildEmail,
                    onValueChange = { linkChildEmail = it },
                    label = "Child email",
                    keyboardType = "email",
                )
                PlatformTextField(
                    value = linkChildUserId,
                    onValueChange = { linkChildUserId = it },
                    label = "Child user ID",
                )
                PlatformDropdown(
                    selectedValue = linkRelationship,
                    onSelectionChange = { linkRelationship = it },
                    options = relationshipOptions,
                    label = "Relationship",
                )
                Text(
                    text = "Provide either the child email or user ID to link an existing account.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        component.linkChild(
                            childEmail = linkChildEmail,
                            childUserId = linkChildUserId,
                            relationship = linkRelationship,
                        )
                    },
                    enabled = !childrenState.isLinkingChild,
                ) {
                    Text(if (childrenState.isLinkingChild) "Linking child..." else "Link child")
                }
            }
        }

        SectionHeaderRow(title = "Pending join requests")

        childrenState.joinRequestsError?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        when {
            childrenState.isLoadingJoinRequests -> {
                Text(
                    text = "Loading join requests...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            childrenState.joinRequests.isEmpty() -> {
                Text(
                    text = "No pending join requests.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            else -> {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    childrenState.joinRequests.forEach { request ->
                        val isResolving = childrenState.activeJoinRequestId == request.registrationId
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                            ),
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text(
                                    text = "${request.childFullName} requested to join ${request.eventName}",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    text = "Consent status: ${request.consentStatus ?: "guardian_approval_required"}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                request.requestedAt?.let { requestedAt ->
                                    Text(
                                        text = "Requested: ${formatDateForDisplay(requestedAt)}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                if (!request.childHasEmail) {
                                    Text(
                                        text = "Child email is missing. Approval can proceed, but child-signature links stay pending.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.error,
                                    )
                                }
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Button(
                                        modifier = Modifier.weight(1f),
                                        onClick = { component.approveChildJoinRequest(request.registrationId) },
                                        enabled = !isResolving,
                                    ) {
                                        Text(if (isResolving) "Working..." else "Approve")
                                    }
                                    Button(
                                        modifier = Modifier.weight(1f),
                                        onClick = { component.declineChildJoinRequest(request.registrationId) },
                                        enabled = !isResolving,
                                    ) {
                                        Text(if (isResolving) "Working..." else "Decline")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        SectionHeaderRow(title = "Children")

        childrenState.error?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        when {
            childrenState.isLoading -> {
                Text(
                    text = "Loading children...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            childrenState.children.isEmpty() -> {
                Text(
                    text = "No children linked yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            else -> {
                ChildrenGrid(
                    children = childrenState.children,
                    onEditChild = { child ->
                        childFirstName = child.firstName
                        childLastName = child.lastName
                        childEmail = child.email.orEmpty()
                        childDateOfBirth = normalizeDateInput(child.dateOfBirth)
                        childRelationship = child.relationship
                            ?.trim()
                            ?.takeIf(String::isNotBlank)
                            ?: "parent"
                        editingChildUserId = child.userId
                        showAddChildForm = true
                    },
                )
            }
        }
    }

    PlatformDateTimePicker(
        onDateSelected = { selected ->
            childDateOfBirth = selected
                ?.toLocalDateTime(TimeZone.currentSystemDefault())
                ?.date
                ?.toString()
                .orEmpty()
            showChildBirthdayPicker = false
        },
        onDismissRequest = { showChildBirthdayPicker = false },
        showPicker = showChildBirthdayPicker,
        getTime = false,
        canSelectPast = true,
    )
}

@Composable
fun ProfileConnectionsScreen(component: ProfileComponent) {
    val state by component.connectionsState.collectAsState()
    val currentUser = state.currentUser

    LaunchedEffect(component) {
        component.refreshConnections()
    }

    ProfileSectionScaffold(
        title = "Connections",
        description = "Manage friend requests, friends, and following.",
        onBack = component::onBackClicked,
        onRefresh = component::refreshConnections,
        isRefreshing = state.isLoading,
    ) {
        SectionHeaderRow(title = "Find users")
        PlatformTextField(
            modifier = Modifier.fillMaxWidth(),
            value = state.searchQuery,
            onValueChange = component::searchConnections,
            label = "Search by name or username",
        )

        when {
            state.isSearching -> {
                Text(
                    text = "Searching...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            state.searchQuery.trim().length < 2 -> {
                Text(
                    text = "Enter at least 2 characters to search.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            state.searchResults.isEmpty() -> {
                Text(
                    text = "No users found.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            else -> {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.searchResults.forEach { candidate ->
                        val candidateId = candidate.id
                        val isFriend = currentUser?.friendIds?.contains(candidateId) == true
                        val isFollowing = currentUser?.followingIds?.contains(candidateId) == true
                        val hasIncomingRequest = currentUser?.friendRequestIds?.contains(candidateId) == true
                        val hasOutgoingRequest = currentUser?.friendRequestSentIds?.contains(candidateId) == true
                        val isActionInProgress = state.activeUserId == candidateId

                        ConnectionUserCard(
                            user = candidate,
                            isActionInProgress = isActionInProgress,
                            primaryActions = {
                                when {
                                    isFriend -> {
                                        Button(
                                            modifier = Modifier.weight(1f),
                                            onClick = { component.removeFriend(candidate) },
                                            enabled = !isActionInProgress,
                                        ) {
                                            Text(if (isActionInProgress) "Working..." else "Remove friend")
                                        }
                                    }

                                    hasIncomingRequest -> {
                                        Button(
                                            modifier = Modifier.weight(1f),
                                            onClick = { component.acceptFriendRequest(candidate) },
                                            enabled = !isActionInProgress,
                                        ) {
                                            Text(if (isActionInProgress) "Working..." else "Accept")
                                        }
                                        Button(
                                            modifier = Modifier.weight(1f),
                                            onClick = { component.declineFriendRequest(candidate) },
                                            enabled = !isActionInProgress,
                                        ) {
                                            Text(if (isActionInProgress) "Working..." else "Decline")
                                        }
                                    }

                                    hasOutgoingRequest -> {
                                        Button(
                                            modifier = Modifier.weight(1f),
                                            onClick = {},
                                            enabled = false,
                                        ) {
                                            Text("Request sent")
                                        }
                                    }

                                    else -> {
                                        Button(
                                            modifier = Modifier.weight(1f),
                                            onClick = { component.sendFriendRequest(candidate) },
                                            enabled = !isActionInProgress,
                                        ) {
                                            Text(if (isActionInProgress) "Working..." else "Add friend")
                                        }
                                    }
                                }
                            },
                            secondaryActions = {
                                Button(
                                    modifier = Modifier.fillMaxWidth(),
                                    onClick = {
                                        if (isFollowing) {
                                            component.unfollowUser(candidate)
                                        } else {
                                            component.followUser(candidate)
                                        }
                                    },
                                    enabled = !isActionInProgress,
                                ) {
                                    when {
                                        isActionInProgress -> Text("Working...")
                                        isFollowing -> Text("Unfollow")
                                        else -> Text("Follow")
                                    }
                                }
                            },
                        )
                    }
                }
            }
        }

        state.error?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        SectionHeaderRow(title = "Incoming friend requests")
        if (state.isLoading) {
            Text(
                text = "Loading friend requests...",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else if (state.incomingFriendRequests.isEmpty()) {
            Text(
                text = "No pending friend requests.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.incomingFriendRequests.forEach { requester ->
                    val isActionInProgress = state.activeUserId == requester.id
                    ConnectionUserCard(
                        user = requester,
                        isActionInProgress = isActionInProgress,
                        primaryActions = {
                            Button(
                                modifier = Modifier.weight(1f),
                                onClick = { component.acceptFriendRequest(requester) },
                                enabled = !isActionInProgress,
                            ) {
                                Text(if (isActionInProgress) "Working..." else "Accept")
                            }
                            Button(
                                modifier = Modifier.weight(1f),
                                onClick = { component.declineFriendRequest(requester) },
                                enabled = !isActionInProgress,
                            ) {
                                Text(if (isActionInProgress) "Working..." else "Decline")
                            }
                        },
                    )
                }
            }
        }

        SectionHeaderRow(title = "Friends")
        if (state.isLoading) {
            Text(
                text = "Loading friends...",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else if (state.friends.isEmpty()) {
            Text(
                text = "No friends yet.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.friends.forEach { friend ->
                    val isActionInProgress = state.activeUserId == friend.id
                    ConnectionUserCard(
                        user = friend,
                        isActionInProgress = isActionInProgress,
                        primaryActions = {
                            Button(
                                modifier = Modifier.fillMaxWidth(),
                                onClick = { component.removeFriend(friend) },
                                enabled = !isActionInProgress,
                            ) {
                                Text(if (isActionInProgress) "Working..." else "Remove friend")
                            }
                        },
                    )
                }
            }
        }

        SectionHeaderRow(title = "Following")
        if (state.isLoading) {
            Text(
                text = "Loading following users...",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else if (state.following.isEmpty()) {
            Text(
                text = "Not following anyone yet.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.following.forEach { followedUser ->
                    val isActionInProgress = state.activeUserId == followedUser.id
                    ConnectionUserCard(
                        user = followedUser,
                        isActionInProgress = isActionInProgress,
                        primaryActions = {
                            Button(
                                modifier = Modifier.fillMaxWidth(),
                                onClick = { component.unfollowUser(followedUser) },
                                enabled = !isActionInProgress,
                            ) {
                                Text(if (isActionInProgress) "Working..." else "Unfollow")
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
fun ProfileDocumentsScreen(component: ProfileComponent) {
    val documentsState by component.documentsState.collectAsState()
    val activeDocumentActionId by component.activeDocumentActionId.collectAsState()
    val textSignaturePrompt by component.textSignaturePrompt.collectAsState()
    var textPreviewDocument by remember { mutableStateOf<ProfileDocumentCard?>(null) }

    LaunchedEffect(component) {
        component.refreshDocuments()
    }

    ProfileSectionScaffold(
        title = "Documents",
        description = "Sign required documents and review completed signatures.",
        onBack = component::onBackClicked,
        onRefresh = component::refreshDocuments,
        isRefreshing = documentsState.isLoading,
    ) {
        SectionHeaderRow(title = "Unsigned documents")

        documentsState.error?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        when {
            documentsState.isLoading &&
                documentsState.unsignedDocuments.isEmpty() &&
                documentsState.signedDocuments.isEmpty() -> {
                Text(
                    text = "Loading documents...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            documentsState.unsignedDocuments.isEmpty() -> {
                Text(
                    text = "No unsigned documents.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            else -> {
                documentsState.unsignedDocuments.forEach { document ->
                    val isProcessing = activeDocumentActionId == document.id
                    val actionEnabled = !document.requiresChildEmail
                    DocumentCard(
                        document = document,
                        actionLabel = if (actionEnabled) {
                            if (document.type == ProfileDocumentType.TEXT) "Sign text" else "Sign document"
                        } else {
                            "Add child email first"
                        },
                        isProcessing = isProcessing,
                        processingLabel = "Opening...",
                        actionEnabled = actionEnabled,
                        onAction = { component.signDocument(document) },
                    )
                }
            }
        }

        SectionHeaderRow(title = "Signed documents")

        if (documentsState.signedDocuments.isEmpty()) {
            Text(
                text = "No signed documents.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            documentsState.signedDocuments.forEach { document ->
                val isProcessing = activeDocumentActionId == document.id
                val actionLabel = if (document.type == ProfileDocumentType.TEXT) "Preview text" else "View document"
                val onAction = {
                    if (document.type == ProfileDocumentType.TEXT) {
                        textPreviewDocument = document
                    } else {
                        component.openSignedDocument(document)
                    }
                }
                DocumentCard(
                    document = document,
                    actionLabel = actionLabel,
                    isProcessing = isProcessing,
                    processingLabel = "Opening...",
                    onAction = onAction,
                )
            }
        }
    }

    textSignaturePrompt?.let { prompt ->
        val isSigning = activeDocumentActionId == prompt.document.id
        AlertDialog(
            onDismissRequest = component::dismissTextSignature,
            title = { Text("Sign document") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = prompt.document.title,
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = "Signer: ${prompt.document.signerContextLabel}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    val body = prompt.step.content
                        ?.trim()
                        ?.takeIf(String::isNotBlank)
                        ?: prompt.document.content
                            ?.trim()
                            ?.takeIf(String::isNotBlank)
                        ?: "Tap confirm to sign this text document."
                    Text(
                        text = body,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = component::confirmTextSignature,
                    enabled = !isSigning,
                ) {
                    Text(if (isSigning) "Signing..." else "Confirm signature")
                }
            },
            dismissButton = {
                Button(
                    onClick = component::dismissTextSignature,
                    enabled = !isSigning,
                ) {
                    Text("Cancel")
                }
            },
        )
    }

    textPreviewDocument?.let { document ->
        AlertDialog(
            onDismissRequest = { textPreviewDocument = null },
            title = { Text(document.title) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = document.content?.trim()?.takeIf(String::isNotBlank)
                            ?: "No text content available for this document.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    document.signedAt?.let { signedAt ->
                        Text(
                            text = "Signed: ${formatDateForDisplay(signedAt)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            },
            confirmButton = {
                Button(onClick = { textPreviewDocument = null }) {
                    Text("Close")
                }
            },
        )
    }
}

@Composable
private fun DocumentCard(
    document: ProfileDocumentCard,
    actionLabel: String,
    isProcessing: Boolean,
    processingLabel: String,
    actionEnabled: Boolean = true,
    onAction: () -> Unit,
) {
    val eventName = document.eventName?.trim()?.takeIf(String::isNotBlank) ?: "Event document"
    val signedLabel = document.signedAt?.let { "Signed: ${formatDateForDisplay(it)}" }

    Card(
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = document.title,
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = eventName,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = document.organizationName,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Type: ${if (document.type == ProfileDocumentType.TEXT) "Text" else "PDF"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Signer: ${document.signerContextLabel}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            document.consentStatus?.let { consentStatus ->
                Text(
                    text = "Consent status: $consentStatus",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            document.statusNote?.let { statusNote ->
                Text(
                    text = statusNote,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            signedLabel?.let { label ->
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = onAction,
                enabled = !isProcessing && actionEnabled,
            ) {
                Text(if (isProcessing) processingLabel else actionLabel)
            }
        }
    }
}

@Composable
private fun ConnectionUserCard(
    user: UserData,
    isActionInProgress: Boolean,
    primaryActions: @Composable () -> Unit,
    secondaryActions: (@Composable () -> Unit)? = null,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = user.fullName.ifBlank { "User" },
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = "@${user.userName.ifBlank { "user" }}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                primaryActions()
            }

            if (secondaryActions != null) {
                secondaryActions()
            }

            if (isActionInProgress) {
                Text(
                    text = "Updating connection...",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ChildrenGrid(
    children: List<ProfileChild>,
    onEditChild: (ProfileChild) -> Unit,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val minCardWidth = 160.dp
        val horizontalSpacing = 8.dp
        val columns = ((maxWidth + horizontalSpacing) / (minCardWidth + horizontalSpacing))
            .toInt()
            .coerceAtLeast(1)
        val rows = children.chunked(columns)

        Column(
            verticalArrangement = Arrangement.spacedBy(horizontalSpacing),
        ) {
            rows.forEach { rowChildren ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(horizontalSpacing),
                ) {
                    rowChildren.forEach { child ->
                        ChildAccountCard(
                            child = child,
                            modifier = Modifier
                                .weight(1f)
                                .aspectRatio(1f),
                            onEdit = { onEditChild(child) },
                        )
                    }

                    repeat(columns - rowChildren.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun ChildAccountCard(
    child: ProfileChild,
    modifier: Modifier = Modifier,
    onEdit: (() -> Unit)? = null,
) {
    Card(
        modifier = modifier,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = child.fullName,
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = "@${child.userName?.trim()?.takeIf(String::isNotBlank) ?: "user"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "Age: ${child.age ?: "Unknown"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "Status: ${formatLinkStatus(child.linkStatus)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "Relationship: ${formatRelationship(child.relationship)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!child.hasEmail) {
                    Text(
                        text = "Missing email. Consent links cannot be sent until an email is added.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            onEdit?.let { onEditClick ->
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = onEditClick,
                ) {
                    Text("Edit")
                }
            }
        }
    }
}

@Composable
private fun SectionHeaderRow(
    title: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
        )
    }
}

@Composable
private fun PaymentPlanCard(
    paymentPlan: ProfilePaymentPlan,
    isProcessing: Boolean,
    onPayNextInstallment: () -> Unit,
) {
    val status = paymentPlan.bill.status ?: "OPEN"
    val billDisplayId = paymentPlan.bill.id.take(6)

    Card(
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = paymentPlan.ownerLabel,
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = "Bill #$billDisplayId • $status",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Next due: ${formatDateForDisplay(paymentPlan.nextPaymentDue)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Text(
                text = "Total: ${formatCurrency(paymentPlan.bill.totalAmountCents)}",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = "Paid: ${formatCurrency(paymentPlan.paidAmountCents)}",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = "Next: ${formatCurrency(paymentPlan.nextPaymentAmountCents)}",
                style = MaterialTheme.typography.bodySmall,
            )

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = onPayNextInstallment,
                enabled = !isProcessing && paymentPlan.nextPendingPayment != null && paymentPlan.nextPaymentAmountCents > 0,
            ) {
                Text(if (isProcessing) "Opening payment..." else "Pay next installment")
            }
        }
    }
}

@Composable
private fun MembershipCard(
    membership: ProfileMembership,
    isProcessing: Boolean,
    onCancel: () -> Unit,
    onRestart: () -> Unit,
) {
    val status = membership.subscription.status ?: "ACTIVE"
    val isCancelled = status.equals("CANCELLED", ignoreCase = true)

    Card(
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = membership.productName,
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = membership.organizationName,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "${formatCurrency(membership.subscription.priceCents)} / ${membership.subscription.period.lowercase()}",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = "Status: $status",
                style = MaterialTheme.typography.bodySmall,
                color = if (isCancelled) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            )
            Text(
                text = "Started: ${formatDateForDisplay(membership.subscription.startDate)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = if (isCancelled) onRestart else onCancel,
                enabled = !isProcessing,
            ) {
                when {
                    isProcessing -> Text("Updating membership...")
                    isCancelled -> Text("Restart membership")
                    else -> Text("Cancel membership")
                }
            }
        }
    }
}

private fun formatCurrency(cents: Int): String {
    return "$${MoneyInputUtils.centsToDisplayValue(cents)}"
}

private fun formatDateForDisplay(rawDate: String?): String {
    if (rawDate.isNullOrBlank()) return "TBD"
    return rawDate.substringBefore("T")
}

private fun formatTemplateDateTime(instant: kotlin.time.Instant): String {
    return runCatching {
        dateTimeFormat.format(
            instant.toLocalDateTime(TimeZone.currentSystemDefault()),
        )
    }.getOrElse { "TBD" }
}

private fun formatLinkStatus(rawStatus: String?): String {
    if (rawStatus.isNullOrBlank()) return "Unknown"
    val normalized = rawStatus.lowercase()
    return normalized.replaceFirstChar { char ->
        if (char.isLowerCase()) char.titlecase() else char.toString()
    }
}

private fun formatRelationship(rawRelationship: String?): String {
    if (rawRelationship.isNullOrBlank()) return "Unknown"
    val normalized = rawRelationship.lowercase()
    return normalized.replaceFirstChar { char ->
        if (char.isLowerCase()) char.titlecase() else char.toString()
    }
}

@Composable
private fun EventTemplateCard(
    template: Event,
    onOpenTemplate: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = "Event Template",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = template.name.ifBlank { "Untitled Template" },
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = "Starts: ${formatTemplateDateTime(template.start)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Ends: ${formatTemplateDateTime(template.end)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = onOpenTemplate,
            ) {
                Text("Open template")
            }
        }
    }
}

private fun normalizeDateInput(rawDate: String?): String {
    if (rawDate.isNullOrBlank()) return ""
    val trimmed = rawDate.trim()
    if (DATE_INPUT_REGEX.matches(trimmed)) return trimmed
    val datePrefix = trimmed.take(10)
    return if (DATE_INPUT_REGEX.matches(datePrefix)) datePrefix else ""
}

private val DATE_INPUT_REGEX = Regex("""\d{4}-\d{2}-\d{2}""")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileSectionScaffold(
    title: String,
    description: String,
    onBack: () -> Unit,
    onRefresh: (() -> Unit)? = null,
    isRefreshing: Boolean = false,
    content: @Composable () -> Unit,
) {
    val navPadding = LocalNavBarPadding.current

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        val contentModifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .padding(navPadding)

        if (onRefresh != null) {
            PullToRefreshContainer(
                isRefreshing = isRefreshing,
                onRefresh = onRefresh,
                modifier = contentModifier,
            ) {
                ProfileSectionContent(
                    description = description,
                    content = content,
                )
            }
        } else {
            ProfileSectionContent(
                description = description,
                content = content,
                modifier = contentModifier,
            )
        }
    }
}

@Composable
fun ProfileSectionContent(
    description: String,
    content: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = description,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        content()
    }
}
