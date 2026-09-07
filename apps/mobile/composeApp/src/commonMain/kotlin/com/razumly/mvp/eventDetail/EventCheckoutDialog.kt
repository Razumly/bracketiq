package com.razumly.mvp.eventDetail

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

internal enum class EventCheckoutStep(val label: String) {
    REGISTRATION("Registration"), REQUIREMENTS("Requirements"), REVIEW("Review & pay"), COMPLETE("Confirmation")
}

internal val LocalCheckoutEventName = staticCompositionLocalOf { "" }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EventCheckoutDialog(
    onDismissRequest: () -> Unit,
    title: @Composable () -> Unit,
    text: @Composable () -> Unit,
    confirmButton: @Composable () -> Unit,
    dismissButton: (@Composable () -> Unit)? = null,
    step: EventCheckoutStep = EventCheckoutStep.REGISTRATION,
) {
    Dialog(onDismissRequest = onDismissRequest, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Scaffold(
                topBar = {
                    Column {
                        TopAppBar(
                            title = { Text("Event registration") },
                            navigationIcon = {
                                IconButton(onClick = onDismissRequest) {
                                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                                }
                            },
                        )
                        if (LocalCheckoutEventName.current.isNotBlank()) {
                            Text(LocalCheckoutEventName.current, Modifier.padding(horizontal = 24.dp),
                                style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Row(Modifier.fillMaxWidth().padding(24.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            EventCheckoutStep.entries.take(3).forEachIndexed { index, item ->
                                Text("${index + 1}. ${item.label}", modifier = Modifier.weight(1f), style = MaterialTheme.typography.labelMedium,
                                    color = if (item == step) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        HorizontalDivider()
                    }
                },
                bottomBar = {
                    Surface(shadowElevation = 4.dp) {
                        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(24.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(Modifier.fillMaxWidth(), propagateMinConstraints = true) { confirmButton() }
                            dismissButton?.let { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { it() } }
                        }
                    }
                },
            ) { padding ->
                Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                    ProvideTextStyle(MaterialTheme.typography.headlineSmall) { title() }
                    Box(Modifier.fillMaxWidth().weight(1f)) { text() }
                }
            }
        }
    }
}
