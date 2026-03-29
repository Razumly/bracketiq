import UIKit
import SwiftUI
import ComposeApp

struct ComposeView: UIViewControllerRepresentable {
    let deepLinkUrl: URL?
    
    init(deepLinkUrl: URL? = nil) {
        self.deepLinkUrl = deepLinkUrl
    }

    func makeCoordinator() -> KeyboardDismissCoordinator {
        KeyboardDismissCoordinator()
    }

    func makeUIViewController(context: Context) -> UIViewController {
        let deepLinkNav = deepLinkUrl?.extractDeepLinkNav()
        let composeController = MainViewControllerKt.MainViewController(
            nativeViewFactory: IOSNativeViewFactory.shared,
            deepLinkNav: deepLinkNav
        )

        composeController.view.backgroundColor = UIColor.systemBackground
        context.coordinator.attach(to: composeController.view)
        return composeController
    }
    
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        context.coordinator.attach(to: uiViewController.view)
        if let url = deepLinkUrl {
            _ = url.extractDeepLinkNav()
            // Since we can't call methods on the generated UIViewController,
            // we need to recreate it by forcing SwiftUI to rebuild
            // This is handled by the .id() modifier in the parent
        }
    }
}

final class KeyboardDismissCoordinator: NSObject, UIGestureRecognizerDelegate {
    private weak var rootView: UIView?
    private weak var tapRecognizer: UITapGestureRecognizer?
    private weak var panRecognizer: UIPanGestureRecognizer?

    func attach(to view: UIView) {
        guard rootView !== view else { return }
        detach()

        rootView = view

        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        tap.cancelsTouchesInView = false
        tap.delegate = self
        view.addGestureRecognizer(tap)
        tapRecognizer = tap

        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        pan.cancelsTouchesInView = false
        pan.delegate = self
        view.addGestureRecognizer(pan)
        panRecognizer = pan
    }

    deinit {
        detach()
    }

    private func detach() {
        if let tapRecognizer {
            tapRecognizer.view?.removeGestureRecognizer(tapRecognizer)
        }
        if let panRecognizer {
            panRecognizer.view?.removeGestureRecognizer(panRecognizer)
        }
        tapRecognizer = nil
        panRecognizer = nil
        rootView = nil
    }

    @objc
    private func handleTap(_ gesture: UITapGestureRecognizer) {
        guard gesture.state == .ended else { return }
        rootView?.endEditing(true)
    }

    @objc
    private func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard gesture.state == .began else { return }
        rootView?.endEditing(true)
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        !touch.isInsideTextInput()
    }
}

private extension UITouch {
    func isInsideTextInput() -> Bool {
        var currentView: UIView? = self.view
        while let view = currentView {
            if view is UITextField || view is UITextView {
                return true
            }
            currentView = view.superview
        }
        return false
    }
}

// Extension to convert iOS URL to your DeepLinkNav object
extension URL {
    func extractDeepLinkNav() -> RootComponent.DeepLinkNav? {
        let pathSegments = self.pathComponents.filter { $0 != "/" && !$0.isEmpty }
        let normalizedScheme = self.scheme?.lowercased() ?? ""
        let normalizedHost = self.host?.lowercased() ?? ""

        let segmentsWithHost: [String]
        if (normalizedScheme == "mvp" || normalizedScheme == "razumly")
            && !normalizedHost.isEmpty
            && !normalizedHost.contains(".") {
            segmentsWithHost = [normalizedHost] + pathSegments
        } else {
            segmentsWithHost = pathSegments
        }

        let effectiveSegments: [String]
        if segmentsWithHost.first?.lowercased() == "mvp" {
            effectiveSegments = Array(segmentsWithHost.dropFirst())
        } else {
            effectiveSegments = segmentsWithHost
        }

        if effectiveSegments.count >= 2 {
            let route = effectiveSegments[0].lowercased()
            let eventId = effectiveSegments[1].trimmingCharacters(in: .whitespacesAndNewlines)
            if route == "event" || route == "events" || route == "tournament" || route == "tournaments" {
                if !eventId.isEmpty {
                    return RootComponent.DeepLinkNavEvent.init(eventId: eventId)
                }
            }
        }

        switch effectiveSegments.count {
        case 2 where effectiveSegments[0].lowercased() == "host" && effectiveSegments[1].lowercased() == "onboarding":
            let queryItems = URLComponents(url: self, resolvingAgainstBaseURL: false)?.queryItems
            let isRefresh = queryItems?.first(where: { $0.name == "refresh" })?.value == "true"
            let isReturn = queryItems?.first(where: { $0.name == "success" })?.value == "true"
            
            if isRefresh {
                return RootComponent.DeepLinkNavRefresh()
            } else if isReturn {
                return RootComponent.DeepLinkNavReturn()
            }
            return nil
            
        default:
            return nil
        }
    }
}
