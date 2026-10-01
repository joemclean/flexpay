import Foundation
import Observation
import SwiftUI
import UIKit

/// App-wide session state: pairing, PIN lock, Face ID, and which screen is showing.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        case launching
        case welcome
        case locked
        case unlocked
    }

    var phase: Phase = .launching
    private(set) var child: KidChild?
    private(set) var familyName: String?
    var lockedUntil: Date?
    var showProfile = false
    /// Set after a successful PIN entry when Face ID could be turned on.
    var offerBiometrics = false
    /// Bumped when the app returns to the foreground so screens refresh.
    private(set) var refreshTick = 0
    /// A message shown on the Welcome screen (e.g. "This iPhone was disconnected").
    var welcomeNotice: String?
    var pendingDeepLinkCode: String?

    let api: APIClient
    let data: KidData

    private var pinForBiometricOffer: String?
    private var backgroundedAt: Date?
    private let defaults = UserDefaults.standard
    private static let autoLockAfter: TimeInterval = 5 * 60

    init(api: APIClient? = nil) {
        let api = api ?? APIClient()
        self.api = api
        self.data = KidData(api: api)
        api.onKidUnauthorized = { [weak self] in
            Task { await self?.handleKidUnauthorized() }
        }
    }

    // MARK: Persistence

    private enum Keys {
        static let child = "child"
        static let familyName = "familyName"
        static let biometricsEnabled = "biometricsEnabled"
        static let biometricsOffered = "biometricsOffered"
    }

    var biometricsEnabled = UserDefaults.standard.bool(forKey: Keys.biometricsEnabled) {
        didSet { defaults.set(biometricsEnabled, forKey: Keys.biometricsEnabled) }
    }

    var canUseBiometrics: Bool { Biometrics.available != .none }

    private func saveChild(_ child: KidChild, family: String?) {
        self.child = child
        if let family { familyName = family }
        if let data = try? JSONEncoder().encode(child) { defaults.set(data, forKey: Keys.child) }
        if let family { defaults.set(family, forKey: Keys.familyName) }
    }

    private func clearPairing() {
        Keychain.delete(.deviceToken)
        Keychain.delete(.biometricPin)
        api.deviceToken = nil
        api.kidToken = nil
        defaults.removeObject(forKey: Keys.child)
        defaults.removeObject(forKey: Keys.familyName)
        biometricsEnabled = false
        defaults.removeObject(forKey: Keys.biometricsOffered)
        child = nil
        familyName = nil
        data.reset()
    }

    // MARK: Launch

    func start() async {
        if AppConfig.isUITesting {
            clearPairing()
            UIView.setAnimationsEnabled(false)
        }
        guard let token = Keychain.get(.deviceToken) else {
            phase = .welcome
            return
        }
        api.deviceToken = token
        if let cached = defaults.data(forKey: Keys.child), let child = try? JSONDecoder().decode(KidChild.self, from: cached) {
            self.child = child
            familyName = defaults.string(forKey: Keys.familyName)
        }
        do {
            let status: DeviceStatus = try await api.get("/kid/device/status", auth: .device)
            saveChild(status.child, family: status.family.name)
            lockedUntil = status.lockedUntil
            phase = .locked
        } catch let error as APIError where error.status == 401 {
            clearPairing()
            welcomeNotice = "This iPhone was disconnected by a grown-up. Ask them for a new code."
            phase = .welcome
        } catch {
            // Offline: show the lock screen with the cached profile; unlock will retry.
            phase = child == nil ? .welcome : .locked
        }
        if phase == .locked, let code = pendingDeepLinkCode {
            pendingDeepLinkCode = nil
            deepLinkNeedsConfirmation = code
        }
    }

    // MARK: Pairing

    func pair(code: String) async throws {
        let cleaned = code.uppercased().filter { $0.isLetter || $0.isNumber }
        let response: PairResponse = try await api.post(
            "/kid/pair",
            body: PairRequest(code: cleaned, deviceName: UIDevice.current.name, platform: "ios"),
            auth: .none
        )
        clearPairing()
        Keychain.set(response.deviceToken, for: .deviceToken)
        api.deviceToken = response.deviceToken
        saveChild(response.child, family: response.family.name)
        welcomeNotice = nil
        lockedUntil = nil
        phase = .locked
    }

    /// A pairing link that arrived while this iPhone is already connected; needs confirmation.
    var deepLinkNeedsConfirmation: String?

    func handleOpenURL(_ url: URL) {
        guard url.scheme == "flexfundkids", url.host == "pair",
              let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "code" })?.value else { return }
        switch phase {
        case .locked, .unlocked:
            deepLinkNeedsConfirmation = code
        case .launching:
            pendingDeepLinkCode = code // picked up once launch finishes
        case .welcome:
            pendingDeepLinkCode = code
        }
    }

    func confirmDeepLink() {
        guard let code = deepLinkNeedsConfirmation else { return }
        deepLinkNeedsConfirmation = nil
        api.kidToken = nil
        data.reset()
        pendingDeepLinkCode = code
        phase = .welcome
    }

    // MARK: PIN

    func createPin(_ pin: String) async throws {
        let session: KidSession = try await api.post("/kid/device/pin", body: PinRequest(pin: pin), auth: .device)
        didUnlock(session, pin: pin)
    }

    func unlock(pin: String) async throws {
        do {
            let session: KidSession = try await api.post("/kid/device/unlock", body: PinRequest(pin: pin), auth: .device)
            lockedUntil = nil
            didUnlock(session, pin: pin)
        } catch let error as APIError {
            if error.code == "locked" { lockedUntil = error.lockedUntil }
            if error.status == 401, error.code != "wrong_pin" {
                clearPairing()
                welcomeNotice = "This iPhone was disconnected by a grown-up. Ask them for a new code."
                phase = .welcome
            }
            if error.code == "pin_not_set", let child {
                saveChild(KidChild(id: child.id, name: child.name, avatar: child.avatar, hasPin: false), family: nil)
            }
            throw error
        }
    }

    private func didUnlock(_ session: KidSession, pin: String) {
        api.kidToken = session.token
        saveChild(session.child.withPin(true), family: nil)
        if canUseBiometrics, !biometricsEnabled, !defaults.bool(forKey: Keys.biometricsOffered), !AppConfig.isUITesting {
            pinForBiometricOffer = pin
            offerBiometrics = true
        }
        withAnimation(.snappy) { phase = .unlocked }
    }

    // MARK: Face ID

    func acceptBiometricOffer() {
        defaults.set(true, forKey: Keys.biometricsOffered)
        if let pin = pinForBiometricOffer { enableBiometrics(pin: pin) }
        pinForBiometricOffer = nil
    }

    func declineBiometricOffer() {
        defaults.set(true, forKey: Keys.biometricsOffered)
        pinForBiometricOffer = nil
    }

    @discardableResult
    func enableBiometrics(pin: String) -> Bool {
        let ok = Keychain.setBiometricProtected(pin, for: .biometricPin)
        biometricsEnabled = ok
        return ok
    }

    func disableBiometrics() {
        Keychain.delete(.biometricPin)
        biometricsEnabled = false
    }

    /// Reads the PIN behind Face ID and unlocks. Returns false if the user cancels or it fails.
    func unlockWithBiometrics() async -> Bool {
        guard biometricsEnabled,
              let pin = await Keychain.getBiometricProtected(.biometricPin, reason: "Unlock FlexFund Kids") else { return false }
        do {
            try await unlock(pin: pin)
            return true
        } catch let error as APIError where error.code == "wrong_pin" {
            // The PIN was changed by a parent; stop using the stale one.
            disableBiometrics()
            return false
        } catch {
            return false
        }
    }

    // MARK: Lock / unlink

    func lock() async {
        let wasUnlocked = phase == .unlocked
        if wasUnlocked { let _: EmptyResponseOK? = try? await api.post("/kid/lock") }
        api.kidToken = nil
        showProfile = false
        data.reset()
        if child != nil { phase = .locked }
    }

    func unlink(email: String, password: String, code: String?) async throws {
        let _: EmptyResponseOK = try await api.post(
            "/kid/device/unlink",
            body: UnlinkRequest(email: email, password: password, code: code),
            auth: .device
        )
        clearPairing()
        welcomeNotice = "This iPhone is no longer connected."
        phase = .welcome
    }

    private func handleKidUnauthorized() async {
        guard phase == .unlocked else { return }
        api.kidToken = nil
        data.reset()
        do {
            let status: DeviceStatus = try await api.get("/kid/device/status", auth: .device)
            saveChild(status.child, family: status.family.name)
            phase = .locked
        } catch let error as APIError where error.status == 401 {
            clearPairing()
            welcomeNotice = "This iPhone was disconnected by a grown-up. Ask them for a new code."
            phase = .welcome
        } catch {
            phase = .locked
        }
    }

    // MARK: Scene

    func scenePhaseChanged(_ scenePhase: ScenePhase) {
        switch scenePhase {
        case .background:
            backgroundedAt = .now
        case .active:
            if let backgroundedAt, phase == .unlocked, Date.now.timeIntervalSince(backgroundedAt) > Self.autoLockAfter {
                Task { await lock() }
            } else if phase == .unlocked {
                refreshTick += 1
            }
            backgroundedAt = nil
        default:
            break
        }
    }
}

/// `{ ok: true }` responses.
struct EmptyResponseOK: Decodable {
    let ok: Bool?
}

private extension KidChild {
    func withPin(_ hasPin: Bool) -> KidChild {
        KidChild(id: id, name: name, avatar: avatar, hasPin: hasPin)
    }
}
