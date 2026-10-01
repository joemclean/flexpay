import Foundation

enum AppConfig {
    static let defaultAPIBaseURL = "http://localhost:8787/api/v1"
    private static let overrideKey = "apiBaseURLOverride"

    /// Launched by UI tests: start from a clean slate and skip animations.
    static var isUITesting: Bool {
        ProcessInfo.processInfo.arguments.contains("-uiTesting")
    }

    /// Resolution order: FLEXFUND_API_URL (env or launch argument) → DEBUG override → default.
    static var apiBaseURL: URL {
        let env = ProcessInfo.processInfo.environment["FLEXFUND_API_URL"]
            ?? UserDefaults.standard.string(forKey: "FLEXFUND_API_URL") // `-FLEXFUND_API_URL <url>` launch argument
        let candidates = [env, debugOverride, defaultAPIBaseURL]
        for candidate in candidates {
            if let value = candidate?.trimmingCharacters(in: .whitespaces), !value.isEmpty,
               let url = URL(string: value), url.scheme?.hasPrefix("http") == true {
                return url
            }
        }
        return URL(string: defaultAPIBaseURL)!
    }

    static var debugOverride: String? {
        get { UserDefaults.standard.string(forKey: overrideKey) }
        set { UserDefaults.standard.set(newValue, forKey: overrideKey) }
    }

    static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
}
