package com.razumly.mvp.eventDetail.edit

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.eventDetail.normalizeTemplateIds
import com.razumly.mvp.eventDetail.readonly.ReadOnlyNameList
import com.razumly.mvp.eventDetail.shared.localImageScheme

@Composable
internal fun RequiredDocumentsSection(
    isOrganizationEvent: Boolean,
    rentalTimeLocked: Boolean,
    organizationTemplatesLoading: Boolean,
    organizationTemplatesError: String?,
    requiredTemplateOptions: List<DropdownOption>,
    selectedRequiredTemplateIds: List<String>,
    selectedRequiredTemplateLabels: List<String>,
    onRequiredTemplateIdsChange: (List<String>) -> Unit,
) {
    if (!isOrganizationEvent) {
        return
    }

    if (rentalTimeLocked) {
        Text(
            text = "Required Documents",
            style = MaterialTheme.typography.titleSmall,
            color = Color(localImageScheme.current.onSurface),
            modifier = Modifier.padding(top = 8.dp),
        )
        ReadOnlyNameList(
            title = "Required Documents",
            singularTitle = "Required Document",
            values = selectedRequiredTemplateLabels,
            emptyText = "Required Documents: None",
        )
        Text(
            text = "Set by the rental field and cannot be changed here.",
            style = MaterialTheme.typography.bodySmall,
            color = Color(localImageScheme.current.onSurfaceVariant),
        )
        return
    }

    PlatformDropdown(
        selectedValue = "",
        onSelectionChange = {},
        options = requiredTemplateOptions,
        label = "Required Documents",
        placeholder = if (organizationTemplatesLoading) {
            "Loading templates..."
        } else {
            "Select templates"
        },
        enabled = !organizationTemplatesLoading,
        multiSelect = true,
        selectedValues = selectedRequiredTemplateIds,
        onMultiSelectionChange = { values ->
            onRequiredTemplateIdsChange(values.normalizeTemplateIds())
        },
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
    )
    if (!organizationTemplatesError.isNullOrBlank()) {
        Text(
            text = organizationTemplatesError,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    } else if (
        !organizationTemplatesLoading &&
        requiredTemplateOptions.isEmpty()
    ) {
        Text(
            text = "No templates yet. Create one in your organization Document Templates tab.",
            style = MaterialTheme.typography.bodySmall,
            color = Color(localImageScheme.current.onSurfaceVariant),
        )
    }
}