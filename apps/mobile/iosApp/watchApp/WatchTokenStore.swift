import Foundation
import Security

final class WatchTokenStore {
    private let service = "com.razumly.mvp.watch.auth"
    private let account = "bearer-token"
    private let tokenFallbackKey = "mvp_watch_auth_token"
    private let userIdKey = "mvp_watch_user_id"
    private let userLabelKey = "mvp_watch_user_label"

    var token: String {
        readKeychainValue() ?? UserDefaults.standard.string(forKey: tokenFallbackKey) ?? ""
    }

    var currentUserId: String? {
        UserDefaults.standard.string(forKey: userIdKey).trimmedOrNil
    }

    var currentUserLabel: String? {
        UserDefaults.standard.string(forKey: userLabelKey).trimmedOrNil
    }

    func save(token: String, userId: String?, label: String?) {
        let saved = saveKeychainValue(token)
        if !saved {
            UserDefaults.standard.set(token, forKey: tokenFallbackKey)
        } else {
            UserDefaults.standard.removeObject(forKey: tokenFallbackKey)
        }
        UserDefaults.standard.set(userId, forKey: userIdKey)
        UserDefaults.standard.set(label, forKey: userLabelKey)
    }

    func clear() {
        deleteKeychainValue()
        UserDefaults.standard.removeObject(forKey: tokenFallbackKey)
        UserDefaults.standard.removeObject(forKey: userIdKey)
        UserDefaults.standard.removeObject(forKey: userLabelKey)
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    private func readKeychainValue() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8).trimmedOrNil
    }

    private func saveKeychainValue(_ value: String) -> Bool {
        guard let data = value.data(using: .utf8) else {
            return false
        }
        deleteKeychainValue()
        var query = baseQuery()
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    private func deleteKeychainValue() {
        SecItemDelete(baseQuery() as CFDictionary)
    }
}
