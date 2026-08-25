package com.razumly.mvp.core.notifications

internal fun Map<String, String>.documentNotificationEvidenceId(): String? {
    val evidenceId = entries.firstOrNull { (key, value) ->
        key.equals("evidenceId", ignoreCase = true) && value.trim().isNotBlank()
    }?.value?.trim() ?: return null
    if (evidenceId == "." || evidenceId == ".." || evidenceId.any { it == '/' || it == '?' || it == '#' }) return null

    val notificationType = entries.firstOrNull { (key, value) ->
        key.equals("notificationType", ignoreCase = true) && value.trim().isNotBlank()
    }?.value?.trim()?.lowercase()
    val action = entries.firstOrNull { (key, value) ->
        key.equals("action", ignoreCase = true) && value.trim().isNotBlank()
    }?.value?.trim()?.lowercase()
    val deepLink = entries.firstOrNull { (key, value) ->
        key.equals("deepLink", ignoreCase = true) && value.trim().isNotBlank()
    }?.value?.trim()?.lowercase()

    return if (
        notificationType == "documents" ||
        action == "import" ||
        action == "void" ||
        deepLink?.contains("profile/documents/") == true
    ) {
        evidenceId
    } else {
        null
    }
}

fun documentIdFromDeepLinkPath(path: String): String? {
    val segments = path.split('/').filter(String::isNotBlank)
    if (
        segments.size < 3 ||
        !segments[0].equals("profile", ignoreCase = true) ||
        !segments[1].equals("documents", ignoreCase = true)
    ) {
        return null
    }

    return segments[2]
        .trim()
        .takeIf { documentId ->
            documentId.isNotBlank() &&
                documentId != "." &&
                documentId != ".." &&
                documentId.none { it == '/' || it == '?' || it == '#' }
        }
}
