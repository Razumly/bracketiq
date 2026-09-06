package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.EventAuthorityCapabilities

internal fun EventAuthorityCapabilities.managementRestrictionMessage(): String? {
    if (canEdit && !readOnly) return null
    return when (readOnlyReason) {
        "AUTHENTICATION_REQUIRED" -> "Sign in with an authorized account to manage this Event."
        "MANAGEMENT_AUTHORITY_UNVERIFIED" -> "Event management is read-only until the Organization's authority is verified."
        "NOT_AUTHORIZED" -> "Your account does not have permission to manage this Event."
        else -> "Event management is read-only for this account."
    }
}
