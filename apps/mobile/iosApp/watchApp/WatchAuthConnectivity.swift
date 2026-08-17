import Foundation
import WatchConnectivity

final class WatchAuthConnectivity: NSObject, WCSessionDelegate {
    static let shared = WatchAuthConnectivity()

    private weak var viewModel: WatchOfficialViewModel?

    private override init() {
        super.init()
    }

    func start(viewModel: WatchOfficialViewModel) {
        self.viewModel = viewModel
        guard WCSession.isSupported() else {
            return
        }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handle(message)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        handle(userInfo)
    }

    private func handle(_ payload: [String: Any]) {
        guard let setupToken = (payload["setupToken"] as? String)?.trimmedOrNil else {
            return
        }
        Task { @MainActor in
            viewModel?.acceptSyncedSetupToken(setupToken)
        }
    }
}
