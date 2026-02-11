package com.razumly.mvp.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.util.MoneyInputUtils

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
fun ProfileChildrenScreen(component: ProfileComponent) {
    val childrenState by component.childrenState.collectAsState()
    var childFirstName by rememberSaveable { mutableStateOf("") }
    var childLastName by rememberSaveable { mutableStateOf("") }
    var childEmail by rememberSaveable { mutableStateOf("") }
    var childDateOfBirth by rememberSaveable { mutableStateOf("") }
    var childRelationship by rememberSaveable { mutableStateOf("parent") }

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
    var wasLinkingChild by remember { mutableStateOf(false) }

    LaunchedEffect(component) {
        component.refreshChildren()
    }

    LaunchedEffect(childrenState.isCreatingChild, childrenState.createError) {
        if (wasCreatingChild && !childrenState.isCreatingChild && childrenState.createError == null) {
            childFirstName = ""
            childLastName = ""
            childEmail = ""
            childDateOfBirth = ""
            childRelationship = "parent"
        }
        wasCreatingChild = childrenState.isCreatingChild
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
        isRefreshing = childrenState.isLoading,
    ) {
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
                childrenState.children.forEach { child ->
                    ChildAccountCard(child = child)
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
                    text = "Add a child",
                    style = MaterialTheme.typography.titleMedium,
                )

                childrenState.createError?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                PlatformTextField(
                    value = childFirstName,
                    onValueChange = { childFirstName = it },
                    label = "First name",
                )
                PlatformTextField(
                    value = childLastName,
                    onValueChange = { childLastName = it },
                    label = "Last name",
                )
                PlatformTextField(
                    value = childEmail,
                    onValueChange = { childEmail = it },
                    label = "Email (optional)",
                    keyboardType = "email",
                )
                PlatformTextField(
                    value = childDateOfBirth,
                    onValueChange = { childDateOfBirth = it },
                    label = "Date of birth",
                    placeholder = "YYYY-MM-DD",
                    supportingText = "Use YYYY-MM-DD format",
                )
                PlatformDropdown(
                    selectedValue = childRelationship,
                    onSelectionChange = { childRelationship = it },
                    options = relationshipOptions,
                    label = "Relationship",
                )

                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        component.createChild(
                            firstName = childFirstName,
                            lastName = childLastName,
                            dateOfBirth = childDateOfBirth,
                            email = childEmail,
                            relationship = childRelationship,
                        )
                    },
                    enabled = !childrenState.isCreatingChild,
                ) {
                    Text(if (childrenState.isCreatingChild) "Adding child..." else "Add child")
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
    }
}

@Composable
private fun ChildAccountCard(child: ProfileChild) {
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
                text = child.fullName,
                style = MaterialTheme.typography.titleMedium,
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
            if (!child.hasEmail) {
                Text(
                    text = "Missing email. Consent links cannot be sent until an email is added.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
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

private fun formatLinkStatus(rawStatus: String?): String {
    if (rawStatus.isNullOrBlank()) return "Unknown"
    val normalized = rawStatus.lowercase()
    return normalized.replaceFirstChar { char ->
        if (char.isLowerCase()) char.titlecase() else char.toString()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileSectionScaffold(
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
private fun ProfileSectionContent(
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
