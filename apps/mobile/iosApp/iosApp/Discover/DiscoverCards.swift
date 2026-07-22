import ComposeApp
import SwiftUI
import UIKit

struct NativeDiscoverEventCard: View {
    let event: Event
    let organizationLogoId: String?
    let onSelected: () -> Void
    let onMapSelected: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                LinearGradient(
                    colors: [.clear, .black.opacity(0.64)],
                    startPoint: .center,
                    endPoint: .bottom
                )

                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(discoverTitleCase(event.eventType.name))
                            .font(.caption.weight(.semibold))
                        Text(event.displayPriceRangeLabel())
                            .font(.headline.weight(.bold))
                    }
                    .foregroundStyle(.white)

                    Spacer()

                    Button(action: onMapSelected) {
                        Image(systemName: "map.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.primary)
                            .frame(width: 40, height: 40)
                            .background(.regularMaterial, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Show \(event.name) on map")
                }
                .padding(12)
            }
            .frame(height: 170)

            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(event.name.isEmpty ? "Event" : event.name)
                        .font(.headline)
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    Spacer(minLength: 8)
                    NativeLifecycleBadge(state: event.state)
                }

                if !event.location.isEmpty {
                    Label(event.location, systemImage: "mappin.and.ellipse")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.82))
                        .lineLimit(1)
                }

                HStack {
                    Label(discoverEventDateLabel(event), systemImage: "calendar")
                    Spacer()
                    Text(event.teamSignup ? "Team registration" : "Individual registration")
                }
                .font(.caption.weight(.medium))
                .foregroundStyle(.white.opacity(0.82))
            }
            .padding(12)
            .background {
                DiscoverGradientGlassBackground()
            }
        }
        .background {
            DiscoverRemoteImage(
                url: discoverImageURL(
                    reference: event.imageId.isEmpty ? organizationLogoId : event.imageId,
                    width: 900,
                    height: 900
                ),
                fallbackURL: discoverInitialsImageURL(
                    name: event.name.isEmpty ? "Event" : event.name,
                    size: 512
                ),
                fallbackName: event.name,
                systemImage: "calendar"
            )
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.secondary.opacity(0.12), lineWidth: 1)
        }
        .compositingGroup()
        .shadow(color: .black.opacity(0.12), radius: 14, y: 7)
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .onTapGesture(perform: onSelected)
        .accessibilityAddTraits(.isButton)
    }
}

private struct DiscoverGradientGlassBackground: View {
    var body: some View {
        ZStack {
            glassMaterial

            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.48), location: 0),
                    .init(color: .black.opacity(0.54), location: 0.45),
                    .init(color: .black.opacity(0.62), location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var glassMaterial: some View {
        if #available(iOS 26.0, *) {
            Color.clear
                .glassEffect(
                    .regular.tint(.black.opacity(0.28)),
                    in: .rect(cornerRadius: 0)
                )
        } else {
            Rectangle()
                .fill(.ultraThinMaterial)
        }
    }
}

struct NativeDiscoverOrganizationCard: View {
    let organization: Organization
    let onSelected: () -> Void

    var body: some View {
        Button(action: onSelected) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    DiscoverAvatar(
                        name: organization.name,
                        imageReference: discoverOrganizationImageReference(organization),
                        size: 46,
                        systemImage: "person.3.fill"
                    )

                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(organization.name.isEmpty ? "Organization" : organization.name)
                                .font(.headline)
                                .lineLimit(1)
                            if organization.verificationStatus.name == "VERIFIED" {
                                Image(systemName: "checkmark.seal.fill")
                                    .foregroundStyle(Color.accentColor)
                                    .accessibilityLabel("Verified")
                            }
                        }

                        if let location = discoverNonEmpty(organization.location) {
                            Text(location)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }

                if let description = discoverNonEmpty(organization.organizationDescription) {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                HStack {
                    Text(discoverFieldCountLabel(organization.fieldIds.count))
                        .foregroundStyle(Color.accentColor)
                    Spacer()
                    Text(discoverDivisionSummary(organization.divisionSummary))
                        .foregroundStyle(.secondary)
                }
                .font(.caption.weight(.semibold))
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.secondary.opacity(0.12), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}

struct NativeDiscoverTeamCard: View {
    let team: Team
    let onSelected: () -> Void

    var body: some View {
        Button(action: onSelected) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    DiscoverAvatar(
                        name: team.name,
                        imageReference: team.profileImageId,
                        size: 46,
                        systemImage: "sportscourt.fill"
                    )
                    VStack(alignment: .leading, spacing: 3) {
                        Text(team.name.isEmpty ? "Team" : team.name)
                            .font(.headline)
                            .lineLimit(1)
                        Text(discoverTeamSubtitle(team))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }

                HStack {
                    Text(discoverNonEmpty(team.affiliateUrl) == nil ? "Open registration" : "External registration")
                        .foregroundStyle(Color.accentColor)
                    Spacer()
                    Text(discoverMoney(cents: Int(team.registrationPriceCents)))
                        .foregroundStyle(.secondary)
                }
                .font(.caption.weight(.semibold))
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.secondary.opacity(0.12), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}

struct NativeDiscoverRentalCard: View {
    let organization: Organization
    let onSelected: () -> Void

    var body: some View {
        Button(action: onSelected) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    DiscoverAvatar(
                        name: organization.name,
                        imageReference: discoverOrganizationImageReference(organization),
                        size: 46,
                        systemImage: "building.2.fill"
                    )
                    VStack(alignment: .leading, spacing: 3) {
                        Text(organization.name.isEmpty ? "Rental" : organization.name)
                            .font(.headline)
                            .lineLimit(1)
                        if let location = discoverNonEmpty(organization.location) {
                            Text(location)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }

                if let description = discoverNonEmpty(organization.organizationDescription) {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Text(discoverFieldCountLabel(organization.fieldIds.count))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.secondary.opacity(0.12), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}

struct NativeEventSuggestionRow: View {
    let event: Event
    let onSelected: () -> Void

    var body: some View {
        DiscoverSuggestionButton(
            title: event.name.isEmpty ? "Event" : event.name,
            subtitle: event.location,
            imageReference: event.imageId,
            systemImage: "calendar",
            onSelected: onSelected
        )
    }
}

struct NativeOrganizationSuggestionRow: View {
    let organization: Organization
    let onSelected: () -> Void

    var body: some View {
        DiscoverSuggestionButton(
            title: organization.name,
            subtitle: organization.location,
            imageReference: discoverOrganizationImageReference(organization),
            systemImage: "person.3.fill",
            onSelected: onSelected
        )
    }
}

struct NativeTeamSuggestionRow: View {
    let team: Team
    let onSelected: () -> Void

    var body: some View {
        DiscoverSuggestionButton(
            title: team.name,
            subtitle: discoverTeamSubtitle(team),
            imageReference: team.profileImageId,
            systemImage: "sportscourt.fill",
            onSelected: onSelected
        )
    }
}

struct NativeRentalSuggestionRow: View {
    let organization: Organization
    let onSelected: () -> Void

    var body: some View {
        DiscoverSuggestionButton(
            title: organization.name,
            subtitle: discoverFieldCountLabel(organization.fieldIds.count),
            imageReference: discoverOrganizationImageReference(organization),
            systemImage: "building.2.fill",
            onSelected: onSelected
        )
    }
}

private struct DiscoverSuggestionButton: View {
    let title: String
    let subtitle: String?
    let imageReference: String?
    let systemImage: String
    let onSelected: () -> Void

    var body: some View {
        Button(action: onSelected) {
            HStack(spacing: 10) {
                DiscoverAvatar(
                    name: title,
                    imageReference: imageReference,
                    size: 36,
                    systemImage: systemImage
                )
                VStack(alignment: .leading, spacing: 2) {
                    Text(title.isEmpty ? "Result" : title)
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
                Spacer(minLength: 0)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

struct DiscoverAvatar: View {
    let name: String
    let imageReference: String?
    let size: CGFloat
    let systemImage: String

    var body: some View {
        DiscoverRemoteImage(
            url: discoverImageURL(reference: imageReference, width: 144, height: 144),
            fallbackURL: discoverInitialsImageURL(
                name: name.isEmpty ? "Organization" : name,
                size: 144
            ),
            fallbackName: name,
            systemImage: systemImage
        )
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

struct DiscoverRemoteImage: View {
    let url: URL?
    let fallbackURL: URL?
    let fallbackName: String
    let systemImage: String

    @State private var phase = DiscoverRemoteImagePhase.idle

    var body: some View {
        Group {
            switch phase {
            case .success(let image):
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            case .idle, .loading:
                ZStack {
                    Color.secondary.opacity(0.12)
                    ProgressView()
                }
            case .failure:
                DiscoverImageFallback(name: fallbackName, systemImage: systemImage)
            }
        }
        .clipped()
        .task(id: requestIdentity) {
            await loadImage()
        }
    }

    private var requestIdentity: String {
        [url, fallbackURL]
            .compactMap { $0?.absoluteString }
            .joined(separator: "|")
    }

    @MainActor
    private func loadImage() async {
        phase = .loading
        var seenURLs = Set<String>()
        let candidates = [url, fallbackURL]
            .compactMap { $0 }
            .filter { candidate in
                seenURLs.insert(candidate.absoluteString).inserted
            }

        for candidate in candidates {
            if let cachedImage = discoverImageCache.object(forKey: candidate as NSURL) {
                phase = .success(cachedImage)
                return
            }

            var request = URLRequest(
                url: candidate,
                cachePolicy: .returnCacheDataElseLoad,
                timeoutInterval: 8
            )
            request.setValue("image/*", forHTTPHeaderField: "Accept")

            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                try Task.checkCancellation()
                guard let httpResponse = response as? HTTPURLResponse,
                      (200..<300).contains(httpResponse.statusCode),
                      let image = UIImage(data: data)
                else { continue }

                discoverImageCache.setObject(image, forKey: candidate as NSURL)
                phase = .success(image)
                return
            } catch is CancellationError {
                return
            } catch {
                continue
            }
        }

        phase = .failure
    }
}

private enum DiscoverRemoteImagePhase {
    case idle
    case loading
    case success(UIImage)
    case failure
}

private let discoverImageCache = NSCache<NSURL, UIImage>()

private struct DiscoverImageFallback: View {
    let name: String
    let systemImage: String

    var body: some View {
        GeometryReader { geometry in
            let initials = discoverInitials(name)
            let edge = min(geometry.size.width, geometry.size.height)
            let scale: CGFloat = initials.count >= 3 ? 0.34 : initials.count == 2 ? 0.42 : 0.5

            ZStack {
                LinearGradient(
                    colors: [Color.accentColor.opacity(0.9), Color.accentColor.opacity(0.55)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                if initials == "?" {
                    Image(systemName: systemImage)
                        .foregroundStyle(.white)
                        .font(.system(size: max(16, edge * 0.42), weight: .bold))
                } else {
                    Text(initials)
                        .font(.system(
                            size: max(14, edge * scale),
                            weight: .bold,
                            design: .rounded
                        ))
                        .foregroundStyle(.white)
                        .minimumScaleFactor(0.6)
                        .padding(6)
                }
            }
        }
    }
}

private struct NativeLifecycleBadge: View {
    let state: String

    var body: some View {
        Text(discoverTitleCase(state))
            .font(.caption2.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(discoverLifecycleColor(state), in: Capsule())
    }
}

func discoverImageURL(reference: String?, width: Int, height: Int) -> URL? {
    guard let reference = discoverNonEmpty(reference) else { return nil }
    if reference.hasPrefix("https://") || reference.hasPrefix("http://") {
        return URL(string: reference)
    }
    let baseURLString = UtilKt.getImageUrl(
        fileId: reference,
        width: nil,
        height: nil,
        trim: false
    )
    guard var components = URLComponents(string: baseURLString) else {
        return URL(string: baseURLString)
    }
    var queryItems = components.queryItems ?? []
    queryItems.removeAll { $0.name == "w" || $0.name == "h" }
    queryItems.append(URLQueryItem(name: "w", value: String(width)))
    queryItems.append(URLQueryItem(name: "h", value: String(height)))
    components.queryItems = queryItems
    return components.url
}

func discoverInitialsImageURL(name: String, size: Int) -> URL? {
    URL(string: UtilKt.getInitialsAvatarUrl(name: name, size: Int32(size)))
}

func discoverOrganizationImageReference(_ organization: Organization) -> String? {
    discoverNonEmpty(organization.logoId) ??
        discoverNonEmpty(organization.logoUrl) ??
        discoverNonEmpty(organization.imageUrl)
}

func discoverNonEmpty(_ value: String?) -> String? {
    let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return normalized.isEmpty ? nil : normalized
}

func discoverInitials(_ value: String) -> String {
    let words = value.split(whereSeparator: { $0.isWhitespace })
    if words.isEmpty { return "?" }
    if words.count == 1 { return String(words[0].prefix(2)).uppercased() }
    return words.prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
}

func discoverTitleCase(_ value: String) -> String {
    value
        .replacingOccurrences(of: "_", with: " ")
        .replacingOccurrences(of: "-", with: " ")
        .lowercased()
        .capitalized
}

func discoverEventDateLabel(_ event: Event) -> String {
    if let display = discoverNonEmpty(event.dateDisplayText) ?? discoverNonEmpty(event.scheduleText) {
        return display
    }
    let date = Date(timeIntervalSince1970: TimeInterval(event.start.epochSeconds))
    return date.formatted(date: .abbreviated, time: .shortened)
}

func discoverFieldCountLabel(_ count: Int) -> String {
    count == 1 ? "1 rentable field" : "\(count) rentable fields"
}

func discoverDivisionSummary(_ summary: OrganizationDivisionSummary) -> String {
    let count = Int(summary.count)
    let divisionLabel = count == 1 ? "1 division" : "\(count) divisions"
    guard let min = summary.minPrice?.intValue, let max = summary.maxPrice?.intValue else {
        return "\(divisionLabel) · Price not specified"
    }
    let priceLabel = min == max
        ? discoverMoney(cents: Int(min))
        : "\(discoverMoney(cents: Int(min)))–\(discoverMoney(cents: Int(max)))"
    return "\(divisionLabel) · \(priceLabel)"
}

func discoverMoney(cents: Int) -> String {
    guard cents > 0 else { return "Free" }
    let dollars = Double(cents) / 100
    return dollars.formatted(.currency(code: "USD"))
}

func discoverTeamSubtitle(_ team: Team) -> String {
    let values = [team.sport, team.skillDivisionTypeName, team.ageDivisionTypeName]
        .compactMap(discoverNonEmpty)
    return values.isEmpty ? team.division : values.joined(separator: " • ")
}

private func discoverLifecycleColor(_ value: String) -> Color {
    switch value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
    case "UNPUBLISHED", "DRAFT": return .orange
    case "PRIVATE": return .purple
    case "TEMPLATE": return .blue
    default: return .green
    }
}
