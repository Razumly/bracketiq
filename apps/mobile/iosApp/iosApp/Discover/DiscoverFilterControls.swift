import ComposeApp
import SwiftUI

struct NativeFilterOption: Identifiable, Hashable {
    let id: String
    let label: String
}

struct NativeOptionGridFilter: View {
    let title: String
    let options: [NativeFilterOption]
    @Binding var selectedIds: Set<String>
    var onSelectionChanged: (() -> Void)?

    init(
        title: String,
        options: [NativeFilterOption],
        selectedIds: Binding<Set<String>>,
        onSelectionChanged: (() -> Void)? = nil
    ) {
        self.title = title
        self.options = options
        _selectedIds = selectedIds
        self.onSelectionChanged = onSelectionChanged
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            NativeFilterSectionTitle(title)
            if options.isEmpty {
                Text("No options available.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 100), spacing: 8)],
                    alignment: .leading,
                    spacing: 8
                ) {
                    ForEach(options) { option in
                        NativeFilterChip(
                            label: option.label,
                            isSelected: selectedIds.contains(option.id)
                        ) {
                            if selectedIds.contains(option.id) {
                                selectedIds.remove(option.id)
                            } else {
                                selectedIds.insert(option.id)
                            }
                            onSelectionChanged?()
                        }
                    }
                }
            }
        }
    }
}

struct NativeEventSortFilter: View {
    @Binding var selectedSort: String

    private let options = [
        NativeFilterOption(id: "RECOMMENDED", label: "Recommended"),
        NativeFilterOption(id: "NEAREST", label: "Nearest"),
        NativeFilterOption(id: "SOONEST", label: "Soonest"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            NativeFilterSectionTitle("Sort events")
            HStack(spacing: 8) {
                ForEach(options) { option in
                    NativeFilterChip(
                        label: option.label,
                        isSelected: selectedSort == option.id
                    ) {
                        selectedSort = option.id
                    }
                }
            }
        }
    }
}

struct NativePriceRangeFilter: View {
    @Binding var draft: NativeDiscoverFilterDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                NativeFilterSectionTitle("Registration price")
                Spacer()
                Toggle("", isOn: $draft.priceEnabled)
                    .labelsHidden()
            }

            if draft.priceEnabled {
                HStack(spacing: 12) {
                    NativeCurrencyField(title: "Minimum", text: $draft.priceMinimumText)
                    NativeCurrencyField(title: "Maximum", text: $draft.priceMaximumText)
                }

                if draft.priceMinimum > draft.priceMaximum {
                    Text("Minimum price must not exceed maximum price.")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            } else {
                Text("Any price")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct NativeDateRangeFilter: View {
    @Binding var draft: NativeDiscoverFilterDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            NativeFilterSectionTitle("Date")

            DatePicker(
                "Starts on or after",
                selection: $draft.startDate,
                displayedComponents: .date
            )
            .datePickerStyle(.compact)

            HStack {
                Text("Set an end date")
                Spacer()
                Toggle("", isOn: $draft.endDateEnabled)
                    .labelsHidden()
            }

            if draft.endDateEnabled {
                DatePicker(
                    "Starts on or before",
                    selection: $draft.endDate,
                    in: draft.startDate...,
                    displayedComponents: .date
                )
                .datePickerStyle(.compact)
            }
        }
    }
}

struct NativeTagFilter: View {
    let tags: [EventTag]
    @Binding var selectedSlugs: Set<String>

    @State private var searchText = ""
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(.easeInOut(duration: 0.18)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        NativeFilterSectionTitle("Tags")
                        Text(selectedSummary)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search tags", text: $searchText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                .padding(.horizontal, 12)
                .frame(height: 42)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))

                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 105), spacing: 8)],
                    alignment: .leading,
                    spacing: 8
                ) {
                    ForEach(filteredTags, id: \.slug) { tag in
                        let slug = tagIdentity(tag)
                        NativeFilterChip(
                            label: tag.name,
                            isSelected: selectedSlugs.contains(slug)
                        ) {
                            if selectedSlugs.contains(slug) {
                                selectedSlugs.remove(slug)
                            } else {
                                selectedSlugs.insert(slug)
                            }
                        }
                    }
                }
            }
        }
        .onAppear {
            isExpanded = !selectedSlugs.isEmpty
        }
    }
}

private extension NativeTagFilter {
    var filteredTags: [EventTag] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return tags }
        return tags.filter { tag in
            tag.name.localizedCaseInsensitiveContains(query) ||
                tag.slug.localizedCaseInsensitiveContains(query)
        }
    }

    var selectedSummary: String {
        let selectedTags = tags.filter { selectedSlugs.contains(tagIdentity($0)) }
        switch selectedTags.count {
        case 0: return "Any tag"
        case 1: return selectedTags[0].name
        default: return "\(selectedTags.count) tags selected"
        }
    }

    func tagIdentity(_ tag: EventTag) -> String {
        let slug = tag.slug.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !slug.isEmpty { return slug }
        return tag.name
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
    }
}

struct NativeDivisionPriceFilter: View {
    var title = "Division price"
    @Binding var draft: NativeDiscoverFilterDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            NativeFilterSectionTitle(title)
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Toggle("Minimum", isOn: $draft.divisionPriceMinimumEnabled)
                        .font(.subheadline)
                    if draft.divisionPriceMinimumEnabled {
                        NativeCurrencyField(title: "Minimum", text: $draft.divisionPriceMinimumText)
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    Toggle("Maximum", isOn: $draft.divisionPriceMaximumEnabled)
                        .font(.subheadline)
                    if draft.divisionPriceMaximumEnabled {
                        NativeCurrencyField(title: "Maximum", text: $draft.divisionPriceMaximumText)
                    }
                }
            }
        }
    }
}

struct NativeDistanceFilter: View {
    @Binding var draft: NativeDiscoverFilterDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    NativeFilterSectionTitle("Distance")
                    if !draft.distanceEnabled {
                        Text("Any distance")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Toggle("", isOn: $draft.distanceEnabled)
                    .labelsHidden()
            }

            if draft.distanceEnabled {
                NativeDistanceSlider(value: $draft.radiusMiles)
                HStack {
                    Text("10 mi")
                    Spacer()
                    Text("100 mi")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
    }
}

private struct NativeDistanceSlider: View {
    @Binding var value: Double

    private let range = 10.0...100.0
    private let thumbInset: CGFloat = 14
    private let valueLabelWidth: CGFloat = 58

    var body: some View {
        GeometryReader { proxy in
            let trackWidth = max(proxy.size.width - (thumbInset * 2), 0)
            let progress = (value - range.lowerBound) / (range.upperBound - range.lowerBound)
            let thumbCenter = thumbInset + (trackWidth * CGFloat(progress))
            let labelLeading = min(
                max(thumbCenter - (valueLabelWidth / 2), 0),
                max(proxy.size.width - valueLabelWidth, 0)
            )

            ZStack(alignment: .topLeading) {
                Text("\(Int(value.rounded())) mi")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: valueLabelWidth)
                    .padding(.vertical, 3)
                    .background(Color.accentColor, in: Capsule())
                    .offset(x: labelLeading)
                    .accessibilityHidden(true)

                Slider(value: $value, in: range, step: 1)
                    .offset(y: 22)
                    .accessibilityLabel("Distance")
                    .accessibilityValue("\(Int(value.rounded())) miles")
            }
        }
        .frame(height: 52)
    }
}

struct NativeLocationFilter: View {
    @ObservedObject var state: DiscoverObservableState

    @State private var query = ""
    @State private var suggestions: [MVPPlace] = []
    @State private var isExpanded = false
    @State private var isSearching = false
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            NativeFilterSectionTitle("Location")

            Button {
                withAnimation(.easeInOut(duration: 0.18)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack {
                    Image(systemName: "mappin.and.ellipse")
                    Text(locationLabel)
                        .lineLimit(1)
                    Spacer()
                    Text(isExpanded ? "Hide" : "Change")
                        .foregroundStyle(Color.accentColor)
                }
                .font(.subheadline)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search city or area code", text: $query)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                }
                .padding(.horizontal, 12)
                .frame(height: 44)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))

                if state.currentLocation != nil {
                    NativeLocationChoice(
                        title: "My location",
                        subtitle: "Use your current location for distance filters"
                    ) {
                        state.component.useCurrentLocationForSearch()
                        finishSelection()
                    }
                }

                locationResults
            }
        }
        .onChange(of: query, perform: scheduleSearch)
        .onDisappear { searchTask?.cancel() }
    }
}

private extension NativeLocationFilter {
    var locationLabel: String {
        if let label = discoverNonEmpty(state.selectedSearchLocationLabel) {
            return label
        }
        return state.currentLocation == nil ? "Choose location" : "My location"
    }

    @ViewBuilder
    var locationResults: some View {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized.count < 2 {
            NativeFilterHint("Type at least 2 characters.")
        } else if isSearching {
            HStack(spacing: 8) {
                ProgressView()
                NativeFilterHint("Searching locations...")
            }
        } else if suggestions.isEmpty {
            NativeFilterHint("No locations found.")
        } else {
            ForEach(suggestions.prefix(5), id: \.id) { place in
                NativeLocationChoice(title: place.name, subtitle: place.address) {
                    state.component.selectSearchLocation(
                        label: place.name,
                        center: LatLng(latitude: place.latitude, longitude: place.longitude)
                    )
                    finishSelection()
                }
            }
        }
    }

    func scheduleSearch(_ value: String) {
        searchTask?.cancel()
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalized.count >= 2 else {
            suggestions = []
            isSearching = false
            return
        }

        searchTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            isSearching = true
            suggestions = (try? await state.mapComponent.searchLocationPlaces(query: normalized)) ?? []
            isSearching = false
        }
    }

    func finishSelection() {
        isExpanded = false
        query = ""
        suggestions = []
        searchTask?.cancel()
    }
}

private struct NativeLocationChoice: View {
    let title: String
    let subtitle: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                if let subtitle = discoverNonEmpty(subtitle) {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}

private struct NativeCurrencyField: View {
    let title: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 4) {
                Text("$").foregroundStyle(.secondary)
                TextField("0", text: $text)
                    .keyboardType(.decimalPad)
            }
            .padding(.horizontal, 10)
            .frame(height: 42)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))
        }
        .frame(maxWidth: .infinity)
    }
}

private struct NativeFilterChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(isSelected ? Color.white : Color.primary)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(
                    isSelected ? Color.accentColor : Color(uiColor: .secondarySystemGroupedBackground),
                    in: Capsule()
                )
                .overlay {
                    Capsule().stroke(isSelected ? Color.clear : Color.secondary.opacity(0.2), lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
    }
}

private struct NativeFilterSectionTitle: View {
    let title: String

    init(_ title: String) {
        self.title = title
    }

    var body: some View {
        Text(title)
            .font(.headline)
    }
}

private struct NativeFilterHint: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.vertical, 2)
    }
}
