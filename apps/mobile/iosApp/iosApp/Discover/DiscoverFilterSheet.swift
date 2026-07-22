import ComposeApp
import SwiftUI

struct NativeDiscoverFilterSheet: View {
    @ObservedObject var state: DiscoverObservableState
    let selectedTab: NativeDiscoverTab
    let onDismiss: () -> Void

    @State private var draft: NativeDiscoverFilterDraft

    init(
        state: DiscoverObservableState,
        selectedTab: NativeDiscoverTab,
        onDismiss: @escaping () -> Void
    ) {
        self.state = state
        self.selectedTab = selectedTab
        self.onDismiss = onDismiss
        let snapshot = selectedTab == .organizations
            ? state.organizationFilter
            : state.eventFilter
        _draft = State(
            initialValue: NativeDiscoverFilterDraft(
                snapshot: snapshot,
                radiusMiles: state.radiusMiles
            )
        )
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if selectedTab == .events {
                        NativeEventFilterContent(
                            state: state,
                            draft: $draft
                        )
                    } else {
                        NativeOrganizationFilterContent(
                            state: state,
                            draft: $draft
                        )
                    }

                    Button(action: applyFilters) {
                        Text("Apply Filters")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!draft.isValid)
                    .padding(.top, 2)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(selectedTab == .organizations ? "Filter Organizations" : "Filter Events")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: onDismiss)
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Clear All", action: clearFilters)
                }
            }
        }
        .navigationViewStyle(.stack)
        .discoverBottomSheetPresentation()
    }
}

private extension NativeDiscoverFilterSheet {
    func applyFilters() {
        guard draft.isValid else { return }
        state.component.selectRadius(radius: draft.distanceEnabled ? draft.radiusMiles : 0)

        if selectedTab == .events {
            state.component.applyNativeEventFilters(
                priceEnabled: draft.priceEnabled,
                priceMin: draft.priceMinimum,
                priceMax: draft.priceMaximum,
                startDate: draft.startDate.kotlinInstant,
                endDate: draft.endDateEnabled ? draft.endDate.kotlinInstant : nil,
                sportIds: Array(draft.sportIds),
                tagSlugs: Array(draft.tagSlugs)
            )
        } else {
            state.component.applyNativeOrganizationFilters(
                sportIds: Array(draft.sportIds),
                tagSlugs: Array(draft.tagSlugs),
                divisionGenders: Array(draft.divisionGenders),
                skillDivisionTypeIds: Array(draft.skillDivisionTypeIds),
                ageDivisionTypeIds: Array(draft.ageDivisionTypeIds),
                divisionPriceMinEnabled: draft.divisionPriceMinimumEnabled,
                divisionPriceMin: draft.divisionPriceMinimum,
                divisionPriceMaxEnabled: draft.divisionPriceMaximumEnabled,
                divisionPriceMax: draft.divisionPriceMaximum
            )
        }
        onDismiss()
    }

    func clearFilters() {
        if selectedTab == .events {
            state.component.clearNativeEventFilters()
        } else {
            state.component.clearNativeOrganizationFilters()
        }
        onDismiss()
    }
}

private struct NativeEventFilterContent: View {
    @ObservedObject var state: DiscoverObservableState
    @Binding var draft: NativeDiscoverFilterDraft

    var body: some View {
        NativePriceRangeFilter(draft: $draft)
        NativeDateRangeFilter(draft: $draft)
        NativeOptionGridFilter(
            title: "Sports",
            options: state.sports.map { NativeFilterOption(id: $0.id, label: $0.name) },
            selectedIds: $draft.sportIds
        )
        NativeTagFilter(
            tags: state.eventTags,
            selectedSlugs: $draft.tagSlugs
        )
        NativeLocationFilter(state: state)
        NativeDistanceFilter(draft: $draft)
    }
}

private struct NativeOrganizationFilterContent: View {
    @ObservedObject var state: DiscoverObservableState
    @Binding var draft: NativeDiscoverFilterDraft

    var body: some View {
        NativeOptionGridFilter(
            title: "Sports",
            options: state.sports.map { NativeFilterOption(id: $0.id, label: $0.name) },
            selectedIds: $draft.sportIds,
            onSelectionChanged: constrainSkillSelection
        )
        NativeTagFilter(
            tags: state.organizationTags,
            selectedSlugs: $draft.tagSlugs
        )

        if let parameters = state.divisionTypeParameters {
            NativeOptionGridFilter(
                title: "Gender",
                options: parameters.genders.map { NativeFilterOption(id: $0.id, label: $0.name) },
                selectedIds: $draft.divisionGenders
            )
            NativeOptionGridFilter(
                title: "Age group",
                options: parameters.ages.map { NativeFilterOption(id: $0.id, label: $0.name) },
                selectedIds: $draft.ageDivisionTypeIds
            )
            NativeOptionGridFilter(
                title: "Skill level",
                options: skillOptions(parameters),
                selectedIds: $draft.skillDivisionTypeIds
            )
        }

        NativeDivisionPriceFilter(draft: $draft)

        Text("All selected division filters must match the same division.")
            .font(.footnote)
            .foregroundStyle(.secondary)

        NativeLocationFilter(state: state)
        NativeDistanceFilter(draft: $draft)
    }
}

private extension NativeOrganizationFilterContent {
    func skillOptions(_ parameters: DivisionTypeParameters) -> [NativeFilterOption] {
        let selectedSports = draft.sportIds
        let includedGroups = parameters.sportSkills.filter { group in
            selectedSports.isEmpty || selectedSports.contains(group.sportId)
        }
        let showsSportName = Set(includedGroups.map(\.sportId)).count > 1

        return includedGroups.flatMap { group in
            group.skills.map { skill in
                NativeFilterOption(
                    id: skill.id.lowercased(),
                    label: showsSportName ? "\(group.sportName) · \(skill.name)" : skill.name
                )
            }
        }
        .reduce(into: [String: NativeFilterOption]()) { result, option in
            result[option.id] = result[option.id] ?? option
        }
        .values
        .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    }

    func constrainSkillSelection() {
        guard let parameters = state.divisionTypeParameters else {
            draft.skillDivisionTypeIds = []
            return
        }
        let validIds = Set(skillOptions(parameters).map(\.id))
        draft.skillDivisionTypeIds.formIntersection(validIds)
    }
}

struct NativeDiscoverFilterDraft {
    var priceEnabled: Bool
    var priceMinimumText: String
    var priceMaximumText: String
    var startDate: Date
    var endDateEnabled: Bool
    var endDate: Date
    var sportIds: Set<String>
    var tagSlugs: Set<String>
    var divisionGenders: Set<String>
    var skillDivisionTypeIds: Set<String>
    var ageDivisionTypeIds: Set<String>
    var divisionPriceMinimumEnabled: Bool
    var divisionPriceMinimumText: String
    var divisionPriceMaximumEnabled: Bool
    var divisionPriceMaximumText: String
    var distanceEnabled: Bool
    var radiusMiles: Double

    init(snapshot: NativeDiscoverFilterSnapshot?, radiusMiles: Double) {
        priceEnabled = snapshot?.priceEnabled ?? false
        priceMinimumText = Self.format(snapshot?.priceMin ?? 0)
        priceMaximumText = Self.format(snapshot?.priceMax ?? 200)
        startDate = snapshot?.startDate.swiftDate ?? Date()
        endDateEnabled = snapshot?.endDate != nil
        endDate = snapshot?.endDate?.swiftDate ?? Calendar.current.date(byAdding: .month, value: 1, to: Date()) ?? Date()
        sportIds = Set(snapshot?.sportIds ?? [])
        tagSlugs = Set(snapshot?.tagSlugs ?? [])
        divisionGenders = Set(snapshot?.divisionGenders ?? [])
        skillDivisionTypeIds = Set(snapshot?.skillDivisionTypeIds ?? [])
        ageDivisionTypeIds = Set(snapshot?.ageDivisionTypeIds ?? [])
        divisionPriceMinimumEnabled = snapshot?.divisionPriceMinEnabled ?? false
        divisionPriceMinimumText = Self.format(snapshot?.divisionPriceMin ?? 0)
        divisionPriceMaximumEnabled = snapshot?.divisionPriceMaxEnabled ?? false
        divisionPriceMaximumText = Self.format(snapshot?.divisionPriceMax ?? 0)
        distanceEnabled = radiusMiles > 0
        self.radiusMiles = radiusMiles > 0 ? radiusMiles : 50
    }

    var priceMinimum: Double { Double(priceMinimumText) ?? 0 }
    var priceMaximum: Double { Double(priceMaximumText) ?? 0 }
    var divisionPriceMinimum: Double { Double(divisionPriceMinimumText) ?? 0 }
    var divisionPriceMaximum: Double { Double(divisionPriceMaximumText) ?? 0 }

    var isValid: Bool {
        let priceIsValid = !priceEnabled ||
            (Double(priceMinimumText) != nil && Double(priceMaximumText) != nil &&
                priceMinimum >= 0 && priceMinimum <= priceMaximum)
        let divisionMinimumIsValid = !divisionPriceMinimumEnabled || Double(divisionPriceMinimumText) != nil
        let divisionMaximumIsValid = !divisionPriceMaximumEnabled || Double(divisionPriceMaximumText) != nil
        let divisionRangeIsValid = !(divisionPriceMinimumEnabled && divisionPriceMaximumEnabled) ||
            divisionPriceMinimum <= divisionPriceMaximum
        return priceIsValid && divisionMinimumIsValid && divisionMaximumIsValid && divisionRangeIsValid
    }

    private static func format(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.2f", value)
    }
}

extension KotlinInstant {
    var swiftDate: Date {
        Date(timeIntervalSince1970: TimeInterval(epochSeconds))
    }
}

extension Date {
    var kotlinInstant: KotlinInstant {
        KotlinInstant.companion.fromEpochMilliseconds(
            epochMilliseconds: Int64((timeIntervalSince1970 * 1000).rounded())
        )
    }
}

private extension View {
    @ViewBuilder
    func discoverBottomSheetPresentation() -> some View {
        if #available(iOS 16.0, *) {
            presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        } else {
            self
        }
    }
}
