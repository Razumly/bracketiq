package com.razumly.mvp.refundManager

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.EventCard
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RefundManagerScreen(
    component: RefundManagerComponent,
) {
    val popupHandler = LocalPopupHandler.current
    val navPadding = LocalNavBarPadding.current
    val loadingHandler = LocalLoadingHandler.current

    val refunds by component.refundsWithRelations.collectAsState()
    val isLoading by component.isLoading.collectAsState()

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
    }

    LaunchedEffect(Unit) {
        component.errorState.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
            }
        }
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Refund Requests") },
                navigationIcon = {
                    PlatformBackButton(
                        onBack = component::onBack,
                        arrow = true,
                    )
                }
            )
        }
    ) { innerPadding ->
        PullToRefreshContainer(
            isRefreshing = isLoading,
            onRefresh = component::refreshRefunds,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(navPadding),
        ) {
            if (isLoading && refunds.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (refunds.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "No refund requests",
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(refunds) { refundWithRelations ->
                        RefundRequestItem(
                            refundWithRelations = refundWithRelations,
                            onApprove = { component.approveRefund(refundWithRelations.refundRequest) },
                            onReject = { component.rejectRefund(refundWithRelations.refundRequest.id) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RefundRequestItem(
    refundWithRelations: RefundRequestWithRelations,
    onApprove: () -> Unit,
    onReject: () -> Unit
) {
    var showConfirmDialog by remember { mutableStateOf<String?>(null) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Refund Request",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "ID: ${refundWithRelations.refundRequest.id.take(8)}...",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            HorizontalDivider()

            if (refundWithRelations.user != null) {
                Text(
                    "Requested by:",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium
                )
                PlayerCard(
                    player = refundWithRelations.user,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            // Event details
            if (refundWithRelations.event != null) {
                Text(
                    "Event:",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium
                )
                EventCard(
                    event = refundWithRelations.event!!,
                    onMapClick = { }
                )
            }

            // Refund reason
            Text(
                "Reason:",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium
            )
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Text(
                    text = refundWithRelations.refundRequest.reason,
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            HorizontalDivider()

            // Action buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = { showConfirmDialog = "approve" },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Text("Approve")
                }

                OutlinedButton(
                    onClick = { showConfirmDialog = "reject" },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Reject")
                }
            }
        }
    }

    // Confirmation dialog
    if (showConfirmDialog != null) {
        val isApproval = showConfirmDialog == "approve"
        AlertDialog(
            onDismissRequest = { showConfirmDialog = null },
            title = {
                Text(if (isApproval) "Approve Refund" else "Reject Refund")
            },
            text = {
                Text(
                    if (isApproval) {
                        "Are you sure you want to approve this refund? This will process the payment refund."
                    } else {
                        "Are you sure you want to reject this refund request?"
                    }
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (isApproval) onApprove() else onReject()
                        showConfirmDialog = null
                    },
                    colors = if (isApproval) {
                        ButtonDefaults.buttonColors()
                    } else {
                        ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error
                        )
                    }
                ) {
                    Text(if (isApproval) "Approve" else "Reject")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}
