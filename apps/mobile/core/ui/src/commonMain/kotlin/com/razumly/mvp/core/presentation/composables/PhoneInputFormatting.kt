package com.razumly.mvp.core.presentation.composables

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation

private const val MAX_LOCAL_PHONE_DIGITS = 10

fun sanitizePhoneInput(value: String): String {
    val rawDigits = value.filter(Char::isDigit)
    return if (rawDigits.length == 11 && rawDigits.startsWith('1')) {
        rawDigits.drop(1)
    } else {
        rawDigits.take(MAX_LOCAL_PHONE_DIGITS)
    }
}

fun formatPhoneInput(value: String): String {
    val digits = sanitizePhoneInput(value)

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

object PhoneInputVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digits = sanitizePhoneInput(text.text)
        val formatted = formatPhoneInput(digits)
        val offsetMapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int {
                val safeOffset = offset.coerceIn(0, digits.length)
                if (safeOffset == 0 || formatted.isEmpty()) return 0
                if (safeOffset == digits.length) return formatted.length

                var digitsSeen = 0
                formatted.forEachIndexed { index, character ->
                    if (character.isDigit()) {
                        digitsSeen += 1
                        if (digitsSeen == safeOffset) {
                            var nextDigit = index + 1
                            while (nextDigit < formatted.length && !formatted[nextDigit].isDigit()) {
                                nextDigit += 1
                            }
                            return nextDigit
                        }
                    }
                }
                return formatted.length
            }

            override fun transformedToOriginal(offset: Int): Int = formatted
                .take(offset.coerceIn(0, formatted.length))
                .count(Char::isDigit)
                .coerceAtMost(digits.length)
        }
        return TransformedText(AnnotatedString(formatted), offsetMapping)
    }
}
