import SwiftUI

@main
struct MVPWatchApp: App {
    @StateObject private var viewModel: WatchOfficialViewModel

    init() {
        let tokenStore = WatchTokenStore()
        let api = WatchAPIClient(tokenStore: tokenStore)
        let repository = WatchMatchRepository(api: api, tokenStore: tokenStore)
        _viewModel = StateObject(wrappedValue: WatchOfficialViewModel(repository: repository))
    }

    var body: some Scene {
        WindowGroup {
            WatchOfficialAppView(viewModel: viewModel)
        }
    }
}
