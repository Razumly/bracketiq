package com.razumly.mvp.core.presentation.composables

private const val MAX_LOCAL_PHONE_DIGITS = 10

fun formatPhoneInput(value: String): String {
    val rawDigits = value.filter(Char::isDigit)
    val digits = if (rawDigits.length == 11 && rawDigits.startsWith('1')) {
        rawDigits.drop(1)
    } else {
        rawDigits.take(MAX_LOCAL_PHONE_DIGITS)
    }

    if (digits.length <= 3) return digits

    val areaCode = digits.take(3)
    val exchange = digits.drop(3).take(3)
    val subscriber = digits.drop(6)
    return if (subscriber.isEmpty()) {
        "($areaCode) $exchange"
    } else {
        "($areaCode) $exchange-$subscriber"
    }
}
