package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmbeddedWebModal(
    title: String,
    url: String,
    onDismiss: () -> Unit,
    description: String? = null,
    primaryActionLabel: String? = null,
    onPrimaryAction: (() -> Unit)? = null,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.92f)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            description
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .heightIn(min = 260.dp)
                    .border(
                        width = 1.dp,
                        color = MaterialTheme.colorScheme.outlineVariant,
                        shape = RoundedCornerShape(12.dp),
                    ),
            ) {
                PlatformWebView(
                    url = url,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                if (primaryActionLabel != null && onPrimaryAction != null) {
                    Button(
                        onClick = onPrimaryAction,
                        modifier = Modifier.padding(end = 8.dp),
                    ) {
                        Text(primaryActionLabel)
                    }
                }

                TextButton(onClick = onDismiss) {
                    Text("Close")
                }
            }
        }
    }
}
