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

struct EventMap: View {
    var component: MapComponent
    var onEventSelected: (Event) -> Void
    var onPlaceSelected: (MVPPlace) -> Void
    var onPlaceSelectionPoint: (KotlinFloat, KotlinFloat) -> Void
    var canClickPOI: Bool
    var focusedEvent: Event?
    var focusedLocation: LatLng?
    var revealCenter: CGPoint
    
    @State private var currentLocation: LatLng? = nil
    @State private var events: [Event] = []
    @State private var suggestions: [MVPPlace] = []
    @State private var searchText: String = ""
    @State private var searchPlaces: [MVPPlace] = []
    @State private var reveal: Bool = false
    @State private var searchTask: Task<Void, Never>? = nil
    
    init(
        component: MapComponent,
        onEventSelected: @escaping (Event) -> Void,
        onPlaceSelected: @escaping (MVPPlace) -> Void,
        onPlaceSelectionPoint: @escaping (KotlinFloat, KotlinFloat) -> Void,
        canClickPOI: Bool,
        focusedLocation: LatLng?,
        focusedEvent: Event?,
        revealCenter: CGPoint
    ) {
        self.component = component
        self.onEventSelected = onEventSelected
        self.onPlaceSelected = onPlaceSelected
        self.onPlaceSelectionPoint = onPlaceSelectionPoint
        self.canClickPOI = canClickPOI
        self.focusedLocation = focusedLocation
        self.focusedEvent = focusedEvent
        self.revealCenter = revealCenter
    }
    
    var body: some View {
        Observing(
            component.currentLocation,
            component.events,
            component.isMapVisible,
            component.places
        ) { (loc: LatLng?, ev: [Event], reveal: KotlinBoolean, componentPlaces: [MVPPlace]) in
            ZStack(alignment: .top) {
                let mergedPlaces = (searchPlaces + componentPlaces)
                GoogleMapView(
                    component: component,
                    events: ev,
                    canClickPOI: canClickPOI,
                    focusedLocation: focusedLocation,
                    focusedEvent: focusedEvent,
                    onEventSelected: onEventSelected,
                    onPlaceSelected: onPlaceSelected,
                    onPlaceSelectionPoint: onPlaceSelectionPoint,
                    places: mergedPlaces,
                    revealCenter: revealCenter
                )
                .edgesIgnoringSafeArea(.all)
                .opacity(reveal.boolValue ? 1.0 : 0.0)
                .allowsHitTesting(reveal.boolValue)
                .animation(.easeInOut(duration: 0.5), value: reveal.boolValue)
                
                if canClickPOI && reveal.boolValue {
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
        }
    }
}

struct GoogleMapView: UIViewRepresentable {
    let component: MapComponent
    let events: [Event]
    let canClickPOI: Bool
    let focusedLocation: LatLng?
    let focusedEvent: Event?
    let onEventSelected: (Event) -> Void
    let onPlaceSelected: (MVPPlace) -> Void
    let onPlaceSelectionPoint: (KotlinFloat, KotlinFloat) -> Void
    let places: [MVPPlace]
    let revealCenter: CGPoint
    
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
        mapView.delegate = context.coordinator
        mapView.mapType = .normal
        mapView.settings.consumesGesturesInView = false
        mapView.settings.scrollGestures = true
        mapView.settings.zoomGestures = true
        
        return mapView
    }
    
    func updateUIView(_ mapView: GMSMapView, context: Context) {
        // Clear existing markers
        mapView.clear()
        context.coordinator.clearAllMarkers()
        
        // Add focused event marker
        if let fe = focusedEvent {
            let coord = CLLocationCoordinate2D(latitude: fe.lat, longitude: fe.long)
            let marker = GMSMarker(position: coord)
            marker.title = fe.name
            marker.snippet = "\(fe.eventType.name) – $\(fe.price)"
            marker.userData = EventMarkerData(event: fe)
            marker.icon = GMSMarker.markerImage(with: .red)
            marker.map = mapView
            
            let camera = GMSCameraPosition.camera(withTarget: coord, zoom: 12)
            mapView.animate(to: camera)
        }
        
        // Add event markers (only when not in POI selection mode)
        if !canClickPOI {
            for event in events {
                let coord = CLLocationCoordinate2D(latitude: event.lat, longitude: event.long)
                let marker = GMSMarker(position: coord)
                marker.title = event.name
                marker.snippet = "\(event.eventType.name) – $\(event.price)"
                marker.userData = EventMarkerData(event: event)
                marker.icon = GMSMarker.markerImage(with: .blue)
                marker.map = mapView
            }
        }
        
        // Add searched places markers
        for place in places {
            let coord = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)
            let marker = GMSMarker(position: coord)
            marker.title = place.name
            marker.userData = PlaceMarkerData(place: place)
            marker.icon = GMSMarker.markerImage(with: .green)
            marker.map = mapView
            
            context.coordinator.placeMarkers.append(marker)
            
            if places.count == 1 {
                let camera = GMSCameraPosition.camera(withTarget: coord, zoom: 15)
                mapView.animate(to: camera)
                // Show info window automatically
                mapView.selectedMarker = marker
            }
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(
            parent: self,
            onEventSelected: onEventSelected,
            onPlaceSelected: onPlaceSelected,
            onPlaceSelectionPoint: onPlaceSelectionPoint
        )
    }
    
    private func cameraPosition(for coord: CLLocationCoordinate2D, zoom: Float = 12) -> GMSCameraPosition {
        GMSCameraPosition.camera(withTarget: coord, zoom: zoom)
    }
}

class Coordinator: NSObject, GMSMapViewDelegate {
    let parent: GoogleMapView
    let onEventSelected: (Event) -> Void
    let onPlaceSelected: (MVPPlace) -> Void
    let onPlaceSelectionPoint: (KotlinFloat, KotlinFloat) -> Void
    
    var placeMarkers: [GMSMarker] = []
    var currentPOIMarker: GMSMarker?
    
    init(parent: GoogleMapView,
         onEventSelected: @escaping (Event) -> Void,
         onPlaceSelected: @escaping (MVPPlace) -> Void,
         onPlaceSelectionPoint: @escaping (KotlinFloat, KotlinFloat) -> Void) {
        self.parent = parent
        self.onEventSelected = onEventSelected
        self.onPlaceSelected = onPlaceSelected
        self.onPlaceSelectionPoint = onPlaceSelectionPoint
    }
    
    func clearAllMarkers() {
        placeMarkers.removeAll()
        currentPOIMarker = nil
    }
    
    // MARK: - Custom Info Windows
    
    // This method creates custom info windows (like Android's MarkerInfoWindow)
    func mapView(_ mapView: GMSMapView, markerInfoWindow marker: GMSMarker) -> UIView? {
        if let eventData = marker.userData as? EventMarkerData {
            return createEventInfoWindow(for: eventData.event)
        } else if let placeData = marker.userData as? PlaceMarkerData {
            return createPlaceInfoWindow(for: placeData.place)
        } else if let poiData = marker.userData as? POIMarkerData {
            return createPOIInfoWindow(for: poiData.name)
        }
        return nil
    }
    
    // MARK: - Marker Click Handling
    
    func mapView(_ mapView: GMSMapView, didTap marker: GMSMarker) -> Bool {
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
            onEventSelected(eventData.event)
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
        // Use transparent icon since POI already has its own icon
        marker.icon = GMSMarker.markerImage(with: .green)
        marker.map = mapView
        
        currentPOIMarker = marker
        
        // Show info window immediately
        mapView.selectedMarker = marker
        
        // Animate to POI location
        let camera = GMSCameraPosition.camera(withTarget: location, zoom: 12)
        mapView.animate(to: camera)
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
        
        // Event type and field type
        let typeLabel = UILabel(frame: CGRect(x: 12, y: 76, width: 108, height: 16))
        typeLabel.text = event.eventType.name
        typeLabel.font = UIFont.systemFont(ofSize: 12)
        typeLabel.textColor = UIColor.systemBlue
        containerView.addSubview(typeLabel)
        
        let fieldLabel = UILabel(frame: CGRect(x: 120, y: 76, width: 108, height: 16))
        fieldLabel.text = event.state
        fieldLabel.font = UIFont.systemFont(ofSize: 12)
        fieldLabel.textColor = UIColor.systemPurple
        fieldLabel.textAlignment = .right
        containerView.addSubview(fieldLabel)
        
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
        let hasSelectionHint = parent.canClickPOI
        let containerHeight: CGFloat = hasSelectionHint ? 84 : 60
        let containerView = UIView(frame: CGRect(x: 0, y: 0, width: 200, height: containerHeight))
        containerView.backgroundColor = UIColor.systemBackground
        containerView.layer.cornerRadius = 8
        containerView.layer.shadowColor = UIColor.black.cgColor
        containerView.layer.shadowOffset = CGSize(width: 0, height: 2)
        containerView.layer.shadowOpacity = 0.2
        containerView.layer.shadowRadius = 4
        
        let nameLabel = UILabel(frame: CGRect(x: 12, y: 12, width: 176, height: hasSelectionHint ? 28 : 36))
        nameLabel.text = place.name
        nameLabel.font = UIFont.systemFont(ofSize: 14)
        nameLabel.numberOfLines = 2
        nameLabel.textColor = UIColor.label
        containerView.addSubview(nameLabel)

        if hasSelectionHint {
            let hintLabel = UILabel(frame: CGRect(x: 12, y: 44, width: 176, height: 20))
            hintLabel.text = "Click to select"
            hintLabel.font = UIFont.systemFont(ofSize: 12, weight: .semibold)
            hintLabel.textColor = UIColor.systemBlue
            containerView.addSubview(hintLabel)
        }
        
        return containerView
    }
    
    private func createPOIInfoWindow(for name: String) -> UIView {
        let hasSelectionHint = parent.canClickPOI
        let containerHeight: CGFloat = hasSelectionHint ? 74 : 50
        let containerView = UIView(frame: CGRect(x: 0, y: 0, width: 200, height: containerHeight))
        containerView.backgroundColor = UIColor.systemBackground
        containerView.layer.cornerRadius = 8
        containerView.layer.shadowColor = UIColor.black.cgColor
        containerView.layer.shadowOffset = CGSize(width: 0, height: 2)
        containerView.layer.shadowOpacity = 0.2
        containerView.layer.shadowRadius = 4
        
        let nameLabel = UILabel(frame: CGRect(x: 12, y: 12, width: 176, height: hasSelectionHint ? 20 : 26))
        nameLabel.text = name
        nameLabel.font = UIFont.systemFont(ofSize: 14)
        nameLabel.textColor = UIColor.label
        containerView.addSubview(nameLabel)

        if hasSelectionHint {
            let hintLabel = UILabel(frame: CGRect(x: 12, y: 36, width: 176, height: 20))
            hintLabel.text = "Click to select"
            hintLabel.font = UIFont.systemFont(ofSize: 12, weight: .semibold)
            hintLabel.textColor = UIColor.systemBlue
            containerView.addSubview(hintLabel)
        }
        
        return containerView
    }

    private func selectPlace(from marker: GMSMarker, mapView: GMSMapView) -> Bool {
        let selectedPoint = mapView.projection.point(for: marker.position)
        onPlaceSelectionPoint(
            KotlinFloat(float: Float(selectedPoint.x)),
            KotlinFloat(float: Float(selectedPoint.y))
        )

        if let placeData = marker.userData as? PlaceMarkerData {
            onPlaceSelected(placeData.place)
            return true
        } else if let poiData = marker.userData as? POIMarkerData {
            Task {
                do {
                    let place = try await parent.component.getPlace(placeId: poiData.placeId)
                    if let place = place {
                        await MainActor.run {
                            self.onPlaceSelected(place)
                        }
                    }
                } catch {
                    print("Error getting place details: \(error)")
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



// Custom circular reveal transition
extension AnyTransition {
    static func circularReveal(center: CGPoint) -> AnyTransition {
        .modifier(
            active: CircularRevealModifier(center: center, scale: 0),
            identity: CircularRevealModifier(center: center, scale: 1)
        )
    }
}

struct CircularRevealModifier: ViewModifier {
    let center: CGPoint
    let scale: CGFloat
    
    func body(content: Content) -> some View {
        content
            .clipShape(Circle()
                .scale(scale)
                .offset(x: center.x - UIScreen.main.bounds.width/2,
                       y: center.y - UIScreen.main.bounds.height/2))
    }
}
