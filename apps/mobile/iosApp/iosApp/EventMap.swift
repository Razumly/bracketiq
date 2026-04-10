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
        
        let mapView = GMSMapView.init(options: options)
        mapView.isMyLocationEnabled = true
        mapView.settings.myLocationButton = false
        mapView.delegate = context.coordinator
        mapView.mapType = .normal
        mapView.settings.consumesGesturesInView = false
        mapView.settings.scrollGestures = true
        mapView.settings.zoomGestures = true
        context.coordinator.attach(to: mapView)

        if isFocusedOnUserLocation, let focusedLocation {
            context.coordinator.lastUserCameraLocation = CLLocation(
                latitude: focusedLocation.latitude,
                longitude: focusedLocation.longitude
            )
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
            let focusedCoordinate = CLLocationCoordinate2D(
                latitude: focusedLocation.latitude,
                longitude: focusedLocation.longitude
            )
            if context.coordinator.shouldRecenterOnUserLocation(
                focusedCoordinate,
                thresholdMeters: 1000
            ) {
                mapView.animate(with: GMSCameraUpdate.setTarget(focusedCoordinate))
                context.coordinator.recordUserCameraLocation(focusedCoordinate)
            }
        } else if let focusedLocation, !(selectionRequiresConfirmation && selectedPlace != nil) {
            let focusedCoordinate = CLLocationCoordinate2D(
                latitude: focusedLocation.latitude,
                longitude: focusedLocation.longitude
            )
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
            marker.icon = GMSMarker.markerImage(with: .red)
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
                marker.icon = GMSMarker.markerImage(with: .blue)
                marker.map = mapView
                if selectedMarkerKey == context.coordinator.selectionKey(for: marker) {
                    markerToReselect = marker
                }
            }
        }

        if let currentPOIMarker = context.coordinator.currentPOIMarker {
            if markerRepresentsSelection(currentPOIMarker, place: distinctSelectedPlace) {
                currentPOIMarker.icon = GMSMarker.markerImage(with: .systemBlue)
            } else if markerRepresentsSelection(currentPOIMarker, place: originalPlace) {
                currentPOIMarker.icon = GMSMarker.markerImage(with: .red)
            } else {
                currentPOIMarker.icon = GMSMarker.markerImage(with: .systemBlue)
            }
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
            marker.icon = GMSMarker.markerImage(
                with: placesRepresentSameLocation(place, distinctSelectedPlace)
                    ? .systemBlue
                    : placesRepresentSameLocation(place, originalPlace)
                        ? .red
                        : .systemBlue
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
                marker.icon = GMSMarker.markerImage(with: .red)
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
                marker.icon = GMSMarker.markerImage(with: .systemBlue)
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
    var lastUserCameraLocation: CLLocation?
    var lastExplicitFocusLocation: CLLocation?
    fileprivate var lastConfirmedSelectionKey: MarkerSelectionKey?
    var lastHandledRecenterRequestToken: Int = 0
    var currentLocation: LatLng?
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

    func shouldRecenterOnUserLocation(
        _ coordinate: CLLocationCoordinate2D,
        thresholdMeters: CLLocationDistance
    ) -> Bool {
        guard let lastUserCameraLocation else { return true }
        let nextLocation = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        return nextLocation.distance(from: lastUserCameraLocation) >= thresholdMeters
    }

    func recordUserCameraLocation(_ coordinate: CLLocationCoordinate2D) {
        lastUserCameraLocation = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
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
        recordUserCameraLocation(coordinate)
    }
    
    // MARK: - Custom Info Windows
    
    // This method creates custom info windows (like Android's MarkerInfoWindow)
    func mapView(_ mapView: GMSMapView, markerInfoWindow marker: GMSMarker) -> UIView? {
        if let eventData = marker.userData as? EventMarkerData {
            return createEventInfoWindow(for: eventData.event)
        } else if let placeData = marker.userData as? PlaceMarkerData {
            return createPlaceInfoWindow(for: placeData.place)
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
        marker.icon = GMSMarker.markerImage(
            with: markerRepresentsSelection(marker, place: parent.originalPlace) ? .red : .systemBlue
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
    
    private func createEventInfoWindow(for event: Event) -> UIView {
        let containerView = UIView(frame: CGRect(x: 0, y: 0, width: 240, height: 160))
        containerView.backgroundColor = UIColor.systemBackground
        containerView.layer.cornerRadius = 12
        containerView.layer.shadowColor = UIColor.black.cgColor
        containerView.layer.shadowOffset = CGSize(width: 0, height: 2)
        containerView.layer.shadowOpacity = 0.3
        containerView.layer.shadowRadius = 8
        
        // Event name
        let nameLabel = UILabel(frame: CGRect(x: 12, y: 12, width: 216, height: 40))
        nameLabel.text = event.name
        nameLabel.font = UIFont.boldSystemFont(ofSize: 16)
        nameLabel.numberOfLines = 2
        nameLabel.textColor = UIColor.label
        containerView.addSubview(nameLabel)
        
        // Location
        let locationLabel = UILabel(frame: CGRect(x: 12, y: 52, width: 216, height: 20))
        locationLabel.text = event.location
        locationLabel.font = UIFont.systemFont(ofSize: 14)
        locationLabel.textColor = UIColor.secondaryLabel
        containerView.addSubview(locationLabel)
        
        // Event type and sport type
        let typeLabel = UILabel(frame: CGRect(x: 12, y: 76, width: 216, height: 16))
        typeLabel.text = eventTypeWithSportLabel(for: event)
        typeLabel.font = UIFont.systemFont(ofSize: 12)
        typeLabel.textColor = UIColor.systemBlue
        typeLabel.numberOfLines = 1
        typeLabel.lineBreakMode = .byTruncatingTail
        containerView.addSubview(typeLabel)
        
        // Price
        let priceLabel = UILabel(frame: CGRect(x: 12, y: 100, width: 216, height: 30))
        priceLabel.text = "$\(event.price)"
        priceLabel.font = UIFont.boldSystemFont(ofSize: 20)
        priceLabel.textColor = UIColor.systemBlue
        priceLabel.textAlignment = .center
        containerView.addSubview(priceLabel)
        
        return containerView
    }
    
    private func createPlaceInfoWindow(for place: MVPPlace) -> UIView {
        let hasSelectionHint = parent.canClickPOI && !parent.selectionRequiresConfirmation
        let containerHeight: CGFloat = hasSelectionHint ? 84 : 60
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
                height: hasSelectionHint ? 28 : 36
            )
        )
        nameLabel.text = place.name
        nameLabel.font = UIFont.systemFont(ofSize: 14)
        nameLabel.numberOfLines = 2
        nameLabel.textColor = UIColor.label
        nameLabel.textAlignment = .center
        containerView.addSubview(nameLabel)

        if hasSelectionHint {
            let hintLabel = UILabel(frame: CGRect(x: 12, y: 44, width: 176, height: 20))
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
