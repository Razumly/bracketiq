import SwiftUI
import UIKit

struct NativeStartupSplashScreen: View {
    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Text("BracketIQ")
                    .font(.title2)
                    .fontWeight(.regular)
                    .accessibilityIdentifier("startup-splash-title")

                ProgressView()
                    .progressViewStyle(.circular)
                    .scaleEffect(1.25)
                    .frame(width: 40, height: 40)
                    .accessibilityLabel("Loading BracketIQ")
                    .accessibilityIdentifier("startup-splash-progress")
            }
        }
    }
}

extension IOSNativeViewFactory {
    func createNativeStartupSplashViewController() -> UIViewController {
        let hostingController = UIHostingController(rootView: NativeStartupSplashScreen())
        hostingController.view.backgroundColor = .systemBackground
        return hostingController
    }
}
