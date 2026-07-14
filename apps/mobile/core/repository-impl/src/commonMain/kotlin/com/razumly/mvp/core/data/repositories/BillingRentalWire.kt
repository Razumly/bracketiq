package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Facility
import com.razumly.mvp.core.data.dataTypes.Field
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlin.time.Instant

private const val BOLD_SIGN_RATE_LIMIT_FRIENDLY_MESSAGE =
    "You opened the BoldSign document too many times. Please wait a minute before trying again."
private const val MAX_INCLUSIVE_PRICE_CENTS = 100_000_000
private const val CATALOG_RESOURCE_ORGANIZATIONS = "organizations"
private const val CATALOG_RESOURCE_PRODUCTS = "products"
private const val ORGANIZATION_PROJECTION_DETAIL = "detail"
private const val ORGANIZATION_PROJECTION_PUBLIC = "public"
private const val PRODUCT_PROJECTION_FULL = "full"
// The review mutation routes return getOrganizationReviewsPayload() with the backend's default 50.
private const val MUTATED_REVIEW_FIRST_PAGE_LIMIT = 50

/** The payment succeeded, but the server has rejected its idempotent rental booking mutation. */
@Serializable
internal data class CreateRentalOrderRequestDto(
    val eventId: String,
    val selections: List<RentalOrderSelectionRequest>,
    val sportId: String? = null,
    val paymentIntentId: String? = null,
    val renterOrganizationId: String? = null,
)

@Serializable
internal data class RentalOrderItemDto(
    val id: String? = null,
    val fieldId: String? = null,
    val start: String? = null,
    val end: String? = null,
    val eventId: String? = null,
    val eventTimeSlotId: String? = null,
)

@Serializable
internal data class RentalOrderResponseDto(
    val bookingId: String? = null,
    val billId: String? = null,
    val eventId: String? = null,
    val totalCents: Int? = null,
    val items: List<RentalOrderItemDto> = emptyList(),
    val createEventUrl: String? = null,
    val error: String? = null,
)

@Serializable
internal data class RentalBookingsResponseDto(
    val bookings: List<RentalBookingDto> = emptyList(),
)

@Serializable
internal data class RentalBookingDto(
    val id: String? = null,
    val organizationId: String? = null,
    val renterOrganizationId: String? = null,
    val eventId: String? = null,
    val status: String? = null,
    val totalAmountCents: Int? = null,
    val organization: RentalBookingOrganizationDto? = null,
    val items: List<RentalBookingItemDto> = emptyList(),
)

@Serializable
internal data class RentalBookingOrganizationDto(
    val id: String? = null,
    val name: String? = null,
    val location: String? = null,
    val address: String? = null,
    val coordinates: List<Double>? = null,
)

@Serializable
internal data class RentalBookingItemDto(
    val id: String? = null,
    val bookingId: String? = null,
    val organizationId: String? = null,
    val facilityId: String? = null,
    val fieldId: String? = null,
    val eventId: String? = null,
    val eventTimeSlotId: String? = null,
    val start: String? = null,
    val end: String? = null,
    val timeZone: String? = null,
    val priceCents: Int? = null,
    val requiredTemplateIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
    val field: RentalFieldDto? = null,
    val facility: RentalFacilityDto? = null,
)

@Serializable
internal data class RentalFieldDto(
    val id: String? = null,
    val fieldNumber: Int? = null,
    val divisions: List<String> = emptyList(),
    val lat: Double? = null,
    val long: Double? = null,
    val heading: Double? = null,
    val inUse: Boolean? = null,
    val name: String? = null,
    val rentalSlotIds: List<String> = emptyList(),
    val location: String? = null,
    val organizationId: String? = null,
    val facilityId: String? = null,
    val facility: RentalFacilityDto? = null,
)

@Serializable
internal data class RentalFacilityDto(
    val id: String? = null,
    val name: String? = null,
    val location: String? = null,
    val address: String? = null,
    val coordinates: List<Double>? = null,
    val status: String? = null,
    val affiliateUrl: String? = null,
)

internal data class RentalFieldWindow(
    val fieldId: String,
    val start: String,
    val end: String,
)

internal fun List<RentalOrderSelectionRequest>.toExpectedRentalFieldWindowsOrNull(): Set<RentalFieldWindow>? {
    val expectedWindows = linkedSetOf<RentalFieldWindow>()
    for (selection in this) {
        val parsedStart = runCatching { Instant.parse(selection.startDate.trim()) }.getOrNull() ?: return null
        val parsedEnd = runCatching { Instant.parse(selection.endDate.trim()) }.getOrNull() ?: return null
        if (parsedEnd <= parsedStart) return null
        val fieldIds = selection.scheduledFieldIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
        if (fieldIds.isEmpty()) return null
        fieldIds.forEach { fieldId ->
            expectedWindows += RentalFieldWindow(
                fieldId = fieldId,
                start = parsedStart.toString(),
                end = parsedEnd.toString(),
            )
        }
    }
    return expectedWindows.takeIf { it.isNotEmpty() }
}

internal fun RentalOrderResponseDto.toRentalOrderResultOrNull(
    expectedSelections: List<RentalOrderSelectionRequest>,
): RentalOrderResult? {
    val resolvedBookingId = bookingId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedItems = items.map { item -> item.toRentalOrderItemOrNull() ?: return null }
    if (resolvedItems.isEmpty() || resolvedItems.map(RentalOrderItem::id).distinct().size != resolvedItems.size) {
        return null
    }
    val expectedWindows = expectedSelections.toExpectedRentalFieldWindowsOrNull() ?: return null
    val returnedWindows = resolvedItems.map { item ->
        RentalFieldWindow(
            fieldId = item.fieldId,
            start = item.start,
            end = item.end,
        )
    }.toSet()
    if (returnedWindows.size != resolvedItems.size || returnedWindows != expectedWindows) {
        return null
    }
    return RentalOrderResult(
        bookingId = resolvedBookingId,
        billId = billId?.trim()?.takeIf(String::isNotBlank),
        eventId = eventId?.trim()?.takeIf(String::isNotBlank),
        totalCents = totalCents ?: 0,
        items = resolvedItems,
        createEventUrl = createEventUrl?.trim()?.takeIf(String::isNotBlank),
    )
}

internal fun RentalOrderItemDto.toRentalOrderItemOrNull(): RentalOrderItem? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedFieldId = fieldId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedStart = start?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedEnd = end?.trim()?.takeIf(String::isNotBlank) ?: return null
    val parsedStart = runCatching { Instant.parse(resolvedStart) }.getOrNull() ?: return null
    val parsedEnd = runCatching { Instant.parse(resolvedEnd) }.getOrNull() ?: return null
    if (parsedEnd <= parsedStart) return null
    return RentalOrderItem(
        id = resolvedId,
        fieldId = resolvedFieldId,
        start = parsedStart.toString(),
        end = parsedEnd.toString(),
        eventId = eventId?.trim()?.takeIf(String::isNotBlank),
        eventTimeSlotId = eventTimeSlotId?.trim()?.takeIf(String::isNotBlank),
    )
}

internal fun RentalBookingsResponseDto.toRentalResourceOptions(): List<RentalResourceOption> {
    return bookings.flatMap { booking -> booking.toRentalResourceOptions() }
        .sortedBy { option -> option.start }
}

internal fun RentalBookingDto.toRentalResourceOptions(): List<RentalResourceOption> {
    val resolvedBookingId = id?.trim()?.takeIf(String::isNotBlank) ?: return emptyList()
    val resolvedOrganizationId = organizationId?.trim()?.takeIf(String::isNotBlank) ?: return emptyList()
    val organizationName = organization?.name?.trim()?.takeIf(String::isNotBlank)
    return items.mapNotNull { item ->
        item.toRentalResourceOptionOrNull(
            bookingId = resolvedBookingId,
            bookingOrganizationId = resolvedOrganizationId,
            organizationName = organizationName,
            renterOrganizationId = renterOrganizationId?.trim()?.takeIf(String::isNotBlank),
        )
    }
}

internal fun RentalBookingItemDto.toRentalResourceOptionOrNull(
    bookingId: String,
    bookingOrganizationId: String,
    organizationName: String?,
    renterOrganizationId: String?,
): RentalResourceOption? {
    val resolvedItemId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val fallbackFacility = facility?.toFacilityOrNull()
    val resolvedField = field?.toFieldOrNull(
        fallbackFieldId = fieldId,
        fallbackOrganizationId = organizationId ?: bookingOrganizationId,
        fallbackFacilityId = facilityId,
        fallbackFacility = fallbackFacility,
    )
        ?: return null
    val resolvedStart = start?.trim()?.takeIf(String::isNotBlank)?.let { value ->
        runCatching { Instant.parse(value) }.getOrNull()
    } ?: return null
    val resolvedEnd = end?.trim()?.takeIf(String::isNotBlank)?.let { value ->
        runCatching { Instant.parse(value) }.getOrNull()
    } ?: return null
    if (resolvedEnd <= resolvedStart) {
        return null
    }
    return RentalResourceOption(
        id = "$bookingId:$resolvedItemId",
        bookingId = bookingId,
        bookingItemId = resolvedItemId,
        organizationId = bookingOrganizationId,
        organizationName = organizationName,
        renterOrganizationId = renterOrganizationId,
        field = resolvedField,
        start = resolvedStart,
        end = resolvedEnd,
        timeZone = timeZone?.trim()?.takeIf(String::isNotBlank) ?: "UTC",
        priceCents = priceCents ?: 0,
        requiredTemplateIds = requiredTemplateIds.normalizeStringList(),
        hostRequiredTemplateIds = hostRequiredTemplateIds.normalizeStringList(),
        eventId = eventId?.trim()?.takeIf(String::isNotBlank),
        eventTimeSlotId = eventTimeSlotId?.trim()?.takeIf(String::isNotBlank),
    )
}

internal fun RentalFieldDto.toFieldOrNull(
    fallbackFieldId: String?,
    fallbackOrganizationId: String?,
    fallbackFacilityId: String? = null,
    fallbackFacility: Facility? = null,
): Field? {
    val resolvedId = (id ?: fallbackFieldId)?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedFacility = facility?.toFacilityOrNull() ?: fallbackFacility
    return Field(
        fieldNumber = fieldNumber ?: 0,
        divisions = divisions.normalizeStringList(),
        lat = lat,
        long = long,
        heading = heading,
        inUse = inUse,
        name = name,
        rentalSlotIds = rentalSlotIds.normalizeStringList(),
        location = location,
        organizationId = organizationId?.trim()?.takeIf(String::isNotBlank)
            ?: fallbackOrganizationId?.trim()?.takeIf(String::isNotBlank),
        id = resolvedId,
    ).also { field ->
        field.facilityId = facilityId?.trim()?.takeIf(String::isNotBlank)
            ?: fallbackFacilityId?.trim()?.takeIf(String::isNotBlank)
            ?: resolvedFacility?.resolvedId?.takeIf(String::isNotBlank)
        field.facility = resolvedFacility
    }
}

internal fun RentalFacilityDto.toFacilityOrNull(): Facility? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedName = name?.trim()?.takeIf(String::isNotBlank)
    val resolvedLocation = location?.trim()?.takeIf(String::isNotBlank)
    val resolvedAddress = address?.trim()?.takeIf(String::isNotBlank)
    val resolvedStatus = status?.trim()?.takeIf(String::isNotBlank)
    val resolvedAffiliateUrl = affiliateUrl?.trim()?.takeIf(String::isNotBlank)
    if (
        resolvedName == null &&
        resolvedLocation == null &&
        resolvedAddress == null &&
        coordinates.isNullOrEmpty() &&
        resolvedAffiliateUrl == null
    ) {
        return null
    }
    return Facility(
        id = resolvedId,
        name = resolvedName,
        location = resolvedLocation,
        address = resolvedAddress,
        coordinates = coordinates,
        status = resolvedStatus,
        affiliateUrl = resolvedAffiliateUrl,
    )
}
