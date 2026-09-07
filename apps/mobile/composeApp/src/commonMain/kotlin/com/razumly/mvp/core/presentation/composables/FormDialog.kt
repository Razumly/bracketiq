package com.razumly.mvp.core.presentation.composables

import androidx.compose.material3.AlertDialog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf

typealias FormDialogContent = @Composable (
    onDismiss: () -> Unit,
    title: @Composable () -> Unit,
    content: @Composable () -> Unit,
    confirm: @Composable () -> Unit,
    dismiss: (@Composable () -> Unit)?,
) -> Unit

val LocalFormDialogContent = staticCompositionLocalOf<FormDialogContent> {
    { onDismiss, title, content, confirm, dismiss ->
        AlertDialog(onDismissRequest = onDismiss, title = title, text = content,
            confirmButton = confirm, dismissButton = dismiss)
    }
}

@Composable
fun FormDialog(
    onDismissRequest: () -> Unit,
    title: @Composable () -> Unit,
    text: @Composable () -> Unit,
    confirmButton: @Composable () -> Unit,
    dismissButton: (@Composable () -> Unit)? = null,
) = LocalFormDialogContent.current(onDismissRequest, title, text, confirmButton, dismissButton)
