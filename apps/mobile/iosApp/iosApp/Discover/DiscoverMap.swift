import ComposeApp
import SwiftUI

struct NativeDiscoverMapOverlay: View {
    @ObservedObject var state: DiscoverObservableState
    let selectedTab: NativeDiscoverTab
    let bottomPadding: CGFloat
    let recenterRequestToken: Int
    let onEventSelected: (Event) -> Void
    let onOrganizationSelected: (Organization) -> Void
    let onRentalSelected: (Organization) -> Void
    let onClose: () -> Void
    let onRecenter: () -> Void
    let showsSearchThisArea: Bool
    let isSearchingThisArea: Bool
    let onSearchThisArea: () -> Void

    var body: some View {
        ZStack {
            EventMap(
                component: state.mapComponent,
                onEventSelected: onEventSelected,
                onPlaceSelected: selectPlace,
                onPlaceSelectionPoint: { _, _ in },
                selectionRequiresConfirmation: false,
                originalPlace: nil,
                selectedPlace: nil,
                onPlaceSelectionCleared: {},
                canClickPOI: false,
                organizationLogoIdsById: organizationLogoIds,
                focusedLocation: focusedLocation,
                focusedEvent: selectedTab == .events ? state.selectedEvent : nil,
                showSelectedEventCards: true,
                recenterRequestToken: recenterRequestToken,
                locationButtonBottomPadding: bottomPadding + 76
            )
            .ignoresSafeArea()

            VStack {
                if selectedTab.supportsMap,
                   state.mapViewCenter != nil,
                   showsSearchThisArea || isSearchingThisArea {
                    Button(action: onSearchThisArea) {
                        HStack(spacing: 8) {
                            if isSearchingThisArea {
                                ProgressView()
                                    .tint(.white)
                            }
                            Text(isSearchingThisArea ? "Searching" : "Search this area")
                                .font(.subheadline.weight(.semibold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color.accentColor, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(isSearchingThisArea)
                    .shadow(color: .black.opacity(0.22), radius: 8, y: 3)
                    .padding(.top, 122)
                }

                Spacer()

                HStack(spacing: 10) {
                    if state.currentLocation != nil {
                        Button(action: onRecenter) {
                            Image(systemName: "location.fill")
                                .font(.system(size: 17, weight: .semibold))
                                .frame(width: 44, height: 44)
                                .background(.regularMaterial, in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Recenter map")
                    }

                    Button(action: onClose) {
                        Label("Close Map", systemImage: "list.bullet")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 20)
                            .frame(height: 44)
                            .background(.black, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .shadow(color: .black.opacity(0.2), radius: 8, y: 3)
                .padding(.bottom, bottomPadding + 12)
            }
        }
    }
}

private extension NativeDiscoverMapOverlay {
    var organizationLogoIds: [String: String] {
        Dictionary(
            uniqueKeysWithValues: (state.allOrganizations + state.rentals).compactMap { organization in
                guard let logoId = discoverNonEmpty(organization.logoId) else { return nil }
                return (organization.id, logoId)
            }
        )
    }

    var focusedLocation: LatLng? {
        if selectedTab == .events, let selectedEvent = state.selectedEvent {
            return LatLng(latitude: selectedEvent.latitude, longitude: selectedEvent.longitude)
        }
        return state.currentLocation
    }

    func selectPlace(_ place: MVPPlace) {
        switch selectedTab {
        case .organizations:
            if let organization = state.organizations.first(where: { $0.id == place.id })
                ?? state.component.organizationForMapPlace(placeId: place.id) {
                onOrganizationSelected(organization)
            }
        case .rentals:
            if let organization = state.rentals.first(where: { $0.id == place.id })
                ?? state.component.organizationForMapPlace(placeId: place.id) {
                onRentalSelected(organization)
            }
        case .events, .teams:
            break
        }
    }
}
