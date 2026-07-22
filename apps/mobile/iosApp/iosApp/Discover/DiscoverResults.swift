import ComposeApp
import SwiftUI

struct NativeDiscoverResultsView: View {
    @ObservedObject var state: DiscoverObservableState
    let selectedTab: NativeDiscoverTab
    let searchQuery: String
    let topPadding: CGFloat
    let bottomPadding: CGFloat
    let onEventSelected: (Event) -> Void
    let onEventMapSelected: (Event) -> Void
    let onOrganizationSelected: (Organization) -> Void
    let onTeamSelected: (Team) -> Void
    let onRentalSelected: (Organization) -> Void

    var body: some View {
        ZStack {
            switch selectedTab {
            case .events:
                NativeEventResults(
                    state: state,
                    events: searchSnapshot.events,
                    searchQuery: normalizedSearchQuery,
                    topPadding: topPadding,
                    bottomPadding: bottomPadding,
                    onSelected: onEventSelected,
                    onMapSelected: onEventMapSelected
                )
            case .organizations:
                NativeOrganizationResults(
                    state: state,
                    organizations: searchSnapshot.organizations,
                    searchQuery: normalizedSearchQuery,
                    topPadding: topPadding,
                    bottomPadding: bottomPadding,
                    onSelected: onOrganizationSelected
                )
            case .teams:
                NativeTeamResults(
                    state: state,
                    teams: searchSnapshot.teams,
                    searchQuery: normalizedSearchQuery,
                    topPadding: topPadding,
                    bottomPadding: bottomPadding,
                    onSelected: onTeamSelected
                )
            case .rentals:
                NativeRentalResults(
                    state: state,
                    rentals: searchSnapshot.rentals,
                    searchQuery: normalizedSearchQuery,
                    topPadding: topPadding,
                    bottomPadding: bottomPadding,
                    onSelected: onRentalSelected
                )
            }
        }
    }

    private var normalizedSearchQuery: String {
        searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var searchSnapshot: NativeDiscoverSearchSnapshot {
        state.component.nativeDiscoverSearchSnapshot(query: normalizedSearchQuery)
    }
}

private struct NativeEventResults: View {
    @ObservedObject var state: DiscoverObservableState
    let events: [Event]
    let searchQuery: String
    let topPadding: CGFloat
    let bottomPadding: CGFloat
    let onSelected: (Event) -> Void
    let onMapSelected: (Event) -> Void

    @State private var lastLoadKey = ""

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                if events.isEmpty {
                    if state.isLoadingEvents && searchQuery.isEmpty {
                        NativeDiscoverLoadingCards()
                    } else if !searchQuery.isEmpty {
                        NativeDiscoverEmptyState(
                            title: "No events match \"\(searchQuery)\"",
                            message: "Try a different event name, location, sport, or tag.",
                            systemImage: "magnifyingglass"
                        )
                    } else {
                        NativeDiscoverEmptyState(
                            title: "No upcoming events nearby",
                            message: "Be the first to create an event in this area.",
                            systemImage: "calendar.badge.plus",
                            actionTitle: "Create event",
                            action: state.component.startEventCreate
                        )
                    }
                } else {
                    ForEach(Array(events.enumerated()), id: \.element.id) { index, event in
                        NativeDiscoverEventCard(
                            event: event,
                            organizationLogoId: organizationLogoId(for: event),
                            onSelected: { onSelected(event) },
                            onMapSelected: { onMapSelected(event) }
                        )
                        .nativeDiscoverGuideTarget(index == 0 ? .firstResult : nil)
                        .onAppear {
                            requestMoreIfNeeded(index: index, event: event)
                        }
                    }

                    if searchQuery.isEmpty {
                        NativeDiscoverPagingFooter(
                            isLoading: state.isLoadingEvents,
                            hasMore: state.hasMoreEvents,
                            endMessage: "No more events to load"
                        )
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, topPadding)
            .padding(.bottom, bottomPadding)
        }
        .refreshable {
            state.component.refreshEvents(force: true)
        }
    }
}

private extension NativeEventResults {
    func organizationLogoId(for event: Event) -> String? {
        guard let organizationId = discoverNonEmpty(event.organizationId) else { return nil }
        return state.allOrganizations.first(where: { $0.id == organizationId })?.logoId
    }

    func requestMoreIfNeeded(index: Int, event: Event) {
        guard searchQuery.isEmpty,
              index >= events.count - 3,
              state.hasMoreEvents,
              !state.isLoadingEvents else { return }
        let key = "\(events.count):\(event.id)"
        guard key != lastLoadKey else { return }
        lastLoadKey = key
        state.component.loadMoreEvents()
    }
}

private struct NativeOrganizationResults: View {
    @ObservedObject var state: DiscoverObservableState
    let organizations: [Organization]
    let searchQuery: String
    let topPadding: CGFloat
    let bottomPadding: CGFloat
    let onSelected: (Organization) -> Void

    @State private var lastLoadKey = ""

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                if organizations.isEmpty {
                    if state.isLoadingOrganizations && searchQuery.isEmpty {
                        NativeDiscoverLoadingCards()
                    } else if !searchQuery.isEmpty {
                        NativeDiscoverEmptyState(
                            title: "No organizations match \"\(searchQuery)\"",
                            message: "Try a different organization, location, sport, or facility.",
                            systemImage: "magnifyingglass"
                        )
                    } else {
                        NativeDiscoverEmptyState(
                            title: "No organizations found",
                            message: "Try another location or broaden your filters.",
                            systemImage: "person.3"
                        )
                    }
                } else {
                    ForEach(Array(organizations.enumerated()), id: \.element.id) { index, organization in
                        NativeDiscoverOrganizationCard(organization: organization) {
                            onSelected(organization)
                        }
                        .onAppear {
                            requestMoreIfNeeded(index: index, organization: organization)
                        }
                    }

                    if searchQuery.isEmpty {
                        NativeDiscoverPagingFooter(
                            isLoading: state.isLoadingOrganizations,
                            hasMore: state.hasMoreOrganizations,
                            endMessage: nil
                        )
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, topPadding)
            .padding(.bottom, bottomPadding)
        }
        .refreshable {
            state.component.refreshOrganizations(force: true)
        }
    }

    private func requestMoreIfNeeded(index: Int, organization: Organization) {
        guard searchQuery.isEmpty,
              index >= organizations.count - 3,
              state.hasMoreOrganizations,
              !state.isLoadingOrganizations else { return }
        let key = "\(organizations.count):\(organization.id)"
        guard key != lastLoadKey else { return }
        lastLoadKey = key
        state.component.loadMoreOrganizations()
    }
}

private struct NativeTeamResults: View {
    @ObservedObject var state: DiscoverObservableState
    let teams: [Team]
    let searchQuery: String
    let topPadding: CGFloat
    let bottomPadding: CGFloat
    let onSelected: (Team) -> Void

    @State private var lastLoadKey = ""

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                if teams.isEmpty {
                    if state.isLoadingTeams && searchQuery.isEmpty {
                        NativeDiscoverLoadingCards()
                    } else if !searchQuery.isEmpty {
                        NativeDiscoverEmptyState(
                            title: "No teams match \"\(searchQuery)\"",
                            message: "Try a different team, sport, or division.",
                            systemImage: "magnifyingglass"
                        )
                    } else {
                        NativeDiscoverEmptyState(
                            title: "No teams open for registration",
                            message: "Check back soon or search another team name.",
                            systemImage: "sportscourt"
                        )
                    }
                } else {
                    ForEach(Array(teams.enumerated()), id: \.element.id) { index, team in
                        NativeDiscoverTeamCard(team: team) {
                            onSelected(team)
                        }
                        .onAppear {
                            requestMoreIfNeeded(index: index, team: team)
                        }
                    }

                    if searchQuery.isEmpty {
                        NativeDiscoverPagingFooter(
                            isLoading: state.isLoadingTeams,
                            hasMore: state.hasMoreTeams,
                            endMessage: nil
                        )
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, topPadding)
            .padding(.bottom, bottomPadding)
        }
        .refreshable {
            state.component.refreshTeams(force: true)
        }
    }

    private func requestMoreIfNeeded(index: Int, team: Team) {
        guard searchQuery.isEmpty,
              index >= teams.count - 3,
              state.hasMoreTeams,
              !state.isLoadingTeams else { return }
        let key = "\(teams.count):\(team.id)"
        guard key != lastLoadKey else { return }
        lastLoadKey = key
        state.component.loadMoreTeams()
    }
}

private struct NativeRentalResults: View {
    @ObservedObject var state: DiscoverObservableState
    let rentals: [Organization]
    let searchQuery: String
    let topPadding: CGFloat
    let bottomPadding: CGFloat
    let onSelected: (Organization) -> Void

    @State private var lastLoadKey = ""

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                if rentals.isEmpty {
                    if state.isLoadingRentals && searchQuery.isEmpty {
                        NativeDiscoverLoadingCards()
                    } else if !searchQuery.isEmpty {
                        NativeDiscoverEmptyState(
                            title: "No rentals match \"\(searchQuery)\"",
                            message: "Try a different facility, location, or sport.",
                            systemImage: "magnifyingglass"
                        )
                    } else {
                        NativeDiscoverEmptyState(
                            title: "No rentals found nearby",
                            message: "Try another location or check back as facilities add availability.",
                            systemImage: "building.2"
                        )
                    }
                } else {
                    ForEach(Array(rentals.enumerated()), id: \.element.id) { index, organization in
                        NativeDiscoverRentalCard(organization: organization) {
                            onSelected(organization)
                        }
                        .onAppear {
                            requestMoreIfNeeded(index: index, organization: organization)
                        }
                    }

                    if searchQuery.isEmpty {
                        NativeDiscoverPagingFooter(
                            isLoading: state.isLoadingRentals,
                            hasMore: state.hasMoreRentals,
                            endMessage: nil
                        )
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, topPadding)
            .padding(.bottom, bottomPadding)
        }
        .refreshable {
            state.component.refreshRentals(force: true)
        }
    }

    private func requestMoreIfNeeded(index: Int, organization: Organization) {
        guard searchQuery.isEmpty,
              index >= rentals.count - 3,
              state.hasMoreRentals,
              !state.isLoadingRentals else { return }
        let key = "\(rentals.count):\(organization.id)"
        guard key != lastLoadKey else { return }
        lastLoadKey = key
        state.component.loadMoreRentals()
    }
}

private struct NativeDiscoverLoadingCards: View {
    var body: some View {
        ForEach(0..<4, id: \.self) { _ in
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.secondary.opacity(0.12))
                .frame(height: 150)
                .overlay { ProgressView() }
        }
    }
}

private struct NativeDiscoverEmptyState: View {
    let title: String
    let message: String
    let systemImage: String
    var actionTitle: String?
    var action: (() -> Void)?

    init(
        title: String,
        message: String,
        systemImage: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.message = message
        self.systemImage = systemImage
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(Color.accentColor)
            Text(title)
                .font(.title3.weight(.bold))
                .multilineTextAlignment(.center)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 56)
        .frame(maxWidth: .infinity)
    }
}

private struct NativeDiscoverPagingFooter: View {
    let isLoading: Bool
    let hasMore: Bool
    let endMessage: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView().padding()
            } else if !hasMore, let endMessage {
                Text(endMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding()
            }
        }
        .frame(maxWidth: .infinity)
    }
}
