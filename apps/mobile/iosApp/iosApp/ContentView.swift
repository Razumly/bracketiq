import UIKit
import SwiftUI
import ComposeApp

struct ComposeView: UIViewControllerRepresentable {
    let deepLinkUrl: URL?
    
    init(deepLinkUrl: URL? = nil) {
        self.deepLinkUrl = deepLinkUrl
    }

    func makeCoordinator() -> KeyboardAvoidanceCoordinator {
        KeyboardAvoidanceCoordinator()
    }
    
    func makeUIViewController(context: Context) -> UIViewController {
        let deepLinkNav = deepLinkUrl?.extractDeepLinkNav()
        let composeController = MainViewControllerKt.MainViewController(
            nativeViewFactory: IOSNativeViewFactory.shared,
            deepLinkNav: deepLinkNav
        )

        composeController.view.backgroundColor = UIColor.systemBackground
        context.coordinator.attach(to: composeController)
        return composeController
    }
    
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        context.coordinator.attach(to: uiViewController)
        if let url = deepLinkUrl {
            _ = url.extractDeepLinkNav()
            // Since we can't call methods on the generated UIViewController,
            // we need to recreate it by forcing SwiftUI to rebuild
            // This is handled by the .id() modifier in the parent
        }
    }
}

final class KeyboardAvoidanceCoordinator {
    private weak var viewController: UIViewController?
    private var observers: [NSObjectProtocol] = []

    func attach(to viewController: UIViewController) {
        guard self.viewController !== viewController else { return }
        detach()
        self.viewController = viewController
        registerKeyboardObservers()
    }

    deinit {
        detach()
    }

    private func detach() {
        observers.forEach(NotificationCenter.default.removeObserver)
        observers.removeAll()
        resetTransform()
        viewController = nil
    }

    private func registerKeyboardObservers() {
        let center = NotificationCenter.default
        observers.append(
            center.addObserver(
                forName: UIResponder.keyboardWillChangeFrameNotification,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                self?.handleKeyboardFrameChange(notification)
            }
        )
        observers.append(
            center.addObserver(
                forName: UIResponder.keyboardWillHideNotification,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                self?.resetTransform(animatedWith: notification)
            }
        )
    }

    private func handleKeyboardFrameChange(_ notification: Notification) {
        guard
            let controllerView = viewController?.view,
            let window = controllerView.window,
            let userInfo = notification.userInfo,
            let keyboardFrameValue = userInfo[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue
        else { return }

        let keyboardFrame = window.convert(keyboardFrameValue.cgRectValue, from: nil)
        let keyboardTop = keyboardFrame.minY
        let focusedView = controllerView.findFirstResponder()

        var targetOffset: CGFloat = 0
        if let focusedView {
            let focusedFrame = focusedView.convert(focusedView.bounds, to: window)
            let desiredGap: CGFloat = 12
            let overlap = (focusedFrame.maxY + desiredGap) - keyboardTop
            if overlap > 0 {
                targetOffset = -overlap
            }
        }

        animateTransform(
            to: targetOffset,
            using: notification
        )
    }

    private func resetTransform() {
        viewController?.view.transform = .identity
    }

    private func resetTransform(animatedWith notification: Notification) {
        animateTransform(to: 0, using: notification)
    }

    private func animateTransform(to yOffset: CGFloat, using notification: Notification) {
        guard let controllerView = viewController?.view else { return }
        let userInfo = notification.userInfo
        let duration = (userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0.25
        let curveRaw = (userInfo?[UIResponder.keyboardAnimationCurveUserInfoKey] as? NSNumber)?.uintValue
            ?? UInt(UIView.AnimationCurve.easeInOut.rawValue)
        let curveOptions = UIView.AnimationOptions(rawValue: curveRaw << 16)

        UIView.animate(
            withDuration: duration,
            delay: 0,
            options: [curveOptions, .beginFromCurrentState, .allowUserInteraction],
            animations: {
                controllerView.transform = CGAffineTransform(translationX: 0, y: yOffset)
            }
        )
    }
}

private extension UIView {
    func findFirstResponder() -> UIView? {
        if isFirstResponder {
            return self
        }
        for subview in subviews {
            if let responder = subview.findFirstResponder() {
                return responder
            }
        }
        return nil
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
