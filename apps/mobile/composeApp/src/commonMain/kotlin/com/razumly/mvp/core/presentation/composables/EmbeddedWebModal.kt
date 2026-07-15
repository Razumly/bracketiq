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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.util.EmbeddedWebUrlPolicy
import com.razumly.mvp.core.util.Platform
import com.razumly.mvp.core.util.trustedBoldSignSigningUrlOrNull
import com.razumly.mvp.core.util.trustedEmbeddedWebUrlOrNull

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmbeddedWebModal(
    title: String,
    url: String,
    urlPolicy: EmbeddedWebUrlPolicy = EmbeddedWebUrlPolicy.SIGNING,
    onDismiss: () -> Unit,
    description: String? = null,
    primaryActionLabel: String? = null,
    onPrimaryAction: (() -> Unit)? = null,
) {
    val uriHandler = LocalUriHandler.current
    val trustedUrl = remember(url, urlPolicy) {
        trustedEmbeddedWebUrlOrNull(url, urlPolicy)
    }
    val preferExternalBrowser = remember(trustedUrl) {
        trustedUrl != null && shouldOpenBoldSignExternally(trustedUrl)
    }
    val fallbackOpenInBrowserAction = trustedUrl
        ?.let { targetUrl ->
            {
                runCatching { uriHandler.openUri(targetUrl) }
                Unit
            }
        }
    val externalBrowserMessage = remember(description, preferExternalBrowser) {
        if (!preferExternalBrowser) {
            description
        } else {
            listOfNotNull(
                description,
                "BoldSign signing opens in your browser on mobile for compatibility. Return here after completing the document.",
            ).joinToString("\n\n")
        }
    }

    LaunchedEffect(preferExternalBrowser, trustedUrl) {
        if (preferExternalBrowser && trustedUrl != null) {
            runCatching { uriHandler.openUri(trustedUrl) }
        }
    }

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

            externalBrowserMessage
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
                if (trustedUrl == null) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                    ) {
                        Text(
                            text = "The document link is unavailable or invalid. Refresh and try again.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                } else if (preferExternalBrowser) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                    ) {
                        Text(
                            text = "The signing page was opened in your browser. If it did not open, use the button below.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    PlatformWebView(
                        url = trustedUrl,
                        urlPolicy = urlPolicy,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
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
                } else if (fallbackOpenInBrowserAction != null) {
                    Button(
                        onClick = fallbackOpenInBrowserAction,
                        modifier = Modifier.padding(end = 8.dp),
                    ) {
                        Text("Open in browser")
                    }
                }

                TextButton(onClick = onDismiss) {
                    Text("Close")
                }
            }
        }
    }
}

private fun shouldOpenBoldSignExternally(url: String): Boolean {
    val isMobilePlatform = Platform.isIOS || Platform.name.equals("android", ignoreCase = true)
    if (!isMobilePlatform) return false
    return trustedBoldSignSigningUrlOrNull(url) != null
}
