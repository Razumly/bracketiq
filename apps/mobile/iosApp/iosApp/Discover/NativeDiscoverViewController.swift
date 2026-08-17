import ComposeApp
import SwiftUI
import UIKit

private final class NativeDiscoverOnboardingSession {
    private let onCompleted: () -> Void
    private(set) var isCompleted = false

    init(onCompleted: @escaping () -> Void) {
        self.onCompleted = onCompleted
    }

    func complete() {
        guard !isCompleted else { return }
        isCompleted = true
        onCompleted()
    }
}

final class NativeDiscoverViewController: UIHostingController<NativeDiscoverScreen> {
    private let component: EventSearchComponent
    private let mapComponent: MapComponent
    private let onboardingSession: NativeDiscoverOnboardingSession
    private var bottomPadding: CGFloat
    private var shouldShowOnboarding: Bool

    init(
        component: EventSearchComponent,
        mapComponent: MapComponent,
        bottomPadding: CGFloat,
        shouldShowOnboarding: Bool,
        onOnboardingCompleted: @escaping () -> Void
    ) {
        let onboardingSession = NativeDiscoverOnboardingSession(
            onCompleted: onOnboardingCompleted
        )
        self.component = component
        self.mapComponent = mapComponent
        self.onboardingSession = onboardingSession
        self.bottomPadding = bottomPadding
        self.shouldShowOnboarding = shouldShowOnboarding
        super.init(
            rootView: NativeDiscoverScreen(
                component: component,
                mapComponent: mapComponent,
                bottomPadding: bottomPadding,
                shouldShowOnboarding: shouldShowOnboarding,
                onOnboardingCompleted: onboardingSession.complete
            )
        )
        view.backgroundColor = .clear
    }

    @MainActor @preconcurrency required dynamic init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func update(bottomPadding: CGFloat, shouldShowOnboarding: Bool) {
        guard abs(self.bottomPadding - bottomPadding) > 0.5 ||
                self.shouldShowOnboarding != shouldShowOnboarding
        else { return }
        self.bottomPadding = bottomPadding
        self.shouldShowOnboarding = shouldShowOnboarding
        let effectiveShouldShowOnboarding = shouldShowOnboarding && !onboardingSession.isCompleted
        rootView = NativeDiscoverScreen(
            component: component,
            mapComponent: mapComponent,
            bottomPadding: bottomPadding,
            shouldShowOnboarding: effectiveShouldShowOnboarding,
            onOnboardingCompleted: onboardingSession.complete
        )
    }
}

@MainActor
final class DiscoverObservableState: ObservableObject {
    let component: EventSearchComponent
    let mapComponent: MapComponent

    @Published private(set) var events: [Event] = []
    @Published private(set) var organizations: [Organization] = []
    @Published private(set) var allOrganizations: [Organization] = []
    @Published private(set) var rentals: [Organization] = []
    @Published private(set) var teams: [Team] = []

    @Published private(set) var suggestedEvents: [Event] = []
    @Published private(set) var suggestedOrganizations: [Organization] = []
    @Published private(set) var suggestedTeams: [Team] = []

    @Published private(set) var isLoadingEvents = false
    @Published private(set) var isLoadingOrganizations = false
    @Published private(set) var isLoadingRentals = false
    @Published private(set) var isLoadingTeams = false
    @Published private(set) var hasMoreEvents = true
    @Published private(set) var hasMoreOrganizations = true
    @Published private(set) var hasMoreRentals = true
    @Published private(set) var hasMoreTeams = true

    @Published private(set) var sports: [Sport] = []
    @Published private(set) var eventTags: [EventTag] = []
    @Published private(set) var organizationTags: [EventTag] = []
    @Published private(set) var divisionTypeParameters: DivisionTypeParameters?
    @Published private(set) var eventFilter: NativeDiscoverFilterSnapshot?
    @Published private(set) var organizationFilter: NativeDiscoverFilterSnapshot?
    @Published private(set) var teamFilter: NativeDiscoverFilterSnapshot?
    @Published private(set) var rentalFilter: NativeDiscoverFilterSnapshot?
    @Published private(set) var radiusMiles = 0.0
    @Published private(set) var selectedSearchLocationLabel: String?
    @Published private(set) var currentLocation: LatLng?
    @Published private(set) var selectedEvent: Event?
    @Published private(set) var currentUserId = ""

    @Published private(set) var isMapVisible = false
    @Published private(set) var isMapLoading = false
    @Published private(set) var mapViewCenter: LatLng?
    @Published private(set) var mapViewRadiusMiles: Double?
    @Published private(set) var errorMessage: String?

    private var observationTasks: [Task<Void, Never>] = []

    init(component: EventSearchComponent, mapComponent: MapComponent) {
        self.component = component
        self.mapComponent = mapComponent
        eventFilter = component.eventFilterSnapshot()
        organizationFilter = component.organizationFilterSnapshot()
        teamFilter = component.teamFilterSnapshot()
        rentalFilter = component.rentalFilterSnapshot()
        startObserving()
    }

    deinit {
        observationTasks.forEach { $0.cancel() }
    }
}

private extension DiscoverObservableState {
    func startObserving() {
        let component = component
        let mapComponent = mapComponent

        observationTasks = [
            Task { [weak self] in
                for await value in component.events {
                    guard let self else { return }
                    events = value
                }
            },
            Task { [weak self] in
                for await value in component.currentUserId {
                    guard let self else { return }
                    currentUserId = value
                }
            },
            Task { [weak self] in
                for await value in component.organizations {
                    guard let self else { return }
                    organizations = value
                }
            },
            Task { [weak self] in
                for await value in component.allOrganizations {
                    guard let self else { return }
                    allOrganizations = value
                }
            },
            Task { [weak self] in
                for await value in component.rentals {
                    guard let self else { return }
                    rentals = value
                }
            },
            Task { [weak self] in
                for await value in component.teams {
                    guard let self else { return }
                    teams = value
                }
            },
            Task { [weak self] in
                for await value in component.suggestedEvents {
                    guard let self else { return }
                    suggestedEvents = value
                }
            },
            Task { [weak self] in
                for await value in component.suggestedOrganizations {
                    guard let self else { return }
                    suggestedOrganizations = value
                }
            },
            Task { [weak self] in
                for await value in component.suggestedTeams {
                    guard let self else { return }
                    suggestedTeams = value
                }
            },
            Task { [weak self] in
                for await value in component.isLoadingMore {
                    guard let self else { return }
                    isLoadingEvents = value.boolValue
                }
            },
            Task { [weak self] in
                for await value in component.isLoadingOrganizations {
                    guard let self else { return }
                    isLoadingOrganizations = value.boolValue
                }
            },
            Task { [weak self] in
                for await value in component.isLoadingRentals {
                    guard let self else { return }
                    isLoadingRentals = value.boolValue
                }
            },
            Task { [weak self] in
                for await value in component.isLoadingTeams {
                    guard let self else { return }
                    isLoadingTeams = value.boolValue
                }
            },
            Task { [weak self] in
                for await value in component.hasMoreEvents {
                    guard let self else { return }
                    hasMoreEvents = value.boolValue
                }
            },
            Task { [weak self] in
                for await value in component.hasMoreOrganizations {
                    guard let self else { return }
                    hasMoreOrganizations = value.boolValue
                }
            },
            Task { [weak self] in
                for await value in component.hasMoreRentals {
                    guard let self else { return }
                    hasMoreRentals = value.boolValue
                }
            },
            Task { [weak self] in
                for await value in component.hasMoreTeams {
                    guard let self else { return }
                    hasMoreTeams = value.boolValue
                }
            },
            Task { [weak self] in
                for await value in component.sports {
                    guard let self else { return }
                    sports = value
                }
            },
            Task { [weak self] in
                for await value in component.eventTags {
                    guard let self else { return }
                    eventTags = value
                }
            },
            Task { [weak self] in
                for await value in component.organizationTags {
                    guard let self else { return }
                    organizationTags = value
                }
            },
            Task { [weak self] in
                for await value in component.divisionTypeParameters {
                    guard let self else { return }
                    divisionTypeParameters = value
                }
            },
            Task { [weak self] in
                for await _ in component.filter {
                    guard let self else { return }
                    eventFilter = component.eventFilterSnapshot()
                }
            },
            Task { [weak self] in
                for await _ in component.organizationFilter {
                    guard let self else { return }
                    organizationFilter = component.organizationFilterSnapshot()
                }
            },
            Task { [weak self] in
                for await _ in component.teamFilter {
                    guard let self else { return }
                    teamFilter = component.teamFilterSnapshot()
                }
            },
            Task { [weak self] in
                for await _ in component.rentalFilter {
                    guard let self else { return }
                    rentalFilter = component.rentalFilterSnapshot()
                }
            },
            Task { [weak self] in
                for await value in component.currentRadius {
                    guard let self else { return }
                    radiusMiles = value.doubleValue
                }
            },
            Task { [weak self] in
                for await value in component.selectedSearchLocationLabel {
                    guard let self else { return }
                    selectedSearchLocationLabel = value
                }
            },
            Task { [weak self] in
                for await value in component.currentLocation {
                    guard let self else { return }
                    currentLocation = value
                }
            },
            Task { [weak self] in
                for await value in component.selectedEvent {
                    guard let self else { return }
                    selectedEvent = value
                }
            },
            Task { [weak self] in
                for await value in component.errorState {
                    guard let self else { return }
                    errorMessage = value?.message
                }
            },
            Task { [weak self] in
                for await value in mapComponent.showMap {
                    guard let self else { return }
                    isMapVisible = value.boolValue
                }
            },
            Task { [weak self] in
                for await value in mapComponent.isLoading {
                    guard let self else { return }
                    isMapLoading = value.boolValue
                }
            },
            Task { [weak self] in
                for await value in mapComponent.currentViewCenter {
                    guard let self else { return }
                    mapViewCenter = value
                }
            },
            Task { [weak self] in
                for await value in mapComponent.currentViewRadiusMiles {
                    guard let self else { return }
                    mapViewRadiusMiles = value?.doubleValue
                }
            }
        ]
    }
}
