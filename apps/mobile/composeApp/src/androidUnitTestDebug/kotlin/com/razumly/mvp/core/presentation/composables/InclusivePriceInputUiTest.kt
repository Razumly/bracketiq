package com.razumly.mvp.core.presentation.composables

import android.app.Application
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import com.razumly.mvp.core.data.repositories.InclusivePriceBreakdown
import com.razumly.mvp.core.data.repositories.InclusivePriceQuote
import com.razumly.mvp.core.data.repositories.InclusivePriceQuoteDirection
import kotlinx.coroutines.CompletableDeferred
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class InclusivePriceInputUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun host_edit_stays_unconfirmed_until_the_server_total_is_accepted() {
        val hostQuote = CompletableDeferred<Result<InclusivePriceQuote>>()
        var savedTotalCents = -1
        val confirmed = mutableStateOf(false)
        val confirmedTotal = mutableStateOf(-1)

        composeRule.setContent {
            MaterialTheme {
                Column {
                    InclusivePriceInput(
                        totalPriceCents = 1_000,
                        onConfirmedTotalPriceChange = { confirmedTotal.value = it },
                        quoteInclusivePrice = { direction, amountCents, _ ->
                            when (direction) {
                                InclusivePriceQuoteDirection.TOTAL_PRICE -> Result.success(
                                    quote(
                                        direction = direction,
                                        requestedAmountCents = amountCents,
                                        hostReceivesCents = 800,
                                        processingFeeCents = 150,
                                        platformFeeCents = 50,
                                        totalPriceCents = 1_000,
                                    ),
                                )
                                InclusivePriceQuoteDirection.HOST_AMOUNT -> hostQuote.await()
                            }
                        },
                        onQuoteConfirmationChange = { confirmed.value = it },
                        editorKey = "ui-test",
                    )
                    Button(
                        enabled = confirmed.value,
                        onClick = { savedTotalCents = confirmedTotal.value },
                    ) {
                        Text("Save sentinel price")
                    }
                }
            }
        }

        composeRule.waitUntil { confirmed.value && confirmedTotal.value == 1_000 }
        composeRule.onNodeWithText("Save sentinel price").assertIsEnabled()

        composeRule.onAllNodes(hasSetTextAction())[0].performTextReplacement("7777")
        composeRule.onNodeWithText("Save sentinel price").assertIsNotEnabled().performClick()
        assertEquals(-1, savedTotalCents)

        hostQuote.complete(
            Result.success(
                quote(
                    direction = InclusivePriceQuoteDirection.HOST_AMOUNT,
                    requestedAmountCents = 7_777,
                    hostReceivesCents = 7_777,
                    processingFeeCents = 1_543,
                    platformFeeCents = 556,
                    totalPriceCents = 9_876,
                ),
            ),
        )

        composeRule.waitUntil { confirmed.value && confirmedTotal.value == 9_876 }
        composeRule.onNodeWithText("Save sentinel price").assertIsEnabled()
        composeRule
            .onNodeWithText("\$77.77 + \$15.43 processing + \$5.56 platform = \$98.76")
            .assertIsDisplayed()
        composeRule.onNodeWithText("Save sentinel price").performClick()

        assertEquals(9_876, savedTotalCents)
    }

    @Test
    fun quote_failure_shows_a_retry_that_recovers_with_server_values() {
        var attempts = 0

        composeRule.setContent {
            MaterialTheme {
                InclusivePriceInput(
                    totalPriceCents = 1_000,
                    onConfirmedTotalPriceChange = {},
                    quoteInclusivePrice = { direction, amountCents, _ ->
                        attempts += 1
                        if (attempts == 1) {
                            Result.failure(IllegalStateException("Quote service unavailable"))
                        } else {
                            Result.success(
                                quote(
                                    direction = direction,
                                    requestedAmountCents = amountCents,
                                    hostReceivesCents = 800,
                                    processingFeeCents = 150,
                                    platformFeeCents = 50,
                                    totalPriceCents = 1_000,
                                ),
                            )
                        }
                    },
                    onQuoteConfirmationChange = {},
                    editorKey = "retry-ui-test",
                )
            }
        }

        composeRule.waitUntil { attempts == 1 }
        composeRule.onNodeWithText("Unable to refresh the online price.").assertIsDisplayed()
        composeRule.onNodeWithText("Retry").performClick()

        composeRule.waitUntil { attempts == 2 }
        composeRule
            .onNodeWithText("\$8.00 + \$1.50 processing + \$0.50 platform = \$10.00")
            .assertIsDisplayed()
        assertEquals(2, attempts)
    }

    private fun quote(
        direction: InclusivePriceQuoteDirection,
        requestedAmountCents: Int,
        hostReceivesCents: Int,
        processingFeeCents: Int,
        platformFeeCents: Int,
        totalPriceCents: Int,
    ): InclusivePriceQuote = InclusivePriceQuote(
        version = 1,
        direction = direction,
        requestedAmountCents = requestedAmountCents,
        breakdown = InclusivePriceBreakdown(
            hostReceivesCents = hostReceivesCents,
            processingFeeCents = processingFeeCents,
            platformFeeCents = platformFeeCents,
            totalPriceCents = totalPriceCents,
            platformFeePercentage = 0.123,
        ),
    )
}
