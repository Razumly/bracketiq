//
// EventMap.swift
// iosApp
//
// Created by Elesey Razumovskiy on 5/21/25.
// Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI
import ComposeApp
import GoogleMaps
import CoreLocation

private let discoverEventMarkerColor = UIColor(red: 37.0 / 255.0, green: 99.0 / 255.0, blue: 235.0 / 255.0, alpha: 1)
private let discoverOrganizationMarkerColor = UIColor(red: 22.0 / 255.0, green: 163.0 / 255.0, blue: 74.0 / 255.0, alpha: 1)
private let discoverRentalMarkerColor = UIColor(red: 249.0 / 255.0, green: 115.0 / 255.0, blue: 22.0 / 255.0, alpha: 1)
private let mapSelectedMarkerColor = UIColor(red: 37.0 / 255.0, green: 99.0 / 255.0, blue: 235.0 / 255.0, alpha: 1)
private let mapOriginalMarkerColor = UIColor(red: 220.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0, alpha: 1)
private let mapPlaceMarkerColor = UIColor(red: 100.0 / 255.0, green: 116.0 / 255.0, blue: 139.0 / 255.0, alpha: 1)
private let eventMarkerImageRequestSize = 96

private func focusedLocationMatchesUser(
    focusedLocation: LatLng?,
    userLocation: LatLng?,
    thresholdMeters: CLLocationDistance = 10
) -> Bool {
    guard let focusedLocation = focusedLocation, let userLocation = userLocation else { return false }
    let focused = CLLocation(latitude: focusedLocation.latitude, longitude: focusedLocation.longitude)
    let user = CLLocation(latitude: userLocation.latitude, longitude: userLocation.longitude)
    return focused.distance(from: user) <= thresholdMeters
}

private func enumTitleCase(_ value: String) -> String {
    return value
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: "_", with: " ")
        .replacingOccurrences(of: "-", with: " ")
        .split(whereSeparator: \.isWhitespace)
        .map { token in
            let normalized = token.lowercased()
            return normalized.prefix(1).uppercased() + normalized.dropFirst()
        }
        .joined(separator: " ")
}

private func eventTypeWithSportLabel(for event: Event) -> String {
    let eventTypeLabel = enumTitleCase(event.eventType.name)
    let sportLabel = event.sportId?
        .trimmingCharacters(in: .whitespacesAndNewlines)

    guard let sportLabel = sportLabel, !sportLabel.isEmpty else {
        return eventTypeLabel
    }

    return "\(eventTypeLabel): \(sportLabel)"
}

private func markerInitials(_ name: String) -> String {
    let parts = name
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .split(whereSeparator: \.isWhitespace)

    guard !parts.isEmpty else { return "?" }
    if parts.count == 1 {
        return String(parts[0].prefix(3)).uppercased()
    }
    return parts.prefix(3)
        .compactMap { $0.first }
        .map { String($0).uppercased() }
        .joined()
}

private func imagePreviewURL(imageId: String?, width: Int? = nil, height: Int? = nil) -> URL? {
    let normalizedImageId = imageId?
        .trimmingCharacters(in: .whitespacesAndNewlines)
        ?? ""
    guard !normalizedImageId.isEmpty else { return nil }

    if normalizedImageId.hasPrefix("http://") || normalizedImageId.hasPrefix("https://") {
        return URL(string: normalizedImageId)
    }

    let baseURLString = UtilKt.getImageUrl(fileId: normalizedImageId, width: nil, height: nil, trim: false)
    guard var components = URLComponents(string: baseURLString) else {
        return URL(string: baseURLString)
    }

    var queryItems = components.queryItems ?? []
    if let width = width {
        queryItems.append(URLQueryItem(name: "w", value: "\(width)"))
    }
    if let height = height {
        queryItems.append(URLQueryItem(name: "h", value: "\(height)"))
    }
    components.queryItems = queryItems.isEmpty ? nil : queryItems
    return components.url
}

private func normalizedImageId(_ value: String?) -> String? {
    let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return normalized.isEmpty ? nil : normalized
}

private func eventImageId(_ event: Event, organizationLogoIdsById: [String: String]) -> String? {
    if let imageId = normalizedImageId(event.imageId) {
        return imageId
    }

    guard
        let organizationId = normalizedImageId(event.organizationId),
        let logoId = normalizedImageId(organizationLogoIdsById[organizationId])
    else {
        return nil
    }

    return logoId
}

private func eventImagePreviewURL(
    event: Event,
    organizationLogoIdsById: [String: String],
    width: Int? = nil,
    height: Int? = nil
) -> URL? {
    imagePreviewURL(
        imageId: eventImageId(event, organizationLogoIdsById: organizationLogoIdsById),
        width: width,
        height: height
    )
}

private func remoteURL(_ value: String?) -> URL? {
    let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !normalized.isEmpty else { return nil }
    guard normalized.hasPrefix("http://") || normalized.hasPrefix("https://") else { return nil }
    return URL(string: normalized)
}

private func placeImageURL(_ place: MVPPlace, width: Int? = nil, height: Int? = nil) -> URL? {
    remoteURL(place.imageUrl) ?? imagePreviewURL(imageId: place.imageRef, width: width, height: height)
}

private func isInitialsAvatarURL(_ url: URL?) -> Bool {
    guard let url = url else { return false }
    return url.path.localizedCaseInsensitiveContains("/api/avatars/initials")
}

private func eventPriceLabel(for event: Event) -> String {
    event.displayPriceRangeLabel()
}

private func isSyntheticPlaceId(_ id: String) -> Bool {
    id.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("__")
}

private func coordinatesMatch(
    _ firstLatitude: Double,
    _ firstLongitude: Double,
    _ secondLatitude: Double,
    _ secondLongitude: Double,
    tolerance: Double = 0.000001
) -> Bool {
    abs(firstLatitude - secondLatitude) < tolerance &&
    abs(firstLongitude - secondLongitude) < tolerance
}

private func isUsableCoordinate(latitude: Double, longitude: Double) -> Bool {
    guard latitude.isFinite, longitude.isFinite else { return false }
    guard (-90.0...90.0).contains(latitude), (-180.0...180.0).contains(longitude) else { return false }
    return !(latitude == 0.0 && longitude == 0.0)
}

private func placesRepresentSameLocation(_ first: MVPPlace?, _ second: MVPPlace?) -> Bool {
    guard let first = first, let second = second else { return false }

    let firstId = first.id.trimmingCharacters(in: .whitespacesAndNewlines)
    let secondId = second.id.trimmingCharacters(in: .whitespacesAndNewlines)
    if !firstId.isEmpty, !secondId.isEmpty, !isSyntheticPlaceId(firstId), !isSyntheticPlaceId(secondId), firstId == secondId {
        return true
    }

    return coordinatesMatch(
        first.latitude,
        first.longitude,
        second.latitude,
        second.longitude
    )
}

private func markerRepresentsSelection(_ marker: GMSMarker?, place: MVPPlace?) -> Bool {
    guard let marker = marker, let place = place else { return false }

    if let placeData = marker.userData as? PlaceMarkerData {
        return placesRepresentSameLocation(placeData.place, place)
    }

    if let poiData = marker.userData as? POIMarkerData {
        let selectionId = place.id.trimmingCharacters(in: .whitespacesAndNewlines)
        if !selectionId.isEmpty, !isSyntheticPlaceId(selectionId), selectionId == poiData.placeId {
            return true
        }
        return coordinatesMatch(
            place.latitude,
            place.longitude,
            marker.position.latitude,
            marker.position.longitude
        )
    }

    return false
}

private func markerColor(for place: MVPPlace, selectedPlace: MVPPlace?, originalPlace: MVPPlace?) -> UIColor {
    if placesRepresentSameLocation(place, selectedPlace) {
        return mapSelectedMarkerColor
    }
    if placesRepresentSameLocation(place, originalPlace) {
        return mapOriginalMarkerColor
    }
    switch place.markerKind {
    case "organization":
        return discoverOrganizationMarkerColor
    case "rental":
        return discoverRentalMarkerColor
    default:
        return mapPlaceMarkerColor
    }
}

private func loadRemoteImage(
    from url: URL?,
    into imageView: UIImageView,
    marker: GMSMarker?,
    tracksMarkerView: Bool,
    markerName: String? = nil,
    markerColor: UIColor? = nil
) {
    guard let url = url else { return }
    let generatedInitialsAvatar = isInitialsAvatarURL(url)

    if tracksMarkerView {
        marker?.tracksViewChanges = true
    } else {
        marker?.tracksInfoWindowChanges = true
    }

    URLSession.shared.dataTask(with: url) { data, _, _ in
        guard let data = data, let image = UIImage(data: data) else {
            DispatchQueue.main.async {
                if tracksMarkerView {
                    if let marker = marker, let markerName = markerName, let markerColor = markerColor {
                        marker.iconView = makeInitialsMarkerIconView(name: markerName, color: markerColor)
                    }
                    marker?.tracksViewChanges = false
                } else {
                    marker?.tracksInfoWindowChanges = false
                }
            }
            return
        }

        DispatchQueue.main.async {
            if tracksMarkerView, let marker = marker, let markerName = markerName, let markerColor = markerColor {
                marker.iconView = generatedInitialsAvatar
                    ? makeLoadedInitialsAvatarMarkerIconView(name: markerName, image: image)
                    : makeLoadedMarkerIconView(
                        name: markerName,
                        color: markerColor,
                        image: image
                    )
                marker.tracksViewChanges = false
                return
            }

            imageView.image = image
            if tracksMarkerView {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    marker?.tracksViewChanges = false
                }
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    marker?.tracksInfoWindowChanges = false
                }
            }
        }
    }.resume()
}

private func makeLoadedMarkerIconView(
    name: String,
    color: UIColor,
    image: UIImage
) -> UIView {
    let size: CGFloat = 50
    let outerView = UIView(frame: CGRect(x: 0, y: 0, width: size, height: size))
    outerView.backgroundColor = .white
    outerView.layer.cornerRadius = size / 2
    outerView.layer.borderWidth = 3
    outerView.layer.borderColor = color.cgColor

    let imageView = UIImageView(frame: CGRect(x: 5, y: 5, width: 40, height: 40))
    imageView.image = image
    imageView.backgroundColor = UIColor.systemBackground
    imageView.contentMode = .scaleAspectFill
    imageView.layer.cornerRadius = 20
    imageView.clipsToBounds = true
    imageView.accessibilityLabel = "\(name) marker"
    outerView.addSubview(imageView)

    return outerView
}

private func makeLoadedInitialsAvatarMarkerIconView(
    name: String,
    image: UIImage
) -> UIView {
    let size: CGFloat = 48
    let outerView = UIView(frame: CGRect(x: 0, y: 0, width: size, height: size))
    outerView.backgroundColor = .clear
    outerView.layer.cornerRadius = size / 2
    outerView.layer.borderWidth = 3
    outerView.layer.borderColor = UIColor.white.cgColor

    let imageView = UIImageView(frame: outerView.bounds)
    imageView.image = image
    imageView.contentMode = .scaleAspectFill
    imageView.layer.cornerRadius = size / 2
    imageView.clipsToBounds = true
    imageView.accessibilityLabel = "\(name) marker"
    outerView.addSubview(imageView)

    return outerView
}

private func makeInitialsMarkerIconView(
    name: String,
    color: UIColor
) -> UIView {
    let size: CGFloat = 48
    let outerView = UIView(frame: CGRect(x: 0, y: 0, width: size, height: size))
    outerView.backgroundColor = color
    outerView.layer.cornerRadius = size / 2
    outerView.layer.borderWidth = 3
    outerView.layer.borderColor = UIColor.white.cgColor

    let label = UILabel(frame: outerView.bounds.insetBy(dx: 4, dy: 4))
    label.text = markerInitials(name)
    label.textAlignment = .center
    label.textColor = .white
    label.font = UIFont.boldSystemFont(ofSize: 15)
    label.adjustsFontSizeToFitWidth = true
    outerView.addSubview(label)

    return outerView
}

private func makeMarkerIconView(
    name: String,
    color: UIColor,
    imageURL: URL?,
    marker: GMSMarker?
) -> UIView {
    if imageURL == nil || isInitialsAvatarURL(imageURL) {
        let initialsView = makeInitialsMarkerIconView(name: name, color: color)
        if let imageURL = imageURL {
            let imageView = UIImageView(frame: initialsView.bounds.insetBy(dx: 4, dy: 4))
            imageView.contentMode = .scaleAspectFill
            imageView.layer.cornerRadius = imageView.bounds.width / 2
            imageView.clipsToBounds = true
            initialsView.addSubview(imageView)
            loadRemoteImage(
                from: imageURL,
                into: imageView,
                marker: marker,
                tracksMarkerView: true,
                markerName: name,
                markerColor: color
            )
        }
        return initialsView
    }

    let size: CGFloat = 50
    let outerView = UIView(frame: CGRect(x: 0, y: 0, width: size, height: size))
    outerView.backgroundColor = .white
    outerView.layer.cornerRadius = size / 2
    outerView.layer.borderWidth = 3
    outerView.layer.borderColor = color.cgColor

    let fallbackView = UIView(frame: CGRect(x: 5, y: 5, width: 40, height: 40))
    fallbackView.backgroundColor = UIColor.systemBackground
    fallbackView.layer.cornerRadius = 20
    fallbackView.clipsToBounds = true
    outerView.addSubview(fallbackView)

    let imageView = UIImageView(frame: CGRect(x: 5, y: 5, width: 40, height: 40))
    imageView.backgroundColor = UIColor.systemBackground
    imageView.contentMode = .scaleAspectFill
    imageView.layer.cornerRadius = 20
    imageView.clipsToBounds = true
    outerView.addSubview(imageView)
    loadRemoteImage(
        from: imageURL,
        into: imageView,
        marker: marker,
        tracksMarkerView: true,
        markerName: name,
        markerColor: color
    )

    return outerView
}

private func makeEventClusterIconView(count: Int) -> UIView {
    let size: CGFloat = 54
    let outerView = UIView(frame: CGRect(x: 0, y: 0, width: size, height: size))
    outerView.backgroundColor = discoverEventMarkerColor
    outerView.layer.cornerRadius = size / 2
    outerView.layer.borderWidth = 4
    outerView.layer.borderColor = UIColor.white.cgColor

    let label = UILabel(frame: outerView.bounds.insetBy(dx: 4, dy: 4))
    label.text = "\(max(count, 2))"
    label.textAlignment = .center
    label.textColor = .white
    label.font = UIFont.boldSystemFont(ofSize: 18)
    label.adjustsFontSizeToFitWidth = true
    outerView.addSubview(label)

    return outerView
}

private func dedupePlaces(_ places: [MVPPlace]) -> [MVPPlace] {
    var uniquePlaces: [MVPPlace] = []
    for place in places {
        if uniquePlaces.contains(where: { placesRepresentSameLocation($0, place) }) {
            continue
        }
        uniquePlaces.append(place)
    }
    return uniquePlaces
}

private struct EventMapCardCarousel: View {
    let events: [Event]
    @Binding var selectedIndex: Int
    let organizationLogoIdsById: [String: String]
    let onEventSelected: (Event) -> Void

    var body: some View {
        if !events.isEmpty {
            let boundedIndex = min(max(selectedIndex, 0), events.count - 1)
            let event = events[boundedIndex]

            VStack(spacing: 8) {
                Button {
                    onEventSelected(event)
                } label: {
                    EventMapCarouselCard(
                        event: event,
                        organizationLogoIdsById: organizationLogoIdsById
                    )
                }
                .buttonStyle(.plain)

                if events.count > 1 {
                    HStack {
                        Button {
                            selectedIndex = boundedIndex == 0 ? events.count - 1 : boundedIndex - 1
                        } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 17, weight: .semibold))
                                .frame(width: 44, height: 44)
                        }
                        .accessibilityLabel("Previous event")

                        Spacer()

                        Text("\(boundedIndex + 1) / \(events.count)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)

                        Spacer()

                        Button {
                            selectedIndex = boundedIndex == events.count - 1 ? 0 : boundedIndex + 1
                        } label: {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 17, weight: .semibold))
                                .frame(width: 44, height: 44)
                        }
                        .accessibilityLabel("Next event")
                    }
                    .frame(width: 280)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(.regularMaterial)
                    .clipShape(Capsule())
                }
            }
        }
    }
}

private struct EventMapCarouselCard: View {
    let event: Event
    let organizationLogoIdsById: [String: String]

    private var imageURL: URL? {
        eventImagePreviewURL(
            event: event,
            organizationLogoIdsById: organizationLogoIdsById,
            width: 560,
            height: 220
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let imageURL = imageURL {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        Color(uiColor: .secondarySystemBackground)
                    }
                }
                .frame(width: 280, height: 96)
                .clipped()
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(event.name)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                Text(eventTypeWithSportLabel(for: event))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color(uiColor: discoverEventMarkerColor))
                    .lineLimit(1)

                Text(event.location)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                let descriptionText = event.eventDescription.trimmingCharacters(in: .whitespacesAndNewlines)
                let locationText = event.location.trimmingCharacters(in: .whitespacesAndNewlines)
                if !descriptionText.isEmpty && descriptionText.localizedCaseInsensitiveCompare(locationText) != .orderedSame {
                    Text(descriptionText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }

                Text(event.teamSignup ? "Team registration" : "Individual registration")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)

                Text(eventPriceLabel(for: event))
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 2)
            }
            .padding(12)
        }
        .frame(width: 280)
        .background(Color(uiColor: .systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .shadow(color: .black.opacity(0.25), radius: 8, x: 0, y: 3)
    }
}

struct EventMap: View {
    var component: MapComponent
    var onEventSelected: (Event) -> Void
    var onPlaceSelected: (MVPPlace) -> Void
    var onPlaceSelectionPoint: (KotlinFloat, KotlinFloat) -> Void
    var selectionRequiresConfirmation: Bool
    var originalPlace: MVPPlace?
    var selectedPlace: MVPPlace?
    var onPlaceSelectionCleared: () -> Void
    var canClickPOI: Bool
    var organizationLogoIdsById: [String: String]
    var focusedEvent: Event?
    var focusedLocation: LatLng?
    var showSelectedEventCards: Bool
    var recenterRequestToken: Int
    var locationButtonBottomPadding: CGFloat
    
    @State private var suggestions: [MVPPlace] = []
    @State private var searchText: String = ""
    @State private var searchPlaces: [MVPPlace] = []
    @State private var searchTask: Task<Void, Never>? = nil
    @State private var selectedEventGroup: [Event] = []
    @State private var selectedEventIndex: Int = 0
    
    init(
        component: MapComponent,
        onEventSelected: @escaping (Event) -> Void,
        onPlaceSelected: @escaping (MVPPlace) -> Void,
        onPlaceSelectionPoint: @escaping (KotlinFloat, KotlinFloat) -> Void,
        selectionRequiresConfirmation: Bool,
        originalPlace: MVPPlace?,
        selectedPlace: MVPPlace?,
        onPlaceSelectionCleared: @escaping () -> Void,
        canClickPOI: Bool,
        organizationLogoIdsById: [String: String],
        focusedLocation: LatLng?,
        focusedEvent: Event?,
        showSelectedEventCards: Bool,
        recenterRequestToken: Int,
        locationButtonBottomPadding: CGFloat
    ) {
        self.component = component
        self.onEventSelected = onEventSelected
        self.onPlaceSelected = onPlaceSelected
        self.onPlaceSelectionPoint = onPlaceSelectionPoint
        self.selectionRequiresConfirmation = selectionRequiresConfirmation
        self.originalPlace = originalPlace
        self.selectedPlace = selectedPlace
        self.onPlaceSelectionCleared = onPlaceSelectionCleared
        self.canClickPOI = canClickPOI
        self.organizationLogoIdsById = organizationLogoIdsById
        self.focusedLocation = focusedLocation
        self.focusedEvent = focusedEvent
        self.showSelectedEventCards = showSelectedEventCards
        self.recenterRequestToken = recenterRequestToken
        self.locationButtonBottomPadding = locationButtonBottomPadding
    }
    
    var body: some View {
        Observing(
            component.currentLocation,
            component.events,
            component.places
        ) { (loc: LatLng?, ev: [Event], componentPlaces: [MVPPlace]) in
            ZStack(alignment: .top) {
                let mergedPlaces = dedupePlaces(searchPlaces + componentPlaces)
                GoogleMapView(
                    component: component,
                    events: ev,
                    canClickPOI: canClickPOI,
                    currentLocation: loc,
                    focusedLocation: focusedLocation,
                    isFocusedOnUserLocation: focusedLocationMatchesUser(
                        focusedLocation: focusedLocation,
                        userLocation: loc
                    ),
                    focusedEvent: focusedEvent,
                    onEventSelected: onEventSelected,
                    onEventGroupSelected: { events in
                        selectedEventGroup = events
                        selectedEventIndex = 0
                    },
                    onPlaceSelected: onPlaceSelected,
                    onPlaceSelectionPoint: onPlaceSelectionPoint,
                    selectionRequiresConfirmation: selectionRequiresConfirmation,
                    originalPlace: originalPlace,
                    selectedPlace: selectedPlace,
                    onPlaceSelectionCleared: onPlaceSelectionCleared,
                    onMapTapped: {
                        selectedEventGroup = []
                        selectedEventIndex = 0
                    },
                    places: mergedPlaces,
                    organizationLogoIdsById: organizationLogoIdsById,
                    recenterRequestToken: recenterRequestToken,
                    locationButtonBottomPadding: locationButtonBottomPadding
                )
                .edgesIgnoringSafeArea(.all)
                
                if canClickPOI {
                    MapSearchBar(
                        text: $searchText,
                        suggestions: suggestions,
                        onSearch: { query in
                            Task {
                                if let currentLoc = loc {
                                    // Clear previous search results
                                    searchPlaces = []
                                    // Add new search results
                                    searchPlaces = try await component.searchPlaces(
                                        query: query,
                                        latLng: LatLng(latitude: currentLoc.latitude, longitude: currentLoc.longitude)
                                    )
                                }
                                searchText = ""
                            }
                        },
                        onSuggestionTap: { place in
                            Task {
                                if place.id == "Query" {
                                    if let currentLoc = loc {
                                        // Clear previous results before new search
                                        searchPlaces = []
                                        searchPlaces = try await component.searchPlaces(
                                            query: place.name,
                                            latLng: LatLng(latitude: currentLoc.latitude, longitude: currentLoc.longitude)
                                        )
                                    } else {
                                        searchPlaces = []
                                    }
                                } else {
                                    let placeDetails = try await component.getPlace(placeId: place.id)
                                    if let placeDetails = placeDetails {
                                        // Clear previous results and set new single place
                                        searchPlaces = [placeDetails]
                                    }
                                }
                            }
                        }
,
                        onTextChanged: { newValue in
                            searchTask?.cancel()
                            
                            guard !newValue.isEmpty else {
                                suggestions = []
                                return
                            }
                            
                            // Create new debounced search task
                            searchTask = Task {
                                do {
                                    // Wait for 300ms (debounce delay)
                                    try await Task.sleep(nanoseconds: 300_000_000)
                                    
                                    // Check if task was cancelled during the delay
                                    try Task.checkCancellation()
                                    
                                    if let currentLoc = loc {
                                        suggestions = try await component.suggestPlaces(
                                            query: newValue,
                                            latLng: LatLng(latitude: currentLoc.latitude, longitude: currentLoc.longitude)
                                        )
                                    }
                                } catch is CancellationError {
                                    // Task was cancelled, do nothing
                                    print("Search task cancelled for: \(newValue)")
                                } catch {
                                    print("Search error: \(error)")
                                }
                            }
                        }
                    )
                    .zIndex(1)
                }

                if showSelectedEventCards && !selectedEventGroup.isEmpty {
                    VStack {
                        Spacer()
                        EventMapCardCarousel(
                            events: selectedEventGroup,
                            selectedIndex: $selectedEventIndex,
                            organizationLogoIdsById: organizationLogoIdsById,
                            onEventSelected: onEventSelected
                        )
                        .padding(.horizontal, 16)
                        .padding(.bottom, locationButtonBottomPadding + 48)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .background(Color.clear)
            .onChange(of: selectedPlace?.id) { newValue in
                guard selectionRequiresConfirmation, newValue == nil else { return }
                searchPlaces = []
                suggestions = []
                searchText = ""
            }
        }
    }
}

struct GoogleMapView: UIViewRepresentable {
    let component: MapComponent
    let events: [Event]
    let canClickPOI: Bool
    let currentLocation: LatLng?
    let focusedLocation: LatLng?
    let isFocusedOnUserLocation: Bool
    let focusedEvent: Event?
    let onEventSelected: (Event) -> Void
    let onEventGroupSelected: ([Event]) -> Void
    let onPlaceSelected: (MVPPlace) -> Void
    let onPlaceSelectionPoint: (KotlinFloat, KotlinFloat) -> Void
    let selectionRequiresConfirmation: Bool
    let originalPlace: MVPPlace?
    let selectedPlace: MVPPlace?
    let onPlaceSelectionCleared: () -> Void
    let onMapTapped: () -> Void
    let places: [MVPPlace]
    let organizationLogoIdsById: [String: String]
    let recenterRequestToken: Int
    let locationButtonBottomPadding: CGFloat
    
    func makeUIView(context: Context) -> GMSMapView {
        let camera: GMSCameraPosition
        if let f = focusedLocation {
            camera = .camera(withLatitude: f.latitude, longitude: f.longitude, zoom: 12)
        } else {
            camera = .camera(withLatitude: 0.0, longitude: 0.0, zoom: 2)
        }
        
        let options = GMSMapViewOptions()
        options.camera = camera
        options.frame = .zero
        if let mapID = Bundle.main.object(forInfoDictionaryKey: "GOOGLE_MAPS_MAP_ID") as? String,
           !mapID.isEmpty,
           !mapID.hasPrefix("$(") {
            options.mapID = GMSMapID(identifier: mapID)
        }
        
        let mapView = GMSMapView.init(options: options)
        mapView.isMyLocationEnabled = true
        mapView.settings.myLocationButton = false
        mapView.delegate = context.coordinator
        mapView.mapType = .normal
        mapView.settings.consumesGesturesInView = false
        mapView.settings.scrollGestures = true
        mapView.settings.zoomGestures = true
        context.coordinator.attach(to: mapView)
        context.coordinator.updateCameraViewport(mapView)

        if isFocusedOnUserLocation, focusedLocation != nil {
            context.coordinator.markInitialUserCameraFocusApplied()
        } else if let focusedLocation = focusedLocation {
            context.coordinator.recordExplicitFocus(
                CLLocationCoordinate2D(
                    latitude: focusedLocation.latitude,
                    longitude: focusedLocation.longitude
                )
            )
        }
        
        return mapView
    }
    
    func updateUIView(_ mapView: GMSMapView, context: Context) {
        context.coordinator.parent = self
        let distinctSelectedPlace = selectedPlace.flatMap { place in
            placesRepresentSameLocation(place, originalPlace) ? nil : place
        }
        mapView.padding = UIEdgeInsets(
            top: canClickPOI ? 160 : 0,
            left: 0,
            bottom: locationButtonBottomPadding,
            right: 16
        )
        context.coordinator.currentLocation = currentLocation
        context.coordinator.updateCameraViewport(mapView)

        if selectionRequiresConfirmation && selectedPlace == nil {
            context.coordinator.currentPOIMarker?.map = nil
            context.coordinator.currentPOIMarker = nil
        }

        let selectedMarkerKey = context.coordinator.selectionKey(for: mapView.selectedMarker)
        let nextMarkerRenderSignature = context.coordinator.markerRenderSignature(
            for: self,
            distinctSelectedPlace: distinctSelectedPlace
        )

        if context.coordinator.lastMarkerRenderSignature == nextMarkerRenderSignature {
            return
        }
        context.coordinator.lastMarkerRenderSignature = nextMarkerRenderSignature

        // Clear existing markers, but preserve transient POI selection so location updates
        // do not drop the user's in-progress map choice.
        mapView.clear()
        context.coordinator.clearRenderedMarkers()

        var markerToReselect: GMSMarker?

        if isFocusedOnUserLocation, let focusedLocation = focusedLocation {
            if context.coordinator.shouldApplyInitialUserCameraFocus() {
                let focusedCoordinate = CLLocationCoordinate2D(
                    latitude: focusedLocation.latitude,
                    longitude: focusedLocation.longitude
                )
                mapView.animate(with: GMSCameraUpdate.setTarget(focusedCoordinate))
                context.coordinator.markInitialUserCameraFocusApplied()
            }
        } else if let focusedLocation = focusedLocation, !(selectionRequiresConfirmation && selectedPlace != nil) {
            let focusedCoordinate = CLLocationCoordinate2D(
                latitude: focusedLocation.latitude,
                longitude: focusedLocation.longitude
            )
            context.coordinator.resetInitialUserCameraFocus()
            if context.coordinator.shouldRecenterOnExplicitFocus(
                focusedCoordinate,
                thresholdMeters: 1
            ) {
                let zoom = mapView.camera.zoom > 0 ? mapView.camera.zoom : 12
                mapView.camera = GMSCameraPosition.camera(withTarget: focusedCoordinate, zoom: zoom)
                context.coordinator.recordExplicitFocus(focusedCoordinate)
            }
        }

        if context.coordinator.shouldHandleRecenterRequest(recenterRequestToken) {
            context.coordinator.recenterOnCurrentLocationIfNeeded()
        }
        
        // Add event markers. In POI selection mode, only a focused event is rendered.
        for group in groupedEventMarkers(in: mapView) {
            let marker = GMSMarker(position: group.coordinate)
            marker.title = group.events.count == 1 ? group.events[0].name : "\(group.events.count) events"
            if group.events.count == 1 {
                let event = group.events[0]
                marker.snippet = "\(eventTypeWithSportLabel(for: event)) - \(eventPriceLabel(for: event))"
                marker.userData = EventMarkerData(event: event)
                marker.iconView = makeMarkerIconView(
                    name: event.name,
                    color: discoverEventMarkerColor,
                    imageURL: eventImagePreviewURL(
                        event: event,
                        organizationLogoIdsById: organizationLogoIdsById,
                        width: eventMarkerImageRequestSize,
                        height: eventMarkerImageRequestSize
                    ),
                    marker: marker
                )
            } else {
                marker.userData = EventClusterMarkerData(key: group.key, events: group.events)
                marker.iconView = makeEventClusterIconView(count: group.events.count)
            }
            marker.map = mapView
            if selectedMarkerKey == context.coordinator.selectionKey(for: marker) {
                markerToReselect = marker
            }
        }

        if let currentPOIMarker = context.coordinator.currentPOIMarker {
            let poiColor = markerRepresentsSelection(currentPOIMarker, place: originalPlace)
                ? mapOriginalMarkerColor
                : mapSelectedMarkerColor
            currentPOIMarker.iconView = makeMarkerIconView(
                name: currentPOIMarker.title ?? "Place",
                color: poiColor,
                imageURL: nil,
                marker: currentPOIMarker
            )
            currentPOIMarker.map = mapView
            if selectedMarkerKey == context.coordinator.selectionKey(for: currentPOIMarker) {
                markerToReselect = currentPOIMarker
            }
        }

        // Add searched places markers
        for place in places {
            let coord = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)
            let marker = GMSMarker(position: coord)
            marker.title = place.name
            marker.userData = PlaceMarkerData(place: place)
            marker.iconView = makeMarkerIconView(
                name: place.name,
                color: markerColor(for: place, selectedPlace: distinctSelectedPlace, originalPlace: originalPlace),
                imageURL: placeImageURL(
                    place,
                    width: eventMarkerImageRequestSize,
                    height: eventMarkerImageRequestSize
                ),
                marker: marker
            )
            marker.map = mapView

            context.coordinator.placeMarkers.append(marker)
            if selectedMarkerKey == context.coordinator.selectionKey(for: marker) {
                markerToReselect = marker
            }

            if places.count == 1 {
                mapView.animate(with: GMSCameraUpdate.setTarget(coord))
                // Show info window automatically for a single result if nothing is already selected.
                if markerToReselect == nil {
                    markerToReselect = marker
                }
            }
        }

        if selectionRequiresConfirmation, let originalPlace = originalPlace,
           !(originalPlace.latitude == 0 && originalPlace.longitude == 0) {
            let hasExistingOriginalMarker =
                context.coordinator.placeMarkers.contains { marker in
                    markerRepresentsSelection(marker, place: originalPlace)
                } ||
                markerRepresentsSelection(context.coordinator.currentPOIMarker, place: originalPlace)

            if !hasExistingOriginalMarker {
                let coord = CLLocationCoordinate2D(
                    latitude: originalPlace.latitude,
                    longitude: originalPlace.longitude
                )
                let marker = GMSMarker(position: coord)
                marker.title = originalPlace.name
                marker.userData = PlaceMarkerData(place: originalPlace)
                marker.iconView = makeMarkerIconView(
                    name: originalPlace.name,
                    color: mapOriginalMarkerColor,
                    imageURL: placeImageURL(
                        originalPlace,
                        width: eventMarkerImageRequestSize,
                        height: eventMarkerImageRequestSize
                    ),
                    marker: marker
                )
                marker.map = mapView
                context.coordinator.placeMarkers.append(marker)
                if selectedMarkerKey == context.coordinator.selectionKey(for: marker) {
                    markerToReselect = marker
                }
            }
        }

        if selectionRequiresConfirmation, let distinctSelectedPlace = distinctSelectedPlace,
           !(distinctSelectedPlace.latitude == 0 && distinctSelectedPlace.longitude == 0) {
            let hasExistingSelectionMarker =
                context.coordinator.placeMarkers.contains { marker in
                    markerRepresentsSelection(marker, place: distinctSelectedPlace)
                } ||
                markerRepresentsSelection(context.coordinator.currentPOIMarker, place: distinctSelectedPlace)

            if !hasExistingSelectionMarker {
                let coord = CLLocationCoordinate2D(
                    latitude: distinctSelectedPlace.latitude,
                    longitude: distinctSelectedPlace.longitude
                )
                let marker = GMSMarker(position: coord)
                marker.title = distinctSelectedPlace.name
                marker.userData = PlaceMarkerData(place: distinctSelectedPlace)
                marker.iconView = makeMarkerIconView(
                    name: distinctSelectedPlace.name,
                    color: mapSelectedMarkerColor,
                    imageURL: placeImageURL(
                        distinctSelectedPlace,
                        width: eventMarkerImageRequestSize,
                        height: eventMarkerImageRequestSize
                    ),
                    marker: marker
                )
                marker.map = mapView
                context.coordinator.placeMarkers.append(marker)
                if selectedMarkerKey == context.coordinator.selectionKey(for: marker) {
                    markerToReselect = marker
                }
            }
        }

        if selectionRequiresConfirmation {
            let confirmedMarker = selectedPlace.flatMap { selectedPlace in
                context.coordinator.placeMarkers.first { marker in
                    markerRepresentsSelection(marker, place: selectedPlace)
                } ?? {
                    guard let currentPOIMarker = context.coordinator.currentPOIMarker else { return nil }
                    return markerRepresentsSelection(currentPOIMarker, place: selectedPlace)
                        ? currentPOIMarker
                        : nil
                }()
            }
            let confirmedSelectionKey = context.coordinator.selectionKey(for: confirmedMarker)
            if let confirmedMarker,
               context.coordinator.lastConfirmedSelectionKey != confirmedSelectionKey {
                context.coordinator.animateToSelection(confirmedMarker, in: mapView)
            }
            mapView.selectedMarker = confirmedMarker
            context.coordinator.lastConfirmedSelectionKey = confirmedSelectionKey
        } else if let markerToReselect = markerToReselect {
            mapView.selectedMarker = markerToReselect
            context.coordinator.lastConfirmedSelectionKey = nil
        } else {
            context.coordinator.lastConfirmedSelectionKey = nil
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }
    
    private func cameraPosition(for coord: CLLocationCoordinate2D, zoom: Float = 12) -> GMSCameraPosition {
        GMSCameraPosition.camera(withTarget: coord, zoom: zoom)
    }

    fileprivate func eventSourceForCurrentMode() -> [Event] {
        let sourceEvents = canClickPOI ? focusedEvent.map { [$0] } ?? [] : events + (focusedEvent.map { [$0] } ?? [])
        var seenIds = Set<String>()
        var uniqueEvents: [Event] = []
        for event in sourceEvents {
            if seenIds.insert(event.id).inserted {
                uniqueEvents.append(event)
            }
        }
        return uniqueEvents
    }

    fileprivate func groupedEventMarkers(in mapView: GMSMapView) -> [EventMarkerGroup] {
        let markerTouchDistance: CGFloat = 54
        let thresholdSquared = markerTouchDistance * markerTouchDistance
        var pendingGroups: [PendingEventMarkerGroup] = []

        for event in eventSourceForCurrentMode().sorted(by: { first, second in
            if first.id == second.id { return first.name < second.name }
            return first.id < second.id
        }) {
            guard isUsableCoordinate(latitude: event.lat, longitude: event.long) else {
                continue
            }
            let coordinate = CLLocationCoordinate2D(latitude: event.lat, longitude: event.long)
            let point = mapView.projection.point(for: coordinate)
            var closestIndex: Int?
            var closestDistanceSquared = CGFloat.greatestFiniteMagnitude

            for index in pendingGroups.indices {
                let group = pendingGroups[index]
                let dx = point.x - group.center.x
                let dy = point.y - group.center.y
                let distanceSquared = dx * dx + dy * dy
                if distanceSquared <= thresholdSquared && distanceSquared < closestDistanceSquared {
                    closestIndex = index
                    closestDistanceSquared = distanceSquared
                }
            }

            if let closestIndex = closestIndex {
                let nextSize = CGFloat(pendingGroups[closestIndex].events.count + 1)
                pendingGroups[closestIndex].events.append(event)
                pendingGroups[closestIndex].center = CGPoint(
                    x: ((pendingGroups[closestIndex].center.x * (nextSize - 1)) + point.x) / nextSize,
                    y: ((pendingGroups[closestIndex].center.y * (nextSize - 1)) + point.y) / nextSize
                )
                pendingGroups[closestIndex].latitude =
                    ((pendingGroups[closestIndex].latitude * Double(nextSize - 1)) + event.lat) / Double(nextSize)
                pendingGroups[closestIndex].longitude =
                    ((pendingGroups[closestIndex].longitude * Double(nextSize - 1)) + event.long) / Double(nextSize)
            } else {
                pendingGroups.append(
                    PendingEventMarkerGroup(
                        events: [event],
                        center: point,
                        latitude: event.lat,
                        longitude: event.long
                    )
                )
            }
        }

        return pendingGroups.map { group in
            let groupedEvents = group.events.sorted { first, second in
                let firstName = first.name.localizedLowercase
                let secondName = second.name.localizedLowercase
                if firstName == secondName { return first.id < second.id }
                return firstName < secondName
            }
            let key: String
            if groupedEvents.count == 1 {
                key = "event:\(groupedEvents[0].id)"
            } else {
                key = "cluster:\(groupedEvents.map { $0.id }.sorted().joined(separator: "|"))"
            }
            return EventMarkerGroup(
                key: key,
                events: groupedEvents,
                coordinate: CLLocationCoordinate2D(
                    latitude: group.latitude,
                    longitude: group.longitude
                )
            )
        }
    }
}

class Coordinator: NSObject, GMSMapViewDelegate {
    var parent: GoogleMapView
    
    var placeMarkers: [GMSMarker] = []
    var currentPOIMarker: GMSMarker?
    var lastExplicitFocusLocation: CLLocation?
    fileprivate var lastConfirmedSelectionKey: MarkerSelectionKey?
    fileprivate var lastMarkerRenderSignature: MarkerRenderSignature?
    var lastHandledRecenterRequestToken: Int = 0
    var currentLocation: LatLng?
    private var hasAppliedInitialUserCameraFocus = false
    private weak var mapView: GMSMapView?
    
    init(parent: GoogleMapView) {
        self.parent = parent
    }
    
    func clearRenderedMarkers() {
        placeMarkers.removeAll()
    }

    func attach(to mapView: GMSMapView) {
        self.mapView = mapView
    }

    fileprivate func selectionKey(for marker: GMSMarker?) -> MarkerSelectionKey? {
        guard let marker = marker else { return nil }
        if let eventData = marker.userData as? EventMarkerData {
            return .event(eventData.event.id)
        }
        if let clusterData = marker.userData as? EventClusterMarkerData {
            return .eventCluster(clusterData.key)
        }
        if let placeData = marker.userData as? PlaceMarkerData {
            return .place(placeData.place.id)
        }
        if let poiData = marker.userData as? POIMarkerData {
            return .poi(poiData.placeId)
        }
        return nil
    }

    func shouldApplyInitialUserCameraFocus() -> Bool {
        !hasAppliedInitialUserCameraFocus
    }

    func markInitialUserCameraFocusApplied() {
        hasAppliedInitialUserCameraFocus = true
    }

    func resetInitialUserCameraFocus() {
        hasAppliedInitialUserCameraFocus = false
    }

    func shouldRecenterOnExplicitFocus(
        _ coordinate: CLLocationCoordinate2D,
        thresholdMeters: CLLocationDistance
    ) -> Bool {
        guard let lastExplicitFocusLocation = lastExplicitFocusLocation else { return true }
        let nextLocation = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        return nextLocation.distance(from: lastExplicitFocusLocation) >= thresholdMeters
    }

    func recordExplicitFocus(_ coordinate: CLLocationCoordinate2D) {
        lastExplicitFocusLocation = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
    }

    func shouldHandleRecenterRequest(_ token: Int) -> Bool {
        guard token != lastHandledRecenterRequestToken else { return false }
        lastHandledRecenterRequestToken = token
        return true
    }

    func animateToSelection(_ marker: GMSMarker, in mapView: GMSMapView) {
        let zoom = mapView.camera.zoom > 0 ? mapView.camera.zoom : 12
        mapView.animate(to: GMSCameraPosition.camera(withTarget: marker.position, zoom: zoom))
    }

    func recenterOnCurrentLocationIfNeeded() {
        guard let currentLocation = currentLocation, let mapView = mapView else { return }

        let coordinate = CLLocationCoordinate2D(
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude
        )
        let zoom = mapView.camera.zoom > 0 ? mapView.camera.zoom : 12
        mapView.animate(to: GMSCameraPosition.camera(withTarget: coordinate, zoom: zoom))
        markInitialUserCameraFocusApplied()
    }

    func updateCameraCenter(_ coordinate: CLLocationCoordinate2D) {
        parent.component.updateCameraCenter(
            center: LatLng(latitude: coordinate.latitude, longitude: coordinate.longitude)
        )
    }

    func updateCameraViewport(_ mapView: GMSMapView) {
        let coordinate = mapView.camera.target
        parent.component.updateCameraViewport(
            center: LatLng(latitude: coordinate.latitude, longitude: coordinate.longitude),
            radiusMiles: visibleRegionRadiusMiles(for: mapView)
        )
    }

    private func visibleRegionRadiusMiles(for mapView: GMSMapView) -> Double {
        let center = mapView.camera.target
        let centerLocation = CLLocation(latitude: center.latitude, longitude: center.longitude)
        let region = mapView.projection.visibleRegion()
        let corners = [region.nearLeft, region.nearRight, region.farLeft, region.farRight]
        let farthestMeters = corners
            .map { CLLocation(latitude: $0.latitude, longitude: $0.longitude).distance(from: centerLocation) }
            .max() ?? 0
        return max(farthestMeters / 1609.344, 0.25)
    }

    func mapView(_ mapView: GMSMapView, idleAt position: GMSCameraPosition) {
        updateCameraViewport(mapView)
    }

    fileprivate func markerRenderSignature(
        for map: GoogleMapView,
        distinctSelectedPlace: MVPPlace?
    ) -> MarkerRenderSignature {
        MarkerRenderSignature(
            eventKeys: map.eventSourceForCurrentMode()
                .map { event in
                    [
                        event.id,
                        roundedCoordinate(event.lat),
                        roundedCoordinate(event.long),
                        eventImageId(event, organizationLogoIdsById: map.organizationLogoIdsById) ?? "",
                    ].joined(separator: "|")
                }
                .sorted(),
            placeKeys: map.places
                .map(markerPlaceSignatureKey)
                .sorted(),
            originalPlaceKey: markerPlaceKey(map.originalPlace),
            selectedPlaceKey: markerPlaceKey(distinctSelectedPlace),
            selectionRequiresConfirmation: map.selectionRequiresConfirmation,
            canClickPOI: map.canClickPOI,
            focusedEventId: map.focusedEvent?.id,
            organizationLogoKeys: map.organizationLogoIdsById
                .map { "\($0.key)|\($0.value)" }
                .sorted()
        )
    }
    
    // MARK: - Custom Info Windows
    
    // This method creates custom info windows (like Android's MarkerInfoWindow)
    func mapView(_ mapView: GMSMapView, markerInfoWindow marker: GMSMarker) -> UIView? {
        if let eventData = marker.userData as? EventMarkerData {
            return createEventInfoWindow(for: eventData.event, marker: marker)
        } else if let placeData = marker.userData as? PlaceMarkerData {
            return createPlaceInfoWindow(for: placeData.place, marker: marker)
        } else if let poiData = marker.userData as? POIMarkerData {
            return createPOIInfoWindow(for: poiData.name, placeId: poiData.placeId)
        }
        return nil
    }
    
    // MARK: - Marker Click Handling
    
    func mapView(_ mapView: GMSMapView, didTap marker: GMSMarker) -> Bool {
        if parent.canClickPOI,
           parent.selectionRequiresConfirmation,
           selectPlace(from: marker, mapView: mapView) {
            mapView.selectedMarker = marker
            return true
        }
        if parent.canClickPOI,
           let selectedMarker = mapView.selectedMarker,
           selectedMarker === marker,
           selectPlace(from: marker, mapView: mapView) {
            return true
        }
        if let eventData = marker.userData as? EventMarkerData {
            parent.onEventGroupSelected([eventData.event])
            mapView.selectedMarker = nil
            return true
        }
        if let clusterData = marker.userData as? EventClusterMarkerData {
            parent.onEventGroupSelected(clusterData.events)
            mapView.selectedMarker = nil
            return true
        }
        // Show the custom info window
        mapView.selectedMarker = marker
        return true // Return true to prevent default behavior
    }

    func mapView(_ mapView: GMSMapView, didTapAt coordinate: CLLocationCoordinate2D) {
        parent.onMapTapped()
    }
    
    // Handle info window clicks (equivalent to onInfoWindowClick in Android)
    func mapView(_ mapView: GMSMapView, didTapInfoWindowOf marker: GMSMarker) {
        if let eventData = marker.userData as? EventMarkerData {
            parent.onEventSelected(eventData.event)
        } else {
            _ = selectPlace(from: marker, mapView: mapView)
        }
    }

    // MARK: - POI Click Handling
    
    func mapView(_ mapView: GMSMapView,
                 didTapPOIWithPlaceID placeID: String,
                 name: String,
                 location: CLLocationCoordinate2D) {
        guard parent.canClickPOI else { return }
        parent.onMapTapped()
        
        // Clear previous POI marker
        currentPOIMarker?.map = nil
        
        // Create new marker for POI with custom info window
        let marker = GMSMarker(position: location)
        marker.title = name
        marker.userData = POIMarkerData(name: name, placeId: placeID)
        marker.iconView = makeMarkerIconView(
            name: name,
            color: markerRepresentsSelection(marker, place: parent.originalPlace)
                ? mapOriginalMarkerColor
                : mapSelectedMarkerColor,
            imageURL: nil,
            marker: marker
        )
        marker.map = mapView
        
        currentPOIMarker = marker
        
        // Show info window immediately
        mapView.selectedMarker = marker
        if parent.selectionRequiresConfirmation {
            _ = selectPlace(from: marker, mapView: mapView)
        } else {
            mapView.animate(with: GMSCameraUpdate.setTarget(location))
        }
    }
    
    // MARK: - Custom Info Window Creation
    
    private func createEventInfoWindow(for event: Event, marker: GMSMarker) -> UIView {
        let imageURL = eventImagePreviewURL(
            event: event,
            organizationLogoIdsById: parent.organizationLogoIdsById,
            width: 560,
            height: 220
        )
        let locationText = event.location.trimmingCharacters(in: .whitespacesAndNewlines)
        let descriptionText = event.eventDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasDescription = !descriptionText.isEmpty && descriptionText.localizedCaseInsensitiveCompare(locationText) != .orderedSame
        let imageHeight: CGFloat = imageURL == nil ? 0 : 96
        let descriptionHeight: CGFloat = hasDescription ? 46 : 0
        let bodyTop = imageHeight + 12
        let containerHeight = imageHeight + 170 + descriptionHeight
        let containerView = UIView(frame: CGRect(x: 0, y: 0, width: 280, height: containerHeight))
        containerView.backgroundColor = UIColor.systemBackground
        containerView.layer.cornerRadius = 12
        containerView.clipsToBounds = false
        containerView.layer.shadowColor = UIColor.black.cgColor
        containerView.layer.shadowOffset = CGSize(width: 0, height: 2)
        containerView.layer.shadowOpacity = 0.3
        containerView.layer.shadowRadius = 8

        if let imageURL = imageURL {
            let imageView = UIImageView(frame: CGRect(x: 0, y: 0, width: 280, height: imageHeight))
            imageView.backgroundColor = UIColor.secondarySystemBackground
            imageView.contentMode = .scaleAspectFill
            imageView.clipsToBounds = true
            imageView.layer.cornerRadius = 12
            imageView.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
            containerView.addSubview(imageView)
            loadRemoteImage(from: imageURL, into: imageView, marker: marker, tracksMarkerView: false)
        }
        
        let nameLabel = UILabel(frame: CGRect(x: 12, y: bodyTop, width: 256, height: 38))
        nameLabel.text = event.name
        nameLabel.font = UIFont.boldSystemFont(ofSize: 16)
        nameLabel.numberOfLines = 2
        nameLabel.textColor = UIColor.label
        containerView.addSubview(nameLabel)
        
        let typeLabel = UILabel(frame: CGRect(x: 12, y: bodyTop + 42, width: 256, height: 18))
        typeLabel.text = eventTypeWithSportLabel(for: event)
        typeLabel.font = UIFont.systemFont(ofSize: 12)
        typeLabel.textColor = UIColor.systemBlue
        typeLabel.numberOfLines = 1
        typeLabel.lineBreakMode = .byTruncatingTail
        containerView.addSubview(typeLabel)

        let locationLabel = UILabel(frame: CGRect(x: 12, y: bodyTop + 64, width: 256, height: 20))
        locationLabel.text = locationText
        locationLabel.font = UIFont.systemFont(ofSize: 14)
        locationLabel.textColor = UIColor.secondaryLabel
        containerView.addSubview(locationLabel)

        var nextY = bodyTop + 88
        if hasDescription {
            let descriptionLabel = UILabel(frame: CGRect(x: 12, y: nextY, width: 256, height: descriptionHeight))
            descriptionLabel.text = descriptionText
            descriptionLabel.font = UIFont.systemFont(ofSize: 13)
            descriptionLabel.textColor = UIColor.secondaryLabel
            descriptionLabel.numberOfLines = 3
            containerView.addSubview(descriptionLabel)
            nextY += descriptionHeight + 4
        }

        let priceLabel = UILabel(frame: CGRect(x: 12, y: nextY + 4, width: 256, height: 28))
        priceLabel.text = eventPriceLabel(for: event)
        priceLabel.font = UIFont.boldSystemFont(ofSize: 20)
        priceLabel.textColor = UIColor.label
        priceLabel.textAlignment = .center
        containerView.addSubview(priceLabel)
        
        return containerView
    }
    
    private func createPlaceInfoWindow(for place: MVPPlace, marker: GMSMarker) -> UIView {
        let hasSelectionHint = parent.canClickPOI && !parent.selectionRequiresConfirmation
        let summaryText = place.summary?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let hasRichContent = !summaryText.isEmpty || placeImageURL(place) != nil
        let containerWidth: CGFloat = hasRichContent ? 260 : 200
        let summaryHeight: CGFloat = summaryText.isEmpty ? 0 : 48
        let containerHeight: CGFloat = hasRichContent
            ? 72 + summaryHeight + (hasSelectionHint ? 24 : 10)
            : (hasSelectionHint ? 84 : 60)
        let containerView = UIView(frame: CGRect(x: 0, y: 0, width: containerWidth, height: containerHeight))
        containerView.backgroundColor = UIColor.systemBackground
        containerView.layer.cornerRadius = 8
        containerView.layer.shadowColor = UIColor.black.cgColor
        containerView.layer.shadowOffset = CGSize(width: 0, height: 2)
        containerView.layer.shadowOpacity = 0.2
        containerView.layer.shadowRadius = 4
        
        if hasRichContent {
            let avatarView = UIView(frame: CGRect(x: 12, y: 12, width: 40, height: 40))
            avatarView.backgroundColor = UIColor.secondarySystemBackground
            avatarView.layer.cornerRadius = 20
            avatarView.clipsToBounds = true
            containerView.addSubview(avatarView)

            if let imageUrl = placeImageURL(place, width: eventMarkerImageRequestSize, height: eventMarkerImageRequestSize) {
                let imageView = UIImageView(frame: avatarView.bounds)
                imageView.backgroundColor = UIColor.secondarySystemBackground
                imageView.contentMode = .scaleAspectFill
                imageView.layer.cornerRadius = 20
                imageView.clipsToBounds = true
                avatarView.addSubview(imageView)
                loadRemoteImage(from: imageUrl, into: imageView, marker: marker, tracksMarkerView: false)
            } else {
                let initialsLabel = UILabel(frame: avatarView.bounds)
                initialsLabel.text = markerInitials(place.name)
                initialsLabel.textAlignment = .center
                initialsLabel.textColor = markerColor(for: place, selectedPlace: parent.selectedPlace, originalPlace: parent.originalPlace)
                initialsLabel.font = UIFont.boldSystemFont(ofSize: 14)
                avatarView.addSubview(initialsLabel)
            }

            let nameLabel = UILabel(frame: CGRect(x: 62, y: 10, width: 186, height: 44))
            nameLabel.text = place.name
            nameLabel.font = UIFont.boldSystemFont(ofSize: 16)
            nameLabel.numberOfLines = 2
            nameLabel.textColor = UIColor.label
            containerView.addSubview(nameLabel)

            if !summaryText.isEmpty {
                let summaryLabel = UILabel(frame: CGRect(x: 12, y: 62, width: 236, height: summaryHeight))
                summaryLabel.text = summaryText
                summaryLabel.font = UIFont.systemFont(ofSize: 13)
                summaryLabel.textColor = UIColor.secondaryLabel
                summaryLabel.numberOfLines = 3
                containerView.addSubview(summaryLabel)
            }
        } else {
            let nameLabel = UILabel(
                frame: CGRect(
                    x: 12,
                    y: 12,
                    width: 176,
                    height: hasSelectionHint ? 28 : 36
                )
            )
            nameLabel.text = place.name
            nameLabel.font = UIFont.systemFont(ofSize: 14)
            nameLabel.numberOfLines = 2
            nameLabel.textColor = UIColor.label
            nameLabel.textAlignment = .center
            containerView.addSubview(nameLabel)
        }

        if hasSelectionHint {
            let hintY: CGFloat = hasRichContent ? containerHeight - 26 : 44
            let hintLabel = UILabel(frame: CGRect(x: 12, y: hintY, width: containerWidth - 24, height: 20))
            hintLabel.text = "Click to select"
            hintLabel.font = UIFont.systemFont(ofSize: 12, weight: .semibold)
            hintLabel.textColor = UIColor.systemBlue
            hintLabel.textAlignment = .center
            containerView.addSubview(hintLabel)
        }
        
        return containerView
    }
    
    private func createPOIInfoWindow(for name: String, placeId: String) -> UIView {
        let hasSelectionHint = parent.canClickPOI && !parent.selectionRequiresConfirmation
        let containerHeight: CGFloat = hasSelectionHint ? 74 : 50
        let containerView = UIView(frame: CGRect(x: 0, y: 0, width: 200, height: containerHeight))
        containerView.backgroundColor = UIColor.systemBackground
        containerView.layer.cornerRadius = 8
        containerView.layer.shadowColor = UIColor.black.cgColor
        containerView.layer.shadowOffset = CGSize(width: 0, height: 2)
        containerView.layer.shadowOpacity = 0.2
        containerView.layer.shadowRadius = 4
        
        let nameLabel = UILabel(
            frame: CGRect(
                x: 12,
                y: 12,
                width: 176,
                height: hasSelectionHint ? 20 : 26
            )
        )
        nameLabel.text = name
        nameLabel.font = UIFont.systemFont(ofSize: 14)
        nameLabel.textColor = UIColor.label
        nameLabel.textAlignment = .center
        containerView.addSubview(nameLabel)

        if hasSelectionHint {
            let hintLabel = UILabel(frame: CGRect(x: 12, y: 36, width: 176, height: 20))
            hintLabel.text = "Click to select"
            hintLabel.font = UIFont.systemFont(ofSize: 12, weight: .semibold)
            hintLabel.textColor = UIColor.systemBlue
            hintLabel.textAlignment = .center
            containerView.addSubview(hintLabel)
        }
        
        return containerView
    }

    private func selectPlace(from marker: GMSMarker, mapView: GMSMapView) -> Bool {
        let selectedPoint = mapView.projection.point(for: marker.position)
        parent.onPlaceSelectionPoint(
            KotlinFloat(float: Float(selectedPoint.x)),
            KotlinFloat(float: Float(selectedPoint.y))
        )

        if let placeData = marker.userData as? PlaceMarkerData {
            parent.onPlaceSelected(placeData.place)
            return true
        } else if let poiData = marker.userData as? POIMarkerData {
            let fallbackPlace = parent.component.buildFallbackPlace(
                name: marker.title ?? poiData.name,
                placeId: poiData.placeId,
                latitude: marker.position.latitude,
                longitude: marker.position.longitude
            )
            Task {
                do {
                    let resolvedPlace =
                        try await parent.component.getPlace(placeId: poiData.placeId) ?? fallbackPlace
                    await MainActor.run {
                        self.parent.onPlaceSelected(resolvedPlace)
                    }
                } catch {
                    print("Error getting place details: \(error). Using fallback place.")
                    await MainActor.run {
                        self.parent.onPlaceSelected(fallbackPlace)
                    }
                }
            }
            return true
        }
        return false
    }

    private func createTransparentIcon() -> UIImage {
        let size = CGSize(width: 1, height: 1)
        UIGraphicsBeginImageContextWithOptions(size, false, 0)
        UIColor.clear.setFill()
        UIRectFill(CGRect(origin: .zero, size: size))
        let image = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        return image ?? UIImage()
    }
}

// MARK: - Marker Data Types

struct EventMarkerData {
    let event: Event
}

struct EventClusterMarkerData {
    let key: String
    let events: [Event]
}

fileprivate struct EventMarkerGroup {
    let key: String
    let events: [Event]
    let coordinate: CLLocationCoordinate2D
}

fileprivate struct PendingEventMarkerGroup {
    var events: [Event]
    var center: CGPoint
    var latitude: Double
    var longitude: Double
}

struct PlaceMarkerData {
    let place: MVPPlace
}

struct POIMarkerData {
    let name: String
    let placeId: String
}

fileprivate enum MarkerSelectionKey: Equatable {
    case event(String)
    case eventCluster(String)
    case place(String)
    case poi(String)
}

fileprivate struct MarkerRenderSignature: Equatable {
    let eventKeys: [String]
    let placeKeys: [String]
    let originalPlaceKey: String?
    let selectedPlaceKey: String?
    let selectionRequiresConfirmation: Bool
    let canClickPOI: Bool
    let focusedEventId: String?
    let organizationLogoKeys: [String]
}

private func roundedCoordinate(_ value: Double) -> String {
    String(format: "%.6f", value)
}

private func markerPlaceKey(_ place: MVPPlace?) -> String? {
    guard let place = place else { return nil }
    return markerPlaceSignatureKey(place)
}

private func markerPlaceSignatureKey(_ place: MVPPlace) -> String {
    [
        place.id.trimmingCharacters(in: .whitespacesAndNewlines),
        roundedCoordinate(place.latitude),
        roundedCoordinate(place.longitude),
        place.name.trimmingCharacters(in: .whitespacesAndNewlines),
        place.markerKind,
        place.imageUrl ?? "",
        place.imageRef ?? "",
    ].joined(separator: "|")
}



struct MapSearchBar: View {
    @Binding var text: String
    let suggestions: [MVPPlace]
    let onSearch: (String) -> Void
    let onSuggestionTap: (MVPPlace) -> Void
    let onTextChanged: (String) -> Void
    
    @FocusState private var isTextFieldFocused: Bool
    
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                TextField("Search places", text: $text)
                    .focused($isTextFieldFocused)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .onChange(of: text) { newValue in
                        onTextChanged(newValue)
                    }
                    .onSubmit {
                        onSearch(text)
                        text = ""
                        isTextFieldFocused = false
                    }
                    .padding(8)
                
                Button("Search") {
                    onSearch(text)
                    text = ""
                    isTextFieldFocused = false
                }
                .padding(.trailing, 8)
            }
            .background(Color(.systemBackground))
            .cornerRadius(8)
            .shadow(radius: 2)
            
            if !suggestions.isEmpty {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(suggestions, id: \.id) { place in
                            Button(action: {
                                onSuggestionTap(place)
                                isTextFieldFocused = false
                            }) {
                                HStack {
                                    Text(place.name)
                                        .foregroundColor(.primary)
                                    Spacer()
                                }
                                .padding(.vertical, 8)
                                .padding(.horizontal)
                            }
                            Divider()
                        }
                    }
                }
                .frame(maxHeight: 200)
                .background(Color(.systemBackground))
                .cornerRadius(8)
                .shadow(radius: 2)
            }
        }
        .padding(.horizontal)
    }
}
