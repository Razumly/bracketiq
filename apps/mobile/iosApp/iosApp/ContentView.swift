import UIKit
import SwiftUI
import ComposeApp
import IQKeyboardManagerSwift

struct ComposeView: UIViewControllerRepresentable {
    let deepLinkUrl: URL?
    
    init(deepLinkUrl: URL? = nil) {
        self.deepLinkUrl = deepLinkUrl
    }
    
    func makeUIViewController(context: Context) -> UIViewController {
        let deepLinkNav = deepLinkUrl?.extractDeepLinkNav()
        let composeController = MainViewControllerKt.MainViewController(
            nativeViewFactory: IOSNativeViewFactory.shared,
            deepLinkNav: deepLinkNav
        )

        let composeControllerType = type(of: composeController)
        if !IQKeyboardManager.shared.disabledDistanceHandlingClasses.contains(where: { $0 == composeControllerType }) {
            IQKeyboardManager.shared.disabledDistanceHandlingClasses.append(composeControllerType)
        }
        if !IQKeyboardManager.shared.disabledToolbarClasses.contains(where: { $0 == composeControllerType }) {
            IQKeyboardManager.shared.disabledToolbarClasses.append(composeControllerType)
        }

        composeController.view.backgroundColor = UIColor.systemBackground
        return composeController
    }
    
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        if let url = deepLinkUrl {
            _ = url.extractDeepLinkNav()
            // Since we can't call methods on the generated UIViewController,
            // we need to recreate it by forcing SwiftUI to rebuild
            // This is handled by the .id() modifier in the parent
        }
    }
}

// Extension to convert iOS URL to your DeepLinkNav object
extension URL {
    func extractDeepLinkNav() -> RootComponent.DeepLinkNav? {
        let pathSegments = self.pathComponents.filter { $0 != "/" }
        
        let effectiveSegments = if pathSegments.first == "mvp" {
            Array(pathSegments.dropFirst())
        } else {
            pathSegments
        }
        
        switch effectiveSegments.count {
        case 2 where effectiveSegments[0] == "event":
            return RootComponent.DeepLinkNavEvent.init(eventId: effectiveSegments[1])
            
        case 2 where effectiveSegments[0] == "host" && effectiveSegments[1] == "onboarding":
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
