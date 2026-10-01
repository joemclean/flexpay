import Foundation
import LocalAuthentication
import Security

/// Minimal Keychain wrapper. Values never leave the device.
enum Keychain {
    private static let service = "com.flexfund.kids"

    enum Account: String {
        case deviceToken
        case biometricPin
    }

    private static func baseQuery(_ account: Account) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account.rawValue,
        ]
    }

    @discardableResult
    static func set(_ value: String, for account: Account) -> Bool {
        delete(account)
        var query = baseQuery(account)
        query[kSecValueData as String] = Data(value.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    static func get(_ account: Account) -> String? {
        var query = baseQuery(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ account: Account) {
        SecItemDelete(baseQuery(account) as CFDictionary)
    }

    /// Stores a value that can only be read after a successful Face ID / Touch ID check.
    /// The item is invalidated automatically if biometric enrollment changes.
    static func setBiometricProtected(_ value: String, for account: Account) -> Bool {
        delete(account)
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .biometryCurrentSet, &error
        ) else { return false }
        var query = baseQuery(account)
        query[kSecValueData as String] = Data(value.utf8)
        query[kSecAttrAccessControl as String] = access
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    /// Reads a biometric-protected value; the system shows the Face ID prompt.
    static func getBiometricProtected(_ account: Account, reason: String) async -> String? {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let context = LAContext()
                context.localizedReason = reason
                var query = baseQuery(account)
                query[kSecReturnData as String] = true
                query[kSecMatchLimit as String] = kSecMatchLimitOne
                query[kSecUseAuthenticationContext as String] = context
                var result: AnyObject?
                let status = SecItemCopyMatching(query as CFDictionary, &result)
                if status == errSecSuccess, let data = result as? Data {
                    continuation.resume(returning: String(data: data, encoding: .utf8))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }
}

enum Biometrics {
    enum Kind { case none, faceID, touchID, opticID }

    static var available: Kind {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return .none }
        switch context.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        case .opticID: return .opticID
        default: return .none
        }
    }

    static var name: String {
        switch available {
        case .touchID: "Touch ID"
        case .opticID: "Optic ID"
        default: "Face ID"
        }
    }

    static var symbol: String {
        switch available {
        case .touchID: "touchid"
        case .opticID: "opticid"
        default: "faceid"
        }
    }
}
