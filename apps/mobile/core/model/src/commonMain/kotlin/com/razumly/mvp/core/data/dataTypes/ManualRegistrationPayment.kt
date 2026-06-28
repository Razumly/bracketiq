package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

const val REGISTRATION_PAYMENT_MODE_ONLINE = "ONLINE"
const val REGISTRATION_PAYMENT_MODE_MANUAL = "MANUAL"

const val MANUAL_PAYMENT_PROVIDER_CASH_APP = "CASH_APP"
const val MANUAL_PAYMENT_PROVIDER_VENMO = "VENMO"
const val MANUAL_PAYMENT_PROVIDER_PAYPAL = "PAYPAL"
const val MANUAL_PAYMENT_PROVIDER_STRIPE = "STRIPE"
const val MANUAL_PAYMENT_PROVIDER_ZELLE = "ZELLE"
const val MANUAL_PAYMENT_PROVIDER_OTHER = "OTHER"

const val MANUAL_PAYMENT_PROOF_STATUS_SUBMITTED = "SUBMITTED"
const val MANUAL_PAYMENT_PROOF_STATUS_ACCEPTED = "ACCEPTED"
const val MANUAL_PAYMENT_PROOF_STATUS_REJECTED = "REJECTED"

@Serializable
data class ManualPaymentLink(
    val id: String = "",
    val provider: String = MANUAL_PAYMENT_PROVIDER_OTHER,
    val label: String = "",
    val url: String = "",
)

fun normalizeRegistrationPaymentMode(value: String?): String {
    return if (value?.trim()?.uppercase() == REGISTRATION_PAYMENT_MODE_MANUAL) {
        REGISTRATION_PAYMENT_MODE_MANUAL
    } else {
        REGISTRATION_PAYMENT_MODE_ONLINE
    }
}

fun isManualRegistrationPaymentMode(value: String?): Boolean =
    normalizeRegistrationPaymentMode(value) == REGISTRATION_PAYMENT_MODE_MANUAL

fun normalizeManualPaymentProvider(value: String?): String {
    return when (value?.trim()?.lowercase()?.replace(Regex("[^a-z0-9]+"), "_")?.trim('_')) {
        "cash", "cashapp", "cash_app", "cash_app_pay" -> MANUAL_PAYMENT_PROVIDER_CASH_APP
        "venmo" -> MANUAL_PAYMENT_PROVIDER_VENMO
        "paypal", "pay_pal" -> MANUAL_PAYMENT_PROVIDER_PAYPAL
        "stripe" -> MANUAL_PAYMENT_PROVIDER_STRIPE
        "zelle" -> MANUAL_PAYMENT_PROVIDER_ZELLE
        else -> MANUAL_PAYMENT_PROVIDER_OTHER
    }
}

fun manualPaymentProviderLabel(provider: String?): String {
    return when (normalizeManualPaymentProvider(provider)) {
        MANUAL_PAYMENT_PROVIDER_CASH_APP -> "Cash App"
        MANUAL_PAYMENT_PROVIDER_VENMO -> "Venmo"
        MANUAL_PAYMENT_PROVIDER_PAYPAL -> "PayPal"
        MANUAL_PAYMENT_PROVIDER_STRIPE -> "Stripe"
        MANUAL_PAYMENT_PROVIDER_ZELLE -> "Zelle"
        else -> "Payment link"
    }
}

fun manualPaymentProviderInputLabel(provider: String?): String {
    return when (normalizeManualPaymentProvider(provider)) {
        MANUAL_PAYMENT_PROVIDER_CASH_APP -> "Cash App username"
        MANUAL_PAYMENT_PROVIDER_VENMO -> "Venmo username"
        MANUAL_PAYMENT_PROVIDER_PAYPAL -> "PayPal.Me username"
        else -> "HTTPS link"
    }
}

fun manualPaymentProviderInputPlaceholder(provider: String?): String {
    return when (normalizeManualPaymentProvider(provider)) {
        MANUAL_PAYMENT_PROVIDER_CASH_APP -> "\$bracketiq"
        MANUAL_PAYMENT_PROVIDER_VENMO -> "@bracketiq"
        MANUAL_PAYMENT_PROVIDER_PAYPAL -> "bracketiq"
        else -> "https://..."
    }
}

private fun normalizeIdPart(value: String): String =
    value.trim()
        .lowercase()
        .replace(Regex("[^a-z0-9]+"), "_")
        .trim('_')

private fun normalizeHandlePart(value: String): String =
    value.trim()
        .removePrefix("@")
        .removePrefix("$")
        .trim()
        .trim('/')

fun normalizeManualPaymentUrl(provider: String?, value: String): String? {
    val input = value.trim()
    if (input.isBlank() || input.contains(Regex("\\s"))) return null
    if (input.startsWith("https://", ignoreCase = true)) return input
    if (input.startsWith("http://", ignoreCase = true)) return null

    val handle = normalizeHandlePart(input).takeIf(String::isNotBlank) ?: return null
    return when (normalizeManualPaymentProvider(provider)) {
        MANUAL_PAYMENT_PROVIDER_CASH_APP -> "https://cash.app/\$$handle"
        MANUAL_PAYMENT_PROVIDER_VENMO -> "https://venmo.com/u/$handle"
        MANUAL_PAYMENT_PROVIDER_PAYPAL -> "https://paypal.me/$handle"
        else -> null
    }
}

fun normalizeManualPaymentLinks(value: List<ManualPaymentLink>?): List<ManualPaymentLink> {
    return value.orEmpty()
        .mapIndexedNotNull { index, link ->
            val provider = normalizeManualPaymentProvider(link.provider)
            val url = normalizeManualPaymentUrl(provider, link.url)
                ?: return@mapIndexedNotNull null
            val label = link.label.trim()
                .takeIf(String::isNotBlank)
                ?.take(80)
                ?: manualPaymentProviderLabel(provider)
            val explicitId = normalizeIdPart(link.id)
            ManualPaymentLink(
                id = explicitId.ifBlank { "${normalizeIdPart(provider)}_${index + 1}" },
                provider = provider,
                label = label,
                url = url,
            )
        }
        .distinctBy { link -> link.id }
}

fun normalizeManualPaymentInstructions(value: String?): String? =
    value?.trim()?.takeIf(String::isNotBlank)?.take(2000)
