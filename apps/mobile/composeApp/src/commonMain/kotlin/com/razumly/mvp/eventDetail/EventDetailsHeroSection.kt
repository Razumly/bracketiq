package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.util.transitionSpec
import com.razumly.mvp.eventDetail.shared.SummaryTagChip
import com.razumly.mvp.eventDetail.shared.localImageScheme
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.enter_value
import org.jetbrains.compose.resources.stringResource

internal data class EventDetailsHeroState(
    val editView: Boolean,
    val isNewEvent: Boolean,
    val event: Event,
    val editEvent: Event,
    val eventNameInput: String,
    val isValid: Boolean,
    val isLocationValid: Boolean,
    val isColorLoaded: Boolean,
    val heroSpacerHeight: Dp,
    val roundedCornerSize: Dp,
    val eventMetaLine: String,
    val summaryTags: List<String>,
    val registrationHoldExpiresAt: String?,
)

internal data class EventDetailsHeroActions(
    val onShowImageSelector: () -> Unit,
    val onEventNameInputChange: (String) -> Unit,
    val onOpenLocationMap: () -> Unit,
    val onMapRevealCenterChange: (Offset) -> Unit,
    val onRegistrationHoldExpired: () -> Unit,
    val joinButton: @Composable (Boolean) -> Unit,
)

internal fun LazyListScope.eventDetailsHeroSection(
    state: EventDetailsHeroState,
    actions: EventDetailsHeroActions,
) {
    item {
        Box(modifier = Modifier.height(state.heroSpacerHeight)) {
            if (state.editView) {
                Button(
                    onClick = actions.onShowImageSelector,
                    modifier = Modifier.align(Alignment.Center).size(120.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Black,
                        contentColor = Color.White,
                    ),
                    contentPadding = PaddingValues(16.dp),
                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 8.dp),
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Icon(
                            Icons.Default.Image,
                            contentDescription = null,
                            modifier = Modifier.size(32.dp),
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Choose Image",
                            style = MaterialTheme.typography.labelMedium,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                val imageErrorText = when {
                    state.editEvent.imageId.isBlank() -> "Select an image for the event."
                    !state.isColorLoaded -> "Image is still loading."
                    else -> null
                }
                if (imageErrorText != null) {
                    Text(
                        text = imageErrorText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.align(Alignment.BottomCenter)
                            .padding(bottom = 16.dp),
                    )
                }
            }
        }
    }

    item {
        var editLocationButtonCenter by remember { mutableStateOf(Offset.Zero) }
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(
                topStart = state.roundedCornerSize,
                topEnd = state.roundedCornerSize,
                bottomStart = 0.dp,
                bottomEnd = 0.dp,
            ),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = if (state.editView) Alignment.CenterHorizontally else Alignment.Start,
            ) {
                if (state.editView && state.isNewEvent) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.secondaryContainer,
                        ),
                        border = BorderStroke(
                            width = 1.dp,
                            color = MaterialTheme.colorScheme.outlineVariant,
                        ),
                    ) {
                        Text(
                            text = "For more complex events and billing use the web version.",
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                        )
                    }
                }

                AnimatedContent(
                    targetState = state.editView,
                    transitionSpec = { transitionSpec(0) },
                    label = "titleTransition",
                ) { editMode ->
                    if (editMode) {
                        val hasNameError = state.eventNameInput.isBlank()
                        StandardTextField(
                            value = state.eventNameInput,
                            onValueChange = actions.onEventNameInputChange,
                            label = "Event Name",
                            isError = hasNameError,
                            supportingText = if (hasNameError) {
                                stringResource(Res.string.enter_value)
                            } else {
                                ""
                            },
                        )
                    } else {
                        Text(
                            text = state.event.name,
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }

                if (state.editView) {
                    Text(
                        text = state.editEvent.location,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Button(
                        onClick = {
                            actions.onMapRevealCenterChange(editLocationButtonCenter)
                            actions.onOpenLocationMap()
                        },
                        modifier = Modifier.onGloballyPositioned {
                            editLocationButtonCenter = it.boundsInWindow().center
                            actions.onMapRevealCenterChange(editLocationButtonCenter)
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.Black,
                            contentColor = Color.White,
                        ),
                    ) {
                        Icon(Icons.Default.Place, contentDescription = null)
                        Text("Edit Location")
                    }
                    if (!state.isLocationValid) {
                        Text(
                            text = "Select a Location",
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                } else {
                    Text(
                        text = state.eventMetaLine,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(localImageScheme.current.onSurfaceVariant),
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        state.summaryTags.forEach { tag ->
                            SummaryTagChip(label = tag)
                        }
                        RegistrationHoldSummaryChip(
                            expiresAt = state.registrationHoldExpiresAt,
                            onExpired = actions.onRegistrationHoldExpired,
                        )
                    }
                }

                Box(
                    Modifier.fillMaxWidth(),
                    contentAlignment = if (state.editView) Alignment.Center else Alignment.CenterStart,
                ) {
                    actions.joinButton(state.isValid)
                }
            }
        }
    }
}

@Composable
private fun RegistrationHoldSummaryChip(
    expiresAt: String?,
    onExpired: () -> Unit,
) {
    val remainingLabel = rememberRegistrationHoldRemainingLabel(
        expiresAt = expiresAt,
        onExpired = onExpired,
    ) ?: return

    SummaryTagChip(label = "Held $remainingLabel")
}
