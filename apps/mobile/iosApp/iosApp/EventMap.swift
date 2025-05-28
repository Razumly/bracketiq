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

class IOSNativeViewFactory: NativeViewFactory {
    static var shared = IOSNativeViewFactory()
    
    func createNativeMapView(
        component: MapComponent,
        onEventSelected: @escaping (any EventAbs) -> Void,
        onPlaceSelected: @escaping (MVPPlace) -> Void,
        canClickPOI: Bool,
        focusedLocation: LatLng?,
        focusedEvent: (any EventAbs)?,
        revealCenterX: Double,
        revealCenterY: Double
    ) -> UIViewController {
        
        let centerPoint = CGPoint(x: revealCenterX, y: revealCenterY)
        let view = EventMap(
            component: component,
            onEventSelected: onEventSelected,
            onPlaceSelected: onPlaceSelected,
            canClickPOI: canClickPOI,
            focusedLocation: focusedLocation,
            focusedEvent: focusedEvent,
            revealCenter: centerPoint
        )
        
        let hostingController = UIHostingController(rootView: view)
        
        // Make the hosting controller's view transparent
        hostingController.view.backgroundColor = UIColor.clear
        
        return hostingController
    }
    
    func updateNativeMapView(
            viewController: UIViewController,
            component: MapComponent,
            onEventSelected: @escaping (any EventAbs) -> Void,
            onPlaceSelected: @escaping (MVPPlace) -> Void,
            canClickPOI: Bool,
            focusedLocation: LatLng?,
            focusedEvent: (any EventAbs)?,
            revealCenterX: Double,
            revealCenterY: Double
        ) {
            guard let hostingController = viewController as? UIHostingController<EventMap> else {
                return
            }
            
            let centerPoint = CGPoint(x: revealCenterX, y: revealCenterY)
            
            // Update the SwiftUI view with new parameters
            let updatedView = EventMap(
                component: component,
                onEventSelected: onEventSelected,
                onPlaceSelected: onPlaceSelected,
                canClickPOI: canClickPOI,
                focusedLocation: focusedLocation,
                focusedEvent: focusedEvent,
                revealCenter: centerPoint
            )
            
            hostingController.rootView = updatedView
        }
}

struct EventMap: View {
    var component: MapComponent
    var onEventSelected: (EventAbs) -> Void
    var onPlaceSelected: (MVPPlace) -> Void
    var canClickPOI: Bool
    var focusedEvent: EventAbs?
    var focusedLocation: LatLng?
    var revealCenter: CGPoint
    
    @State private var currentLocation: LatLng? = nil
    @State private var events: [EventAbs] = []
    @State private var suggestions: [MVPPlace] = []
    @State private var searchText: String = ""
    @State private var places: [MVPPlace] = []
    @State private var reveal: Bool = false
    @State private var searchTask: Task<Void, Never>? = nil
    
    init(
        component: MapComponent,
        onEventSelected: @escaping (EventAbs) -> Void,
        onPlaceSelected: @escaping (MVPPlace) -> Void,
        canClickPOI: Bool,
        focusedLocation: LatLng?,
        focusedEvent: EventAbs?,
        revealCenter: CGPoint
    ) {
        self.component = component
        self.onEventSelected = onEventSelected
        self.onPlaceSelected = onPlaceSelected
        self.canClickPOI = canClickPOI
        self.focusedLocation = focusedLocation
        self.focusedEvent = focusedEvent
        self.revealCenter = revealCenter
    }
    
    var body: some View {
        Observing(
            component.currentLocation,
            component.events,
            component.isMapVisible
        ) { (loc: LatLng?, ev: [EventAbs], reveal: KotlinBoolean) in
            ZStack(alignment: .top) {
                GoogleMapView(
                    component: component,
                    events: ev,
                    canClickPOI: canClickPOI,
                    focusedLocation: focusedLocation,
                    focusedEvent: focusedEvent,
                    onEventSelected: onEventSelected,
                    onPlaceSelected: onPlaceSelected,
                    places: places,
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
                                    places = try await component.searchPlaces(
                                        query: query,
                                        latLng: LatLng(latitude: currentLoc.latitude, longitude: currentLoc.longitude)
                                    )
                                }
                            }
                            searchText = ""
                        },
                        onSuggestionTap: { place in
                            Task {
                                if place.id == "Query" {
                                    if let currentLoc = loc {
                                        places = try await component.searchPlaces(
                                            query: place.name,
                                            latLng: LatLng(latitude: currentLoc.latitude, longitude: currentLoc.longitude)
                                        )
                                    }
                                } else {
                                    places = []
                                    let place = try await component.getPlace(placeId: place.id)
                                    if let place = place {
                                        onPlaceSelected(place)
                                    }
                                }
                            }
                        },
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
    let currentLocation: LatLng?
    let events: [EventAbs]
    let canClickPOI: Bool
    let focusedLocation: LatLng?
    let focusedEvent: EventAbs?
    let onEventSelected: (EventAbs) -> Void
    let onPlaceSelected: (MVPPlace) -> Void
    let places: [MVPPlace]
    let revealCenter: CGPoint
    
    init(
        component: MapComponent,
        currentLocation: LatLng? = nil,
        events: [EventAbs],
        canClickPOI: Bool = false,
        focusedLocation: LatLng? = nil,
        focusedEvent: EventAbs? = nil,
        onEventSelected: @escaping (EventAbs) -> Void,
        onPlaceSelected: @escaping (MVPPlace) -> Void,
        places: [MVPPlace],
        revealCenter: CGPoint
    ){
        self.component = component
        self.currentLocation = currentLocation
        self.events = events
        self.canClickPOI = canClickPOI
        self.focusedLocation = focusedLocation
        self.focusedEvent = focusedEvent
        self.onEventSelected = onEventSelected
        self.onPlaceSelected = onPlaceSelected
        self.places = places
        self.revealCenter = revealCenter
    }
    
    func makeUIView(context: Context) -> GMSMapView {
        let camera: GMSCameraPosition
        if let f = focusedLocation {
            camera = .camera(withLatitude: f.latitude, longitude: f.longitude, zoom: 15) // Increased zoom
        } else if let loc = currentLocation {
            camera = .camera(withLatitude: loc.latitude, longitude: loc.longitude, zoom: 15) // Increased zoom
        } else {
            camera = .camera(withLatitude: 0.0, longitude: 0.0, zoom: 2) // Default to SF with high zoom
        }
        
        let options = GMSMapViewOptions()
        options.camera = camera
        options.frame = .zero
        let mapView = GMSMapView.init(options: options)
        
        // Configure map for maximum POI visibility
        mapView.isMyLocationEnabled = true
        mapView.delegate = context.coordinator
        mapView.mapType = .normal
        
        // Enable all POI types
        mapView.settings.consumesGesturesInView = false
        mapView.settings.scrollGestures = true
        mapView.settings.zoomGestures = true
        
        // Debug: Check if POI clicks are working
        print("Map created with canClickPOI: \(canClickPOI)")
        
        return mapView
    }


    
    func updateUIView(_ mapView: GMSMapView, context: Context) {
        // 1) animate to newly focusedEvent or focusedLocation
        if let fe = focusedEvent, context.coordinator.lastEventId != fe.id {
            let pos = CLLocationCoordinate2D(latitude: fe.lat, longitude: fe.long)
            mapView.animate(to: cameraPosition(for: pos))
            context.coordinator.lastEventId = fe.id
        } else if let fc = focusedLocation,
                  context.coordinator.lastFocus ?? (0.0, 0.0) != (fc.latitude, fc.longitude) {
            let pos = CLLocationCoordinate2D(latitude: fc.latitude, longitude: fc.longitude)
            mapView.animate(to: cameraPosition(for: pos))
            context.coordinator.lastFocus = (fc.latitude, fc.longitude)
        }
        
        // 2) clear & re-draw markers
        mapView.clear()
        if !canClickPOI {
            for event in events {
                let coord = CLLocationCoordinate2D(latitude: event.lat, longitude: event.long)
                let m = GMSMarker(position: coord)
                m.title = event.name
                m.snippet = "\(event.fieldType) – $\(event.price)"
                m.userData = event
                m.map = mapView
            }
        }
        
        for place in places {
            let coord = CLLocationCoordinate2D(latitude: place.lat, longitude: place.long)
            let m = GMSMarker(position: coord)
            m.title = place.name
            m.userData = place
            m.map = mapView
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(
            parent: self,
            onEventSelected: onEventSelected,
            onPlaceSelected: onPlaceSelected
        )
    }
    
    private func cameraPosition(for coord: CLLocationCoordinate2D) -> GMSCameraPosition {
        GMSCameraPosition.camera(withTarget: coord, zoom: 12)
    }
}

class Coordinator: NSObject, GMSMapViewDelegate {
    let parent: GoogleMapView
    var lastFocus: (Double, Double)?
    var lastEventId: String?
    
    
    init(
        parent: GoogleMapView,
        onEventSelected: @escaping (EventAbs) -> Void,
        onPlaceSelected: @escaping (MVPPlace) -> Void
    ) {
        self.parent = parent
    }
    
    // Handle POI clicks
    // Handle POI clicks
    func mapView(
        _ mapView: GMSMapView,
        didTapPOIWithPlaceID placeID: String,
        name: String,
        location: CLLocationCoordinate2D
    ) {
        print("POI tapped: \(name) with ID: \(placeID)") // Debug log
        guard parent.canClickPOI else {
            print("POI clicks disabled")
            return
        }
        
        print("Processing POI click for: \(name)")
        mapView.animate(to: GMSCameraPosition.camera(withTarget: location, zoom: 15))
        
        Task {
            do {
                let place = try await self.parent.component.getPlace(placeId: placeID)
                if let place = place {
                    await MainActor.run {
                        self.parent.onPlaceSelected(place)
                    }
                }
            } catch {
                print("Error getting place details: \(error)")
            }
        }
    }

    
    // Tapping a marker (show its callout)
    func mapView(_ mapView: GMSMapView, didTap marker: GMSMarker) -> Bool {
        mapView.selectedMarker = marker
        return true
    }
    
    // Tapping the callout
    func mapView(_ mapView: GMSMapView, didTapInfoWindowOf marker: GMSMarker) {
        if let event = marker.userData as? EventAbs {
            parent.onEventSelected(event)
        } else if let place = marker.userData as? MVPPlace {
            parent.onPlaceSelected(place)
        }
    }
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
