import SwiftUI

@main
struct MVPWatchApp: App {
    @StateObject private var viewModel: WatchOfficialViewModel

    init() {
        let tokenStore = WatchTokenStore()
        let api = WatchAPIClient(tokenStore: tokenStore)
        let repository = WatchMatchRepository(api: api, tokenStore: tokenStore)
        repository.startNetworkRetryMonitor()
        #if DEBUG
        if let demoRoute = ProcessInfo.processInfo.arguments.compactMap({ argument -> String? in
            guard argument.hasPrefix("--mvp-watch-demo=") else { return nil }
            return String(argument.dropFirst("--mvp-watch-demo=".count))
        }).first {
            _viewModel = StateObject(wrappedValue: WatchOfficialViewModel.demo(routeName: demoRoute, repository: repository))
            return
        }
        #endif
        let viewModel = WatchOfficialViewModel(repository: repository)
        WatchAuthConnectivity.shared.start(viewModel: viewModel)
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some Scene {
        WindowGroup {
            WatchOfficialAppView(viewModel: viewModel)
        }
    }
}
