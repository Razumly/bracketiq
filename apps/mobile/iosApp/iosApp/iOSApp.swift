import SwiftUI
import ComposeApp

@main
struct iOSApp: App {

    init() {
        MvpAppKt.doInitKoin()
    }

    var body: some Scene {
        WindowGroup {
            ContentView().onOpenURL {url in
                SharedWebAuthComponent.companion.handleIncomingCookie(url: url.absoluteString)
            }
        }
    }
}

