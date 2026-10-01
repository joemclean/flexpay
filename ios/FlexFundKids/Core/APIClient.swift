import Foundation

/// A server-reported error. `message` is always safe to show to the user.
struct APIError: LocalizedError, Equatable {
    let status: Int
    let code: String
    let message: String
    var attemptsRemaining: Int?
    var lockedUntil: Date?
    var availableCents: Int?

    var errorDescription: String? { message }

    static let offline = APIError(
        status: 0, code: "offline",
        message: "Can’t reach FlexFund right now. Check your internet connection and try again."
    )
}

private struct ErrorEnvelope: Decodable {
    struct Body: Decodable {
        let code: String
        let message: String
        let attemptsRemaining: Int?
        let lockedUntil: Date?
        let availableCents: Int?
    }
    let error: Body
}

struct EmptyResponse: Decodable {}

/// Thin async/await client for the Family Account API (see docs/API.md).
@MainActor
final class APIClient {
    enum Auth { case none, device, kid }

    var baseURL: URL
    var deviceToken: String?
    var kidToken: String?
    /// Called when a kid-session request is rejected (expired session or revoked device).
    var onKidUnauthorized: (() -> Void)?

    private let session: URLSession
    private let encoder = JSONEncoder()
    let decoder: JSONDecoder

    init(baseURL: URL = AppConfig.apiBaseURL) {
        self.baseURL = baseURL
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 15
        configuration.waitsForConnectivity = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration)
        decoder = APIClient.makeDecoder()
    }

    nonisolated static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = ISO8601.withFraction.date(from: raw) ?? ISO8601.plain.date(from: raw) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date \(raw)")
        }
        return decoder
    }

    func get<T: Decodable>(_ path: String, auth: Auth = .kid) async throws -> T {
        try await send("GET", path, body: nil, auth: auth)
    }

    func post<T: Decodable>(_ path: String, auth: Auth = .kid) async throws -> T {
        try await send("POST", path, body: nil, auth: auth)
    }

    func post<T: Decodable, Body: Encodable>(_ path: String, body: Body, auth: Auth = .kid) async throws -> T {
        try await send("POST", path, body: try encoder.encode(body), auth: auth)
    }

    private func send<T: Decodable>(_ method: String, _ path: String, body: Data?, auth: Auth) async throws -> T {
        guard let url = URL(string: baseURL.absoluteString + path) else { throw APIError.offline }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        switch auth {
        case .none: break
        case .device: if let deviceToken { request.setValue("Bearer \(deviceToken)", forHTTPHeaderField: "Authorization") }
        case .kid: if let kidToken { request.setValue("Bearer \(kidToken)", forHTTPHeaderField: "Authorization") }
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw APIError.offline
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.offline }

        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? decoder.decode(ErrorEnvelope.self, from: data)
            let error = APIError(
                status: http.statusCode,
                code: envelope?.error.code ?? "http_\(http.statusCode)",
                message: envelope?.error.message ?? "Something went wrong. Please try again.",
                attemptsRemaining: envelope?.error.attemptsRemaining,
                lockedUntil: envelope?.error.lockedUntil,
                availableCents: envelope?.error.availableCents
            )
            if http.statusCode == 401, auth == .kid { onKidUnauthorized?() }
            throw error
        }
        if T.self == EmptyResponse.self, data.isEmpty { return EmptyResponse() as! T }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            #if DEBUG
            print("Decoding \(T.self) from \(path) failed: \(error)")
            #endif
            throw APIError(status: http.statusCode, code: "decoding", message: "The app got an unexpected answer from FlexFund. Please update the app.")
        }
    }
}

enum ISO8601 {
    static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}

extension Error {
    /// A friendly message for any error, preferring the server's wording.
    var userMessage: String {
        if let api = self as? APIError { return api.message }
        return "Something went wrong. Please try again."
    }
}
