import SwiftUI
import UIKit

enum NativeDiscoverGuideTarget: Hashable {
    case tabs
    case search
    case filters
    case firstResult
    case map
    case create
}

struct NativeDiscoverGuideTargetPreferenceKey: PreferenceKey {
    static var defaultValue: [NativeDiscoverGuideTarget: Anchor<CGRect>] = [:]

    static func reduce(
        value: inout [NativeDiscoverGuideTarget: Anchor<CGRect>],
        nextValue: () -> [NativeDiscoverGuideTarget: Anchor<CGRect>]
    ) {
        value.merge(nextValue(), uniquingKeysWith: { _, latest in latest })
    }
}

extension View {
    @ViewBuilder
    func nativeDiscoverGuideTarget(_ target: NativeDiscoverGuideTarget?) -> some View {
        if let target {
            transformAnchorPreference(
                key: NativeDiscoverGuideTargetPreferenceKey.self,
                value: .bounds
            ) { targets, anchor in
                targets[target] = anchor
            }
        } else {
            self
        }
    }
}

struct NativeDiscoverOnboardingStep {
    let target: NativeDiscoverGuideTarget
    let title: String
    let body: String
    let usesCircularHighlight: Bool

    static let all = [
        NativeDiscoverOnboardingStep(
            target: .tabs,
            title: "Browse by category",
            body: "Switch between events, orgs, teams, and rentals from the Discover tabs.",
            usesCircularHighlight: false
        ),
        NativeDiscoverOnboardingStep(
            target: .search,
            title: "Search Discover",
            body: "Search for events, venues, orgs, teams, and rental locations from the active tab.",
            usesCircularHighlight: false
        ),
        NativeDiscoverOnboardingStep(
            target: .filters,
            title: "Narrow event results",
            body: "Use filters to narrow event results by location, sport, tags, division, date, and price.",
            usesCircularHighlight: true
        ),
        NativeDiscoverOnboardingStep(
            target: .firstResult,
            title: "Open a result",
            body: "Tap a card to view details, register, manage available actions, or inspect rental options.",
            usesCircularHighlight: false
        ),
        NativeDiscoverOnboardingStep(
            target: .map,
            title: "Use the map",
            body: "Open the map to compare nearby results by location.",
            usesCircularHighlight: false
        ),
        NativeDiscoverOnboardingStep(
            target: .create,
            title: "Create from anywhere",
            body: "Use the center action to create an event or jump back into an active event shortcut.",
            usesCircularHighlight: true
        ),
    ]
}

struct NativeDiscoverOnboardingOverlay: View {
    let stepIndex: Int
    let targetAnchors: [NativeDiscoverGuideTarget: Anchor<CGRect>]
    let bottomPadding: CGFloat
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        GeometryReader { geometry in
            let step = NativeDiscoverOnboardingStep.all[stepIndex]
            let rawTargetRect = resolvedTargetRect(for: step.target, in: geometry)
            let targetRect = paddedTargetRect(rawTargetRect, in: geometry.size)

            ZStack {
                NativeDiscoverGuideScrim(
                    targetRect: targetRect,
                    usesCircularHighlight: step.usesCircularHighlight
                )
                .allowsHitTesting(false)

                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {}

                NativeDiscoverGuideHighlight(
                    targetRect: targetRect,
                    usesCircularHighlight: step.usesCircularHighlight
                )
                .allowsHitTesting(false)

                guideCard(
                    step: step,
                    targetRect: targetRect,
                    geometry: geometry
                )
            }
        }
        .transition(.opacity)
        .accessibilityElement(children: .contain)
    }
}

private extension NativeDiscoverOnboardingOverlay {
    func resolvedTargetRect(
        for target: NativeDiscoverGuideTarget,
        in geometry: GeometryProxy
    ) -> CGRect {
        if let anchor = targetAnchors[target] {
            let targetRect = geometry[anchor]

            if target == .map {
                return CGRect(
                    x: targetRect.minX,
                    y: targetRect.minY,
                    width: targetRect.width,
                    height: min(targetRect.height, 48)
                )
            }

            return targetRect
        }
        return fallbackTargetRect(for: target, in: geometry)
    }

    func fallbackTargetRect(
        for target: NativeDiscoverGuideTarget,
        in geometry: GeometryProxy
    ) -> CGRect {
        let width = geometry.size.width
        let height = geometry.size.height
        let safeTop = max(geometry.safeAreaInsets.top, windowSafeAreaTop)

        switch target {
        case .tabs:
            return CGRect(x: 8, y: safeTop, width: max(width - 16, 0), height: 42)
        case .search:
            return CGRect(x: 12, y: safeTop + 50, width: max(width - 24, 0), height: 48)
        case .filters:
            return CGRect(x: max(width - 62, 0), y: safeTop + 34, width: 48, height: 48)
        case .firstResult:
            return CGRect(x: 16, y: safeTop + 118, width: max(width - 32, 0), height: 176)
        case .map:
            return CGRect(
                x: max((width - 104) / 2, 0),
                y: max(height - bottomPadding - 64, 0),
                width: 104,
                height: 48
            )
        case .create:
            return CGRect(
                x: max((width - 64) / 2, 0),
                y: max(height - bottomPadding - 14, 0),
                width: 64,
                height: 64
            )
        }
    }

    var windowSafeAreaTop: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .safeAreaInsets.top ?? 0
    }

    func paddedTargetRect(_ rect: CGRect, in size: CGSize) -> CGRect {
        let bounds = CGRect(origin: .zero, size: size)
        let padded = rect.insetBy(dx: -8, dy: -8)
        return padded.intersection(bounds)
    }

    @ViewBuilder
    func guideCard(
        step: NativeDiscoverOnboardingStep,
        targetRect: CGRect,
        geometry: GeometryProxy
    ) -> some View {
        let placeBelowTarget = targetRect.midY < geometry.size.height * 0.48

        if placeBelowTarget {
            VStack(spacing: 0) {
                Spacer()
                    .frame(height: targetRect.maxY + 12)
                NativeDiscoverGuideCard(
                    step: step,
                    stepIndex: stepIndex,
                    onPrevious: onPrevious,
                    onNext: onNext,
                    onDismiss: onDismiss
                )
                Spacer(minLength: max(geometry.safeAreaInsets.bottom, 16))
            }
            .padding(.horizontal, 16)
        } else {
            VStack(spacing: 0) {
                Spacer(minLength: geometry.safeAreaInsets.top + 16)
                NativeDiscoverGuideCard(
                    step: step,
                    stepIndex: stepIndex,
                    onPrevious: onPrevious,
                    onNext: onNext,
                    onDismiss: onDismiss
                )
                Spacer()
                    .frame(height: max(geometry.size.height - targetRect.minY + 12, 16))
            }
            .padding(.horizontal, 16)
        }
    }
}

private struct NativeDiscoverGuideScrim: View {
    let targetRect: CGRect
    let usesCircularHighlight: Bool

    var body: some View {
        GeometryReader { geometry in
            Path { path in
                path.addRect(CGRect(origin: .zero, size: geometry.size))
                if usesCircularHighlight {
                    path.addEllipse(in: targetRect)
                } else {
                    path.addRoundedRect(
                        in: targetRect,
                        cornerSize: CGSize(width: 14, height: 14)
                    )
                }
            }
            .fill(
                Color.black.opacity(0.58),
                style: FillStyle(eoFill: true)
            )
        }
    }
}

private struct NativeDiscoverGuideHighlight: View {
    let targetRect: CGRect
    let usesCircularHighlight: Bool

    var body: some View {
        Group {
            if usesCircularHighlight {
                Ellipse()
                    .stroke(Color.accentColor, lineWidth: 2)
            } else {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.accentColor, lineWidth: 2)
            }
        }
        .frame(width: targetRect.width, height: targetRect.height)
        .position(x: targetRect.midX, y: targetRect.midY)
    }
}

private struct NativeDiscoverGuideCard: View {
    let step: NativeDiscoverOnboardingStep
    let stepIndex: Int
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onDismiss: () -> Void

    private var isLastStep: Bool {
        stepIndex == NativeDiscoverOnboardingStep.all.count - 1
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(step.title)
                    .font(.headline)
                    .foregroundStyle(.primary)

                Spacer()

                Text("\(stepIndex + 1)/\(NativeDiscoverOnboardingStep.all.count)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Text(step.body)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Button(isLastStep ? "Done" : "Skip", action: onDismiss)
                    .buttonStyle(.plain)
                    .font(.subheadline.weight(.semibold))

                Spacer()

                if stepIndex > 0 {
                    Button(action: onPrevious) {
                        Image(systemName: "chevron.left")
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Previous tip")
                }

                Button(action: onNext) {
                    Image(systemName: isLastStep ? "checkmark" : "chevron.right")
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isLastStep ? "Finish walkthrough" : "Next tip")
            }
            .foregroundStyle(Color.accentColor)
        }
        .padding(16)
        .frame(maxWidth: 340)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.secondary.opacity(0.18), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.22), radius: 14, y: 6)
    }
}
