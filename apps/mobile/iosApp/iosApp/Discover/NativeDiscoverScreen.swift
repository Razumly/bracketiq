import ComposeApp
import CoreLocation
import SwiftUI
import UIKit

enum NativeDiscoverTab: String, CaseIterable, Identifiable {
    case events
    case organizations
    case teams
    case rentals

    var id: String { rawValue }

    var title: String {
        switch self {
        case .events: return "Events"
        case .organizations: return "Orgs"
        case .teams: return "Teams"
        case .rentals: return "Rentals"
        }
    }

    var systemImage: String {
        switch self {
        case .events: return "calendar"
        case .organizations: return "person.3"
        case .teams: return "sportscourt"
        case .rentals: return "building.2"
        }
    }

    var searchPlaceholder: String {
        switch self {
        case .events: return "Search events"
        case .organizations: return "Search orgs"
        case .teams: return "Search teams"
        case .rentals: return "Search rentals"
        }
    }

    var supportsFilters: Bool {
        true
    }

    var supportsMap: Bool {
        self != .teams
    }
}

struct NativeDiscoverScreen: View {
    let bottomPadding: CGFloat
    let shouldShowOnboarding: Bool
    let onOnboardingCompleted: () -> Void

    @StateObject private var state: DiscoverObservableState
    @State private var selectedTab = NativeDiscoverTab.events
    @State private var searchQuery = ""
    @State private var submittedSearchQuery = ""
    @State private var showsSuggestions = false
    @State private var showsFilters = false
    @State private var searchTask: Task<Void, Never>?
    @State private var recenterRequestToken = 0
    @State private var presentedError: String?
    @State private var loadedInitialMapTab: NativeDiscoverTab?
    @State private var lastMapSearchViewport: NativeDiscoverMapViewport?
    @State private var lastMapSearchTab: NativeDiscoverTab?
    @State private var isSearchingOrganizationMap = false
    @State private var onboardingStepIndex: Int?
    @State private var hasCompletedOnboarding = false
    @FocusState private var searchFocused: Bool

    init(
        component: EventSearchComponent,
        mapComponent: MapComponent,
        bottomPadding: CGFloat,
        shouldShowOnboarding: Bool,
        onOnboardingCompleted: @escaping () -> Void
    ) {
        self.bottomPadding = bottomPadding
        self.shouldShowOnboarding = shouldShowOnboarding
        self.onOnboardingCompleted = onOnboardingCompleted
        _state = StateObject(
            wrappedValue: DiscoverObservableState(
                component: component,
                mapComponent: mapComponent
            )
        )
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color(uiColor: .systemGroupedBackground)
                .ignoresSafeArea()

            NativeDiscoverResultsView(
                state: state,
                selectedTab: selectedTab,
                searchQuery: submittedSearchQuery,
                topPadding: 118,
                bottomPadding: bottomPadding + 28,
                onEventSelected: { event in
                    state.component.viewEvent(event: event)
                },
                onEventMapSelected: openEventMap,
                onOrganizationSelected: { organization in
                    state.component.viewOrganization(
                        organization: organization,
                        initialTab: .overview
                    )
                },
                onTeamSelected: openTeam,
                onRentalSelected: openRental
            )

            if state.isMapVisible {
                NativeDiscoverMapOverlay(
                    state: state,
                    selectedTab: selectedTab,
                    bottomPadding: bottomPadding,
                    recenterRequestToken: recenterRequestToken,
                    onEventSelected: { event in
                        state.component.viewEvent(event: event)
                    },
                    onOrganizationSelected: { organization in
                        state.component.viewOrganization(
                            organization: organization,
                            initialTab: .overview
                        )
                    },
                    onRentalSelected: openRental,
                    onClose: state.mapComponent.closeMap,
                    onRecenter: { recenterRequestToken += 1 },
                    showsSearchThisArea: shouldShowSearchThisArea,
                    isSearchingThisArea: state.isMapLoading || isSearchingOrganizationMap,
                    onSearchThisArea: searchThisArea
                )
                .transition(.opacity)
                .zIndex(2)
            }

            if showsSuggestions {
                Color.black.opacity(0.001)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture {
                        dismissSearch()
                    }
                    .zIndex(2.5)
            }

            VStack(spacing: 0) {
                NativeDiscoverTabBar(
                    selectedTab: $selectedTab,
                    onSelection: selectTab
                )
                .nativeDiscoverGuideTarget(.tabs)

                NativeDiscoverSearchBar(
                    text: $searchQuery,
                    isFocused: $searchFocused,
                    placeholder: selectedTab.searchPlaceholder,
                    supportsFilters: selectedTab.supportsFilters,
                    hasActiveFilters: hasActiveFilters,
                    onSubmit: submitSearch,
                    onDismiss: {
                        dismissSearch(clearQuery: true)
                    },
                    onFilterTapped: {
                        dismissSearch()
                        showsFilters = true
                    }
                )
                .padding(.horizontal, 12)
                .padding(.top, 8)
                .nativeDiscoverGuideTarget(.search)

                if showsSuggestions {
                    NativeDiscoverSuggestionsView(
                        state: state,
                        selectedTab: selectedTab,
                        query: searchQuery,
                        onEventSelected: selectEventSuggestion,
                        onOrganizationSelected: selectOrganizationSuggestion,
                        onTeamSelected: selectTeamSuggestion,
                        onRentalSelected: selectRentalSuggestion,
                        onScrollStarted: {
                            dismissSearch()
                        }
                    )
                    .padding(.horizontal, 12)
                    .padding(.top, 4)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }

                Spacer(minLength: 0)
            }
            .zIndex(3)

            if !state.isMapVisible && selectedTab.supportsMap && !showsSuggestions {
                VStack {
                    Spacer()
                    Button(action: openCurrentTabMap) {
                        Label("Map", systemImage: "map")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 22)
                            .padding(.vertical, 12)
                            .background(.black, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .shadow(color: .black.opacity(0.2), radius: 8, y: 3)
                    .nativeDiscoverGuideTarget(.map)
                    .padding(.bottom, bottomPadding + 12)
                }
                .zIndex(1)
            }
        }
        .accessibilityHidden(onboardingStepIndex != nil)
        .overlayPreferenceValue(NativeDiscoverGuideTargetPreferenceKey.self) { targetAnchors in
            if let onboardingStepIndex {
                NativeDiscoverOnboardingOverlay(
                    stepIndex: onboardingStepIndex,
                    targetAnchors: targetAnchors,
                    bottomPadding: bottomPadding,
                    onPrevious: previousOnboardingStep,
                    onNext: nextOnboardingStep,
                    onDismiss: finishOnboarding
                )
                .ignoresSafeArea()
            }
        }
        .animation(.easeInOut(duration: 0.2), value: state.isMapVisible)
        .animation(.easeInOut(duration: 0.18), value: showsSuggestions)
        .simultaneousGesture(
            DragGesture(minimumDistance: 8)
                .onChanged { _ in
                    if showsSuggestions {
                        dismissSearch()
                    }
                }
        )
        .onChange(of: searchQuery, perform: handleSearchQueryChange)
        .onChange(of: searchFocused) { isFocused in
            showsSuggestions = isFocused
        }
        .onChange(of: state.errorMessage) { message in
            if let message,
               !message.isEmpty,
               !isDiscoverCancellationMessage(message) {
                presentedError = message
            }
        }
        .onChange(of: state.isMapVisible) { isVisible in
            if !isVisible {
                loadedInitialMapTab = nil
                lastMapSearchViewport = nil
                lastMapSearchTab = nil
            }
        }
        .onChange(of: onboardingEligibilityKey) { _ in
            synchronizeOnboardingPresentation()
        }
        .onChange(of: onboardingStepIndex) { _ in
            UIAccessibility.post(notification: .screenChanged, argument: nil)
        }
        .task(id: initialMapSearchKey) {
            await loadInitialMapAreaIfNeeded()
        }
        .onAppear {
            synchronizeOnboardingPresentation()
        }
        .sheet(isPresented: $showsFilters) {
            NativeDiscoverFilterSheet(
                state: state,
                selectedTab: selectedTab,
                onDismiss: { showsFilters = false }
            )
        }
        .alert(
            "Discover",
            isPresented: Binding(
                get: { presentedError != nil },
                set: { if !$0 { presentedError = nil } }
            )
        ) {
            Button("OK", role: .cancel) { presentedError = nil }
        } message: {
            Text(presentedError ?? "Something went wrong.")
        }
        .onDisappear {
            searchTask?.cancel()
        }
    }
}

private extension NativeDiscoverScreen {
    var hasActiveFilters: Bool {
        let snapshot: NativeDiscoverFilterSnapshot?
        switch selectedTab {
        case .events:
            snapshot = state.eventFilter
        case .organizations:
            snapshot = state.organizationFilter
        case .teams:
            snapshot = state.teamFilter
        case .rentals:
            snapshot = state.rentalFilter
        }
        guard let snapshot else { return state.radiusMiles > 0 }
        return snapshot.priceEnabled ||
            !snapshot.sportIds.isEmpty ||
            !snapshot.tagSlugs.isEmpty ||
            !snapshot.divisionGenders.isEmpty ||
            !snapshot.skillDivisionTypeIds.isEmpty ||
            !snapshot.ageDivisionTypeIds.isEmpty ||
            snapshot.endDate != nil ||
            snapshot.divisionPriceMinEnabled ||
            snapshot.divisionPriceMaxEnabled ||
            state.radiusMiles > 0
    }

    var onboardingEligibilityKey: String {
        [
            shouldShowOnboarding ? "show" : "hide",
            hasCompletedOnboarding ? "completed" : "pending",
            selectedTab.rawValue,
            showsSuggestions ? "suggestions" : "no-suggestions",
            showsFilters ? "filters" : "no-filters",
            state.isMapVisible ? "map" : "no-map",
            searchQuery.isEmpty ? "empty-query" : "query",
        ].joined(separator: ":")
    }

    func synchronizeOnboardingPresentation() {
        guard shouldShowOnboarding, !hasCompletedOnboarding else {
            onboardingStepIndex = nil
            return
        }
        guard onboardingStepIndex == nil,
              selectedTab == .events,
              !showsSuggestions,
              !showsFilters,
              !state.isMapVisible,
              searchQuery.isEmpty
        else { return }

        onboardingStepIndex = 0
    }

    func previousOnboardingStep() {
        guard let onboardingStepIndex, onboardingStepIndex > 0 else { return }
        withAnimation(.easeInOut(duration: 0.2)) {
            self.onboardingStepIndex = onboardingStepIndex - 1
        }
    }

    func nextOnboardingStep() {
        guard let onboardingStepIndex else { return }
        if onboardingStepIndex < NativeDiscoverOnboardingStep.all.count - 1 {
            withAnimation(.easeInOut(duration: 0.2)) {
                self.onboardingStepIndex = onboardingStepIndex + 1
            }
        } else {
            finishOnboarding()
        }
    }

    func finishOnboarding() {
        guard !hasCompletedOnboarding else { return }
        hasCompletedOnboarding = true
        onboardingStepIndex = nil
        onOnboardingCompleted()
    }

    func selectTab(_ tab: NativeDiscoverTab) {
        selectedTab = tab
        showsFilters = false
        loadedInitialMapTab = nil
        scheduleSuggestions(for: searchQuery)
        if state.isMapVisible {
            synchronizeMapContent()
        }
    }

    func handleSearchQueryChange(_ query: String) {
        if searchFocused {
            showsSuggestions = true
        }
        scheduleSuggestions(for: query)
    }

    func scheduleSuggestions(for query: String) {
        searchTask?.cancel()
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)

        guard normalized.count >= 2 else {
            state.component.suggestEvents(searchQuery: "")
            state.component.suggestOrganizations(searchQuery: "", rentalsOnly: selectedTab == .rentals)
            state.component.suggestTeams(searchQuery: "")
            return
        }

        let tab = selectedTab
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            switch tab {
            case .events:
                state.component.suggestEvents(searchQuery: normalized)
            case .organizations:
                state.component.suggestOrganizations(searchQuery: normalized, rentalsOnly: false)
            case .teams:
                state.component.suggestTeams(searchQuery: normalized)
            case .rentals:
                state.component.suggestOrganizations(searchQuery: normalized, rentalsOnly: true)
            }
        }
    }

    func selectEventSuggestion(_ event: Event) {
        dismissSearch()
        state.component.viewEvent(event: event)
    }

    func selectOrganizationSuggestion(_ organization: Organization) {
        dismissSearch()
        state.component.viewOrganization(
            organization: organization,
            initialTab: .overview
        )
    }

    func selectTeamSuggestion(_ team: Team) {
        dismissSearch()
        openTeam(team)
    }

    func selectRentalSuggestion(_ organization: Organization) {
        dismissSearch()
        openRental(organization)
    }

    func dismissSearch(clearQuery: Bool = false) {
        if clearQuery {
            searchQuery = ""
            submittedSearchQuery = ""
        }
        showsSuggestions = false
        searchFocused = false
    }

    func submitSearch() {
        searchTask?.cancel()
        let normalized = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        searchQuery = normalized
        submittedSearchQuery = normalized
        dismissSearch()
    }

    func openTeam(_ team: Team) {
        openExternalURL(state.component.selectTeamFromDiscover(team: team))
    }

    func openRental(_ organization: Organization) {
        openExternalURL(state.component.selectRentalFromDiscover(organization: organization))
    }

    func openExternalURL(_ rawValue: String?) {
        guard
            let rawValue,
            let url = URL(string: rawValue),
            UIApplication.shared.canOpenURL(url)
        else { return }

        UIApplication.shared.open(url) { opened in
            if !opened {
                Task { @MainActor in
                    presentedError = "Unable to open the external link."
                }
            }
        }
    }

    func openEventMap(_ event: Event) {
        dismissSearch()
        state.component.onMapClick(event: event)
        synchronizeMapContent()
        state.mapComponent.openMap()
    }

    func openCurrentTabMap() {
        dismissSearch()
        state.component.onMapClick(event: nil)
        synchronizeMapContent()
        state.mapComponent.openMap()
    }

    func synchronizeMapContent() {
        switch selectedTab {
        case .events:
            state.mapComponent.setPlaces(places: [])
            state.mapComponent.setEvents(events: [])
        case .organizations:
            state.mapComponent.setEvents(events: [])
            state.mapComponent.setPlaces(
                places: state.component.discoverOrganizationMapPlaces(rentalsOnly: false)
            )
        case .teams:
            state.mapComponent.setEvents(events: [])
            state.mapComponent.setPlaces(places: [])
        case .rentals:
            state.mapComponent.setEvents(events: [])
            state.mapComponent.setPlaces(
                places: state.component.discoverOrganizationMapPlaces(rentalsOnly: true)
            )
        }
    }

    func searchThisArea() {
        guard selectedTab.supportsMap,
              selectedTab != .teams,
              let viewport = currentMapViewport
        else { return }

        let searchedTab = selectedTab
        Task { @MainActor in
            do {
                try await refreshVisibleMapArea(tab: searchedTab, viewport: viewport)
                try Task.checkCancellation()
                lastMapSearchViewport = viewport
                lastMapSearchTab = searchedTab
            } catch is CancellationError {
                return
            } catch {
                return
            }
        }
    }

    var currentMapViewport: NativeDiscoverMapViewport? {
        guard let center = state.mapViewCenter ?? state.currentLocation,
              let radiusMiles = state.mapViewRadiusMiles
        else { return nil }
        return NativeDiscoverMapViewport(
            latitude: center.latitude,
            longitude: center.longitude,
            radiusMiles: radiusMiles
        )
    }

    var shouldShowSearchThisArea: Bool {
        guard state.isMapVisible,
              let currentMapViewport,
              let lastMapSearchViewport,
              lastMapSearchTab == selectedTab,
              selectedTab.supportsMap,
              selectedTab != .teams
        else { return false }
        return currentMapViewport.isMeaningfullyDifferent(from: lastMapSearchViewport)
    }

    var initialMapSearchKey: String {
        let center = state.mapViewCenter ?? state.currentLocation
        let centerKey = center.map { "\($0.latitude),\($0.longitude)" } ?? "none"
        let radiusKey = state.mapViewRadiusMiles.map { String($0) } ?? "none"
        return "\(state.isMapVisible)-\(selectedTab.rawValue)-\(centerKey)-\(radiusKey)"
    }

    @MainActor
    func loadInitialMapAreaIfNeeded() async {
        guard state.isMapVisible,
              selectedTab.supportsMap,
              selectedTab != .teams,
              loadedInitialMapTab != selectedTab,
              let viewport = currentMapViewport
        else { return }

        let searchedTab = selectedTab
        do {
            try await Task.sleep(nanoseconds: 700_000_000)
            try Task.checkCancellation()
            try await refreshVisibleMapArea(tab: searchedTab, viewport: viewport)
            try Task.checkCancellation()
            lastMapSearchViewport = viewport
            lastMapSearchTab = searchedTab
            loadedInitialMapTab = searchedTab
        } catch is CancellationError {
            return
        } catch {
            return
        }
    }

    @MainActor
    func refreshVisibleMapArea(
        tab: NativeDiscoverTab,
        viewport: NativeDiscoverMapViewport
    ) async throws {
        switch tab {
        case .events:
            try await state.mapComponent.refreshEventsForVisibleArea()
        case .organizations, .rentals:
            isSearchingOrganizationMap = true
            defer { isSearchingOrganizationMap = false }
            let places = try await state.component.refreshOrganizationMapPlaces(
                center: LatLng(latitude: viewport.latitude, longitude: viewport.longitude),
                radiusMiles: viewport.radiusMiles,
                rentalsOnly: tab == .rentals
            )
            try Task.checkCancellation()
            guard selectedTab == tab, state.isMapVisible else { return }
            state.mapComponent.setPlaces(places: places)
        case .teams:
            return
        }
    }

    func isDiscoverCancellationMessage(_ message: String) -> Bool {
        let normalized = message.lowercased()
        return normalized.contains("coroutine was cancelled") ||
            normalized.contains("coroutine was canceled") ||
            normalized.contains("job was cancelled") ||
            normalized.contains("job was canceled")
    }
}

private struct NativeDiscoverMapViewport {
    let latitude: Double
    let longitude: Double
    let radiusMiles: Double

    func isMeaningfullyDifferent(from previous: NativeDiscoverMapViewport) -> Bool {
        let currentLocation = CLLocation(latitude: latitude, longitude: longitude)
        let previousLocation = CLLocation(latitude: previous.latitude, longitude: previous.longitude)
        let distanceMiles = currentLocation.distance(from: previousLocation) / 1_609.344
        let radiusThreshold = max(0.25, previous.radiusMiles * 0.15)
        return distanceMiles >= 0.25 || abs(radiusMiles - previous.radiusMiles) >= radiusThreshold
    }
}

private struct NativeDiscoverTabBar: View {
    @Binding var selectedTab: NativeDiscoverTab
    let onSelection: (NativeDiscoverTab) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(NativeDiscoverTab.allCases) { tab in
                Button {
                    onSelection(tab)
                } label: {
                    VStack(spacing: 6) {
                        HStack(spacing: 4) {
                            Image(systemName: tab.systemImage)
                                .font(.system(size: 14, weight: .semibold))
                                .frame(width: 20, height: 20)
                            Text(tab.title)
                                .font(.system(size: 12, weight: .semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        .foregroundStyle(selectedTab == tab ? Color.accentColor : .secondary)
                        .frame(maxWidth: .infinity, minHeight: 22)

                        Rectangle()
                            .fill(selectedTab == tab ? Color.accentColor : Color.secondary.opacity(0.2))
                            .frame(height: 2)
                    }
                    .contentShape(Rectangle())
                }
                .frame(maxWidth: .infinity)
                .buttonStyle(.plain)
                .accessibilityAddTraits(selectedTab == tab ? .isSelected : [])
            }
        }
        .padding(.top, 6)
        .background(.ultraThinMaterial)
    }
}
