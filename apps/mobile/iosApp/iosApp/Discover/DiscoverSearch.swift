import ComposeApp
import SwiftUI

struct NativeDiscoverSearchBar: View {
    @Binding var text: String
    let isFocused: FocusState<Bool>.Binding
    let placeholder: String
    let supportsFilters: Bool
    let hasActiveFilters: Bool
    let onSubmit: () -> Void
    let onDismiss: () -> Void
    let onFilterTapped: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onSubmit) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Search")

            TextField(placeholder, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .focused(isFocused)
                .onSubmit(onSubmit)

            if isFocused.wrappedValue || !text.isEmpty {
                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss search")
            }

            if supportsFilters {
                Button(action: onFilterTapped) {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(hasActiveFilters ? Color.accentColor : .secondary)

                        if hasActiveFilters {
                            Circle()
                                .fill(Color.accentColor)
                                .frame(width: 7, height: 7)
                                .offset(x: 2, y: -1)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Filters")
                .accessibilityValue(hasActiveFilters ? "Active" : "Inactive")
                .nativeDiscoverGuideTarget(.filters)
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 48)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.secondary.opacity(0.22), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.1), radius: 8, y: 3)
    }
}

struct NativeDiscoverSuggestionsView: View {
    @ObservedObject var state: DiscoverObservableState
    let selectedTab: NativeDiscoverTab
    let query: String
    let onEventSelected: (Event) -> Void
    let onOrganizationSelected: (Organization) -> Void
    let onTeamSelected: (Team) -> Void
    let onRentalSelected: (Organization) -> Void
    let onScrollStarted: () -> Void

    var body: some View {
        Group {
            if normalizedQuery.count >= 2, suggestionCount > 5 {
                ScrollView {
                    suggestionStack
                }
            } else {
                suggestionStack
            }
        }
        .frame(height: preferredHeight)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.secondary.opacity(0.18), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.16), radius: 12, y: 5)
        .highPriorityGesture(
            DragGesture(minimumDistance: 8)
                .onChanged { _ in
                    onScrollStarted()
                }
        )
    }
}

private extension NativeDiscoverSuggestionsView {
    var normalizedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var suggestionCount: Int {
        switch selectedTab {
        case .events: return state.suggestedEvents.count
        case .organizations, .rentals: return state.suggestedOrganizations.count
        case .teams: return state.suggestedTeams.count
        }
    }

    var preferredHeight: CGFloat {
        guard normalizedQuery.count >= 2, suggestionCount > 0 else { return 58 }
        let rowHeight: CGFloat = 52
        let rowSpacing: CGFloat = 6
        let contentHeight = CGFloat(suggestionCount) * rowHeight +
            CGFloat(max(suggestionCount - 1, 0)) * rowSpacing + 16
        return min(contentHeight, 350)
    }

    @ViewBuilder
    var suggestionStack: some View {
        VStack(spacing: 6) {
            if normalizedQuery.count < 2 {
                suggestionMessage("Type at least 2 characters.")
            } else {
                suggestionContent
            }
        }
        .padding(8)
    }

    @ViewBuilder
    var suggestionContent: some View {
        switch selectedTab {
        case .events:
            if state.suggestedEvents.isEmpty {
                suggestionMessage("No event suggestions found.")
            } else {
                ForEach(state.suggestedEvents, id: \.id) { event in
                    NativeEventSuggestionRow(event: event) {
                        onEventSelected(event)
                    }
                }
            }
        case .organizations:
            if state.suggestedOrganizations.isEmpty {
                suggestionMessage("No organization suggestions found.")
            } else {
                ForEach(state.suggestedOrganizations, id: \.id) { organization in
                    NativeOrganizationSuggestionRow(organization: organization) {
                        onOrganizationSelected(organization)
                    }
                }
            }
        case .teams:
            if state.suggestedTeams.isEmpty {
                suggestionMessage("No team suggestions found.")
            } else {
                ForEach(state.suggestedTeams, id: \.id) { team in
                    NativeTeamSuggestionRow(team: team) {
                        onTeamSelected(team)
                    }
                }
            }
        case .rentals:
            if state.suggestedOrganizations.isEmpty {
                suggestionMessage("No rental suggestions found.")
            } else {
                ForEach(state.suggestedOrganizations, id: \.id) { organization in
                    NativeRentalSuggestionRow(organization: organization) {
                        onRentalSelected(organization)
                    }
                }
            }
        }
    }

    func suggestionMessage(_ message: String) -> some View {
        Text(message)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, 12)
    }
}
