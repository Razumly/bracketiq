package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument

internal fun Int.toRegistrationCutoffSummary(): String {
    return when (this) {
        0 -> "No cutoff"
        1 -> "24h before start"
        2 -> "48h before start"
        else -> "No cutoff"
    }
}

internal fun List<String>.normalizeTemplateIds(): List<String> {
    return map { templateId -> templateId.trim() }
        .filter(String::isNotBlank)
        .distinct()
}

internal fun OrganizationTemplateDocument.toRequiredTemplateLabel(): String {
    val normalizedTitle = title.trim().ifBlank { "Untitled Template" }
    val normalizedType = if (type.trim().equals("TEXT", ignoreCase = true)) "TEXT" else "PDF"
    val signerLabel = templateSignerTypeLabel(requiredSignerType)
    return "$normalizedTitle ($normalizedType, $signerLabel)"
}

private fun templateSignerTypeLabel(rawType: String?): String {
    return when (
        rawType?.trim()?.uppercase()?.replace('-', '_')?.replace(' ', '_')?.replace('/', '_')
    ) {
        "PARENT_GUARDIAN" -> "Parent/Guardian"
        "CHILD" -> "Child"
        "PARENT_GUARDIAN_CHILD", "PARENT_GUARDIAN_AND_CHILD" -> "Parent/Guardian + Child"
        else -> "Participant"
    }
}