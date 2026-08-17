import Foundation

private let watchOperationKindMatchUpdate = "MATCH_UPDATE"
private let watchOperationStatusPending = "PENDING"
private let watchOperationStatusSyncing = "SYNCING"
private let watchOperationStatusFailed = "FAILED"
private let watchOperationSourceDevice = "WATCH_OS"

enum WatchMatchOperationStoreError: LocalizedError {
    case corruptOperations(Error)
    case encodeOperations(Error)

    var errorDescription: String? {
        switch self {
        case .corruptOperations:
            return "Saved score updates could not be read. They were kept on this watch. Update the app or retry before recording more scores."
        case .encodeOperations:
            return "The score update could not be saved on this watch. Retry before leaving the match."
        }
    }
}

struct WatchPendingMatchOperation: Codable, Equatable {
    let id: String
    let eventId: String
    let matchId: String
    let kind: String
    let payloadJson: String
    let clientDeviceId: String
    let clientCreatedAt: String
    let clientSequence: Int64
    let sourceDevice: String
    let status: String
    let attemptCount: Int
    let lastError: String?
    let lastAttemptAt: String?

    func withPayload(_ payloadJson: String) -> WatchPendingMatchOperation {
        copy(payloadJson: payloadJson)
    }

    func copy(
        payloadJson: String? = nil,
        status: String? = nil,
        attemptCount: Int? = nil,
        lastError: String?? = nil,
        lastAttemptAt: String?? = nil
    ) -> WatchPendingMatchOperation {
        WatchPendingMatchOperation(
            id: id,
            eventId: eventId,
            matchId: matchId,
            kind: kind,
            payloadJson: payloadJson ?? self.payloadJson,
            clientDeviceId: clientDeviceId,
            clientCreatedAt: clientCreatedAt,
            clientSequence: clientSequence,
            sourceDevice: sourceDevice,
            status: status ?? self.status,
            attemptCount: attemptCount ?? self.attemptCount,
            lastError: lastError ?? self.lastError,
            lastAttemptAt: lastAttemptAt ?? self.lastAttemptAt
        )
    }

    var payloadBody: [String: Any]? {
        guard let data = payloadJson.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return object
    }
}

private struct WatchPendingMatchOperationList: Codable {
    let operations: [WatchPendingMatchOperation]
}

final class WatchMatchOperationStore {
    private let defaults: UserDefaults
    private let queue = DispatchQueue(label: "com.razumly.mvp.watch.match-operation-store")
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func clear() {
        queue.sync {
            defaults.removeObject(forKey: Keys.operations)
        }
    }

    func deviceId() -> String {
        queue.sync {
            if let stored = defaults.string(forKey: Keys.deviceId)?.trimmedOrNil {
                return stored
            }
            let generated = "watch-\(UUID().uuidString)"
            defaults.set(generated, forKey: Keys.deviceId)
            return generated
        }
    }

    func newOperation(eventId: String, matchId: String) throws -> WatchPendingMatchOperation {
        try queue.sync {
            let sequence = try nextSequenceUnlocked()
            let deviceId = deviceIdUnlocked()
            return WatchPendingMatchOperation(
                id: "\(deviceId):\(matchId):\(sequence)",
                eventId: eventId,
                matchId: matchId,
                kind: watchOperationKindMatchUpdate,
                payloadJson: "{}",
                clientDeviceId: deviceId,
                clientCreatedAt: ISO8601DateFormatter.api.string(from: Date()),
                clientSequence: sequence,
                sourceDevice: watchOperationSourceDevice,
                status: watchOperationStatusPending,
                attemptCount: 0,
                lastError: nil,
                lastAttemptAt: nil
            )
        }
    }

    func upsertOperation(_ operation: WatchPendingMatchOperation) throws {
        try queue.sync {
            let next = try operationsUnlocked()
                .filter { $0.id != operation.id }
                .appending(operation)
                .sortedBySyncOrder()
            try writeOperationsUnlocked(next)
        }
    }

    func pendingOperations(matchId: String? = nil) throws -> [WatchPendingMatchOperation] {
        try queue.sync {
            let normalizedMatchId = matchId?.trimmedOrNil
            let retryableStatuses = [watchOperationStatusPending, watchOperationStatusFailed, watchOperationStatusSyncing]
            return try operationsUnlocked()
                .filter { retryableStatuses.contains($0.status) }
                .filter { normalizedMatchId == nil || $0.matchId.trimmedOrNil == normalizedMatchId }
                .sortedBySyncOrder()
        }
    }

    func markAttempting(_ operationId: String) throws {
        try updateOperation(operationId) { operation in
            operation.copy(
                status: watchOperationStatusSyncing,
                attemptCount: operation.attemptCount + 1,
                lastError: .some(nil),
                lastAttemptAt: .some(ISO8601DateFormatter.api.string(from: Date()))
            )
        }
    }

    func markFailed(_ operationId: String, error: String) throws {
        try updateOperation(operationId) { operation in
            operation.copy(
                status: watchOperationStatusFailed,
                lastError: .some(error),
                lastAttemptAt: .some(ISO8601DateFormatter.api.string(from: Date()))
            )
        }
    }

    func markAcked(_ operationId: String) throws {
        try queue.sync {
            try writeOperationsUnlocked(try operationsUnlocked().filter { $0.id != operationId })
        }
    }

    private func updateOperation(
        _ operationId: String,
        update: (WatchPendingMatchOperation) -> WatchPendingMatchOperation
    ) throws {
        try queue.sync {
            try writeOperationsUnlocked(try operationsUnlocked().map { operation in
                operation.id == operationId ? update(operation) : operation
            })
        }
    }

    private func nextSequenceUnlocked() throws -> Int64 {
        let next = max(
            Int64(defaults.integer(forKey: Keys.lastSequence)),
            try operationsUnlocked().map(\.clientSequence).max() ?? 0
        ) + 1
        defaults.set(next, forKey: Keys.lastSequence)
        return next
    }

    private func deviceIdUnlocked() -> String {
        if let stored = defaults.string(forKey: Keys.deviceId)?.trimmedOrNil {
            return stored
        }
        let generated = "watch-\(UUID().uuidString)"
        defaults.set(generated, forKey: Keys.deviceId)
        return generated
    }

    private func operationsUnlocked() throws -> [WatchPendingMatchOperation] {
        guard let data = defaults.data(forKey: Keys.operations) else {
            return []
        }
        do {
            return try decoder.decode(WatchPendingMatchOperationList.self, from: data).operations
        } catch {
            throw WatchMatchOperationStoreError.corruptOperations(error)
        }
    }

    private func writeOperationsUnlocked(_ operations: [WatchPendingMatchOperation]) throws {
        let data: Data
        do {
            data = try encoder.encode(WatchPendingMatchOperationList(operations: operations))
        } catch {
            throw WatchMatchOperationStoreError.encodeOperations(error)
        }
        defaults.set(data, forKey: Keys.operations)
    }

    private enum Keys {
        static let deviceId = "mvp_watch_match_operation_device_id"
        static let lastSequence = "mvp_watch_match_operation_last_sequence"
        static let operations = "mvp_watch_match_operations"
    }
}

extension Array where Element == WatchPendingMatchOperation {
    fileprivate func sortedBySyncOrder() -> [WatchPendingMatchOperation] {
        sorted {
            if $0.clientSequence == $1.clientSequence {
                return $0.clientCreatedAt < $1.clientCreatedAt
            }
            return $0.clientSequence < $1.clientSequence
        }
    }
}

extension Array {
    fileprivate func appending(_ element: Element) -> [Element] {
        self + [element]
    }
}
