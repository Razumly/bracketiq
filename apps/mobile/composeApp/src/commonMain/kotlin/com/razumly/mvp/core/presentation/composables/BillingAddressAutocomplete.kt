package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.network.createMvpHttpClient
import io.github.aakira.napier.Napier
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

private const val AutocompleteUrl = "https://places.googleapis.com/v1/places:autocomplete"
private const val PlacesFieldMaskHeader = "X-Goog-FieldMask"
private const val PlacesApiKeyHeader = "X-Goog-Api-Key"
private const val SuggestionFieldMask =
    "suggestions.placePrediction.placeId," +
        "suggestions.placePrediction.text.text," +
        "suggestions.placePrediction.structuredFormat.mainText.text," +
        "suggestions.placePrediction.structuredFormat.secondaryText.text"
private const val DetailsFieldMask = "id,formattedAddress,addressComponents"
private const val MinimumAutocompleteQueryLength = 3

internal data class BillingAddressSuggestion(
    val placeId: String,
    val primaryText: String,
    val secondaryText: String = "",
)

internal class GooglePlacesBillingAddressProvider(
    private val httpClient: HttpClient = createMvpHttpClient(),
    private val apiKey: String = billingAddressPlacesApiKey(),
) {
    suspend fun findSuggestions(query: String): Result<List<BillingAddressSuggestion>> = runCatching {
        val normalizedQuery = query.trim()
        if (normalizedQuery.length < MinimumAutocompleteQueryLength || apiKey.isBlank()) {
            return@runCatching emptyList()
        }

        val response = httpClient.post(AutocompleteUrl) {
            header(PlacesApiKeyHeader, apiKey)
            header(PlacesFieldMaskHeader, SuggestionFieldMask)
            setBody(GooglePlacesAutocompleteRequest(input = normalizedQuery))
        }.body<GooglePlacesAutocompleteResponse>()

        response.suggestions
            .mapNotNull { suggestion ->
                val prediction = suggestion.placePrediction ?: return@mapNotNull null
                val placeId = prediction.placeId.trim()
                if (placeId.isBlank()) return@mapNotNull null

                val fullText = prediction.text?.text.orEmpty().trim()
                val primaryText = prediction.structuredFormat
                    ?.mainText
                    ?.text
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?: fullText.substringBefore(",").trim().ifBlank { fullText }
                val secondaryText = prediction.structuredFormat
                    ?.secondaryText
                    ?.text
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?: fullText.removePrefix(primaryText).trimStart(',', ' ')

                BillingAddressSuggestion(
                    placeId = placeId,
                    primaryText = primaryText,
                    secondaryText = secondaryText,
                )
            }
            .distinctBy { it.placeId }
    }

    suspend fun resolveAddress(placeId: String): Result<BillingAddressDraft> = runCatching {
        val normalizedPlaceId = placeId.trim()
        require(normalizedPlaceId.isNotBlank()) { "Place id is required." }
        require(apiKey.isNotBlank()) { "Google Places API key is missing." }

        val details = httpClient.get("https://places.googleapis.com/v1/places/$normalizedPlaceId") {
            header(PlacesApiKeyHeader, apiKey)
            header(PlacesFieldMaskHeader, DetailsFieldMask)
        }.body<GooglePlaceDetails>()

        details.toBillingAddressDraft().normalized()
    }

    fun close() {
        httpClient.close()
    }
}

@Composable
internal fun BillingAddressAutocompleteField(
    value: String,
    onValueChange: (String) -> Unit,
    onAddressSelected: (BillingAddressDraft) -> Unit,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
) {
    val provider = remember { GooglePlacesBillingAddressProvider() }
    val scope = rememberCoroutineScope()
    var suggestions by remember { mutableStateOf<List<BillingAddressSuggestion>>(emptyList()) }
    var suggestionError by remember { mutableStateOf<String?>(null) }
    var isLoadingSuggestions by remember { mutableStateOf(false) }
    var isResolvingSuggestion by remember { mutableStateOf(false) }
    var suppressedQuery by remember { mutableStateOf<String?>(null) }

    DisposableEffect(provider) {
        onDispose { provider.close() }
    }

    LaunchedEffect(value) {
        val query = value.trim()
        if (query.length < MinimumAutocompleteQueryLength || query == suppressedQuery) {
            suggestions = emptyList()
            isLoadingSuggestions = false
            return@LaunchedEffect
        }

        delay(300)
        isLoadingSuggestions = true
        suggestionError = null
        provider.findSuggestions(query)
            .onSuccess { results ->
                suggestions = results
            }
            .onFailure { error ->
                suggestions = emptyList()
                suggestionError = "Address suggestions are unavailable."
                Napier.w("Billing address autocomplete failed: ${error.message}", error)
            }
        isLoadingSuggestions = false
    }

    Column(modifier = modifier.fillMaxWidth()) {
        StandardTextField(
            value = value,
            onValueChange = { nextValue ->
                if (nextValue.trim() != suppressedQuery) {
                    suppressedQuery = null
                }
                onValueChange(nextValue)
            },
            label = "Address line 1",
            isError = isError,
            supportingText = when {
                isResolvingSuggestion -> "Filling address..."
                isLoadingSuggestions -> "Loading suggestions..."
                suggestionError != null -> suggestionError.orEmpty()
                else -> ""
            },
            trailingIcon = if (isLoadingSuggestions || isResolvingSuggestion) {
                {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                    )
                }
            } else {
                null
            },
        )

        if (suggestions.isNotEmpty()) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 2.dp,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    suggestions.forEachIndexed { index, suggestion ->
                        AddressSuggestionRow(
                            suggestion = suggestion,
                            enabled = !isResolvingSuggestion,
                            onClick = {
                                suggestions = emptyList()
                                isResolvingSuggestion = true
                                suggestionError = null
                                scope.launch {
                                    provider.resolveAddress(suggestion.placeId)
                                        .onSuccess { address ->
                                            suppressedQuery = address.line1.trim()
                                            onAddressSelected(address)
                                        }
                                        .onFailure { error ->
                                            suggestionError = "Unable to fill address from that suggestion."
                                            Napier.w("Billing address details lookup failed: ${error.message}", error)
                                        }
                                    isResolvingSuggestion = false
                                }
                            },
                        )
                        if (index < suggestions.lastIndex) {
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    Text(
                        text = "Powered by Google",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun AddressSuggestionRow(
    suggestion: BillingAddressSuggestion,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(
            text = suggestion.primaryText,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (suggestion.secondaryText.isNotBlank()) {
            Text(
                text = suggestion.secondaryText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

internal fun GooglePlaceDetails.toBillingAddressDraft(): BillingAddressDraft {
    val streetNumber = componentText("street_number")
    val route = componentText("route")
    val streetLine = listOfNotNull(streetNumber, route)
        .joinToString(" ")
        .trim()
        .ifBlank {
            componentText("premise")
                ?: componentText("street_address")
                ?: formattedAddress.orEmpty().substringBefore(",").trim()
        }

    val postalCode = componentText("postal_code")
    val postalSuffix = componentText("postal_code_suffix")
    val combinedPostalCode = when {
        postalCode.isNullOrBlank() -> ""
        postalSuffix.isNullOrBlank() -> postalCode
        else -> "$postalCode-$postalSuffix"
    }

    return BillingAddressDraft(
        line1 = streetLine,
        line2 = componentText("subpremise"),
        city = componentText("locality")
            ?: componentText("postal_town")
            ?: componentText("sublocality_level_1")
            ?: componentText("sublocality")
            ?: componentText("administrative_area_level_3")
            ?: componentText("administrative_area_level_2")
            ?: "",
        state = componentText("administrative_area_level_1", preferShortText = true).orEmpty(),
        postalCode = combinedPostalCode,
        countryCode = componentText("country", preferShortText = true).orEmpty(),
    )
}

private fun GooglePlaceDetails.componentText(
    type: String,
    preferShortText: Boolean = false,
): String? {
    val component = addressComponents.firstOrNull { type in it.types } ?: return null
    val preferred = if (preferShortText) component.shortText else component.longText
    return preferred
        .ifBlank { if (preferShortText) component.longText else component.shortText }
        .trim()
        .takeIf(String::isNotBlank)
}

internal val BillingAddressCountryOptions = listOf(
    DropdownOption(value = "US", label = "United States"),
)

internal val BillingAddressUsStateOptions = listOf(
    DropdownOption("AL", "Alabama"),
    DropdownOption("AK", "Alaska"),
    DropdownOption("AZ", "Arizona"),
    DropdownOption("AR", "Arkansas"),
    DropdownOption("CA", "California"),
    DropdownOption("CO", "Colorado"),
    DropdownOption("CT", "Connecticut"),
    DropdownOption("DE", "Delaware"),
    DropdownOption("DC", "District of Columbia"),
    DropdownOption("FL", "Florida"),
    DropdownOption("GA", "Georgia"),
    DropdownOption("HI", "Hawaii"),
    DropdownOption("ID", "Idaho"),
    DropdownOption("IL", "Illinois"),
    DropdownOption("IN", "Indiana"),
    DropdownOption("IA", "Iowa"),
    DropdownOption("KS", "Kansas"),
    DropdownOption("KY", "Kentucky"),
    DropdownOption("LA", "Louisiana"),
    DropdownOption("ME", "Maine"),
    DropdownOption("MD", "Maryland"),
    DropdownOption("MA", "Massachusetts"),
    DropdownOption("MI", "Michigan"),
    DropdownOption("MN", "Minnesota"),
    DropdownOption("MS", "Mississippi"),
    DropdownOption("MO", "Missouri"),
    DropdownOption("MT", "Montana"),
    DropdownOption("NE", "Nebraska"),
    DropdownOption("NV", "Nevada"),
    DropdownOption("NH", "New Hampshire"),
    DropdownOption("NJ", "New Jersey"),
    DropdownOption("NM", "New Mexico"),
    DropdownOption("NY", "New York"),
    DropdownOption("NC", "North Carolina"),
    DropdownOption("ND", "North Dakota"),
    DropdownOption("OH", "Ohio"),
    DropdownOption("OK", "Oklahoma"),
    DropdownOption("OR", "Oregon"),
    DropdownOption("PA", "Pennsylvania"),
    DropdownOption("RI", "Rhode Island"),
    DropdownOption("SC", "South Carolina"),
    DropdownOption("SD", "South Dakota"),
    DropdownOption("TN", "Tennessee"),
    DropdownOption("TX", "Texas"),
    DropdownOption("UT", "Utah"),
    DropdownOption("VT", "Vermont"),
    DropdownOption("VA", "Virginia"),
    DropdownOption("WA", "Washington"),
    DropdownOption("WV", "West Virginia"),
    DropdownOption("WI", "Wisconsin"),
    DropdownOption("WY", "Wyoming"),
    DropdownOption("AS", "American Samoa"),
    DropdownOption("GU", "Guam"),
    DropdownOption("MP", "Northern Mariana Islands"),
    DropdownOption("PR", "Puerto Rico"),
    DropdownOption("VI", "U.S. Virgin Islands"),
)

@Serializable
private data class GooglePlacesAutocompleteRequest(
    val input: String,
    val includedRegionCodes: List<String> = listOf("us"),
    val languageCode: String = "en-US",
    val regionCode: String = "us",
)

@Serializable
private data class GooglePlacesAutocompleteResponse(
    val suggestions: List<GooglePlacesSuggestion> = emptyList(),
)

@Serializable
private data class GooglePlacesSuggestion(
    val placePrediction: GooglePlacePrediction? = null,
)

@Serializable
private data class GooglePlacePrediction(
    val placeId: String = "",
    val text: GoogleFormattableText? = null,
    val structuredFormat: GoogleStructuredFormat? = null,
)

@Serializable
private data class GoogleStructuredFormat(
    val mainText: GoogleFormattableText? = null,
    val secondaryText: GoogleFormattableText? = null,
)

@Serializable
private data class GoogleFormattableText(
    val text: String = "",
)

@Serializable
internal data class GooglePlaceDetails(
    val id: String = "",
    val formattedAddress: String? = null,
    val addressComponents: List<GoogleAddressComponent> = emptyList(),
)

@Serializable
internal data class GoogleAddressComponent(
    val longText: String = "",
    val shortText: String = "",
    val types: List<String> = emptyList(),
)

