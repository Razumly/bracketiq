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
    guard let focusedLocation, let userLocation else { return false }
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

    guard let sportLabel, !sportLabel.isEmpty else {
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

    let baseURLString = UtilKt.getImageUrl(fileId: normalizedImageId, width: nil, height: nil)
    guard var components = URLComponents(string: baseURLString) else {
        return URL(string: baseURLString)
    }

    var queryItems = components.queryItems ?? []
    if let width {
        queryItems.append(URLQueryItem(name: "w", value: "\(width)"))
    }
    if let height {
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
    return URL(string: normalized)
}

private func placeImageURL(_ place: MVPPlace, width: Int? = nil, height: Int? = nil) -> URL? {
    remoteURL(place.imageUrl) ?? imagePreviewURL(imageId: place.imageRef, width: width, height: height)
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

private func placesRepresentSameLocation(_ first: MVPPlace?, _ second: MVPPlace?) -> Bool {
    guard let first, let second else { return false }

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
    guard let marker, let place else { return false }

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
    tracksMarkerView: Bool
) {
    guard let url else { return }

    if tracksMarkerView {
        marker?.tracksViewChanges = true
    } else {
        marker?.tracksInfoWindowChanges = true
    }

    URLSession.shared.dataTask(with: url) { data, _, _ in
        guard let data, let image = UIImage(data: data) else {
            DispatchQueue.main.async {
                if tracksMarkerView {
                    marker?.tracksViewChanges = false
                } else {
                    marker?.tracksInfoWindowChanges = false
                }
            }
            return
        }

        DispatchQueue.main.async {
            imageView.image = image
            if tracksMarkerView {
                marker?.tracksViewChanges = false
            } else {
                marker?.tracksInfoWindowChanges = false
            }
        }
    }.resume()
}

private func makeMarkerIconView(
    name: String,
    color: UIColor,
    imageURL: URL?,
    marker: GMSMarker?
) -> UIView {
    let size: CGFloat = 50
    let outerView = UIView(frame: CGRect(x: 0, y: 0, width: size, height: size))
    outerView.backgroundColor = .white
    outerView.layer.cornerRadius = size / 2
    outerView.layer.borderWidth = imageURL == nil ? 0 : 3
    outerView.layer.borderColor = color.cgColor
    outerView.layer.shadowColor = UIColor.black.cgColor
    outerView.layer.shadowOffset = CGSize(width: 0, height: 3)
    outerView.layer.shadowOpacity = 0.25
    outerView.layer.shadowRadius = 6

    if let imageURL {
        let fallbackLabel = UILabel(frame: CGRect(x: 5, y: 5, width: 40, height: 40))
        fallbackLabel.text = markerInitials(name)
        fallbackLabel.textAlignment = .center
        fallbackLabel.textColor = color
        fallbackLabel.font = UIFont.boldSystemFont(ofSize: 14)
        outerView.addSubview(fallbackLabel)

        let imageView = UIImageView(frame: CGRect(x: 5, y: 5, width: 40, height: 40))
        imageView.backgroundColor = .clear
        imageView.contentMode = .scaleAspectFill
        imageView.layer.cornerRadius = 20
        imageView.clipsToBounds = true
        outerView.addSubview(imageView)
        loadRemoteImage(from: imageURL, into: imageView, marker: marker, tracksMarkerView: true)
    } else {
        outerView.backgroundColor = color
        outerView.layer.borderWidth = 3
        outerView.layer.borderColor = UIColor.white.cgColor
        let label = UILabel(frame: outerView.bounds.insetBy(dx: 4, dy: 4))
        label.text = markerInitials(name)
        label.textAlignment = .center
        label.textColor = .white
        label.font = UIFont.boldSystemFont(ofSize: 15)
        label.adjustsFontSizeToFitWidth = true
        outerView.addSubview(label)
    }

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
    var recenterRequestToken: Int
    var locationButtonBottomPadding: CGFloat
    
    @State private var suggestions: [MVPPlace] = []
    @State private var searchText: String = ""
    @State private var searchPlaces: [MVPPlace] = []
    @State private var searchTask: Task<Void, Never>? = nil
    
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
                    onPlaceSelected: onPlaceSelected,
                    onPlaceSelectionPoint: onPlaceSelectionPoint,
                    selectionRequiresConfirmation: selectionRequiresConfirmation,
                    originalPlace: originalPlace,
                    selectedPlace: selectedPlace,
                    onPlaceSelectionCleared: onPlaceSelectionCleared,
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
    let onPlaceSelected: (MVPPlace) -> Void
    let onPlaceSelectionPoint: (KotlinFloat, KotlinFloat) -> Void
    let selectionRequiresConfirmation: Bool
    let originalPlace: MVPPlace?
    let selectedPlace: MVPPlace?
    let onPlaceSelectionCleared: () -> Void
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

        if isFocusedOnUserLocation, let focusedLocation {
            context.coordinator.markInitialUserCameraFocusApplied()
        } else if let focusedLocation {
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

        // Clear existing markers, but preserve transient POI selection so location updates
        // do not drop the user's in-progress map choice.
        mapView.clear()
        context.coordinator.clearRenderedMarkers()

        var markerToReselect: GMSMarker?

        if isFocusedOnUserLocation, let focusedLocation {
            if context.coordinator.shouldApplyInitialUserCameraFocus() {
                let focusedCoordinate = CLLocationCoordinate2D(
                    latitude: focusedLocation.latitude,
                    longitude: focusedLocation.longitude
                )
                mapView.animate(with: GMSCameraUpdate.setTarget(focusedCoordinate))
                context.coordinator.markInitialUserCameraFocusApplied()
            }
        } else if let focusedLocation, !(selectionRequiresConfirmation && selectedPlace != nil) {
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
        
        // Add focused event marker
        if let fe = focusedEvent {
            let coord = CLLocationCoordinate2D(latitude: fe.lat, longitude: fe.long)
            let marker = GMSMarker(position: coord)
            marker.title = fe.name
            marker.snippet = "\(eventTypeWithSportLabel(for: fe)) – $\(fe.price)"
            marker.userData = EventMarkerData(event: fe)
            marker.iconView = makeMarkerIconView(
                name: fe.name,
                color: discoverEventMarkerColor,
                imageURL: eventImagePreviewURL(
                    event: fe,
                    organizationLogoIdsById: organizationLogoIdsById,
                    width: eventMarkerImageRequestSize,
                    height: eventMarkerImageRequestSize
                ),
                marker: marker
            )
            marker.map = mapView
            if selectedMarkerKey == context.coordinator.selectionKey(for: marker) {
                markerToReselect = marker
            }
        }

        // Add event markers (only when not in POI selection mode)
        if !canClickPOI {
            for event in events {
                let coord = CLLocationCoordinate2D(latitude: event.lat, longitude: event.long)
                let marker = GMSMarker(position: coord)
                marker.title = event.name
                marker.snippet = "\(eventTypeWithSportLabel(for: event)) – $\(event.price)"
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
                marker.map = mapView
                if selectedMarkerKey == context.coordinator.selectionKey(for: marker) {
                    markerToReselect = marker
                }
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

        if selectionRequiresConfirmation, let originalPlace,
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

        if selectionRequiresConfirmation, let distinctSelectedPlace,
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
        } else if let markerToReselect {
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
}

class Coordinator: NSObject, GMSMapViewDelegate {
    var parent: GoogleMapView
    
    var placeMarkers: [GMSMarker] = []
    var currentPOIMarker: GMSMarker?
    var lastExplicitFocusLocation: CLLocation?
    fileprivate var lastConfirmedSelectionKey: MarkerSelectionKey?
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
        guard let marker else { return nil }
        if let eventData = marker.userData as? EventMarkerData {
            return .event(eventData.event.id)
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
        guard let lastExplicitFocusLocation else { return true }
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
        guard let currentLocation, let mapView else { return }

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
        // Show the custom info window
        mapView.selectedMarker = marker
        return true // Return true to prevent default behavior
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

        if let imageURL {
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
        priceLabel.text = "$\(event.price)"
        priceLabel.font = UIFont.boldSystemFont(ofSize: 20)
        priceLabel.textColor = UIColor.systemBlue
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
            avatarView.backgroundColor = markerColor(for: place, selectedPlace: parent.selectedPlace, originalPlace: parent.originalPlace).withAlphaComponent(0.14)
            avatarView.layer.cornerRadius = 20
            avatarView.clipsToBounds = true
            containerView.addSubview(avatarView)

            let initialsLabel = UILabel(frame: avatarView.bounds)
            initialsLabel.text = markerInitials(place.name)
            initialsLabel.textAlignment = .center
            initialsLabel.textColor = markerColor(for: place, selectedPlace: parent.selectedPlace, originalPlace: parent.originalPlace)
            initialsLabel.font = UIFont.boldSystemFont(ofSize: 14)
            avatarView.addSubview(initialsLabel)

            if let imageUrl = placeImageURL(place, width: eventMarkerImageRequestSize, height: eventMarkerImageRequestSize) {
                let imageView = UIImageView(frame: avatarView.bounds)
                imageView.backgroundColor = UIColor.clear
                imageView.contentMode = .scaleAspectFill
                imageView.layer.cornerRadius = 20
                imageView.clipsToBounds = true
                avatarView.addSubview(imageView)
                loadRemoteImage(from: imageUrl, into: imageView, marker: marker, tracksMarkerView: false)
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

struct PlaceMarkerData {
    let place: MVPPlace
}

struct POIMarkerData {
    let name: String
    let placeId: String
}

fileprivate enum MarkerSelectionKey: Equatable {
    case event(String)
    case place(String)
    case poi(String)
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
