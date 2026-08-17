import Foundation

enum WatchAPIError: LocalizedError {
    case invalidURL(String)
    case missingResponse
    case server(status: Int, message: String)
    case missingSessionToken
    case missingUserId
    case missingUpdatedMatch

    var errorDescription: String? {
        switch self {
        case .invalidURL(let path):
            return "Invalid API URL: \(path)"
        case .missingResponse:
            return "The server did not return a response."
        case .server(_, let message):
            return message
        case .missingSessionToken:
            return "Sign in did not return a session token."
        case .missingUserId:
            return "Sign in did not return a user id."
        case .missingUpdatedMatch:
            return "The server did not return the updated match."
        }
    }
}

final class WatchAPIClient {
    private let tokenStore: WatchTokenStore
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let baseURL: String

    init(tokenStore: WatchTokenStore, session: URLSession = .shared) {
        self.tokenStore = tokenStore
        self.session = session
        self.baseURL = WatchAPIClient.resolveBaseURL()
    }

    func get<Response: Decodable>(_ path: String) async throws -> Response {
        try await request(path: path, method: "GET", body: nil)
    }

    func post<Body: Encodable, Response: Decodable>(_ path: String, body: Body) async throws -> Response {
        try await request(path: path, method: "POST", body: encoder.encode(body))
    }

    func patchJSON<Response: Decodable>(_ path: String, object: [String: Any]) async throws -> Response {
        let data = try JSONSerialization.data(withJSONObject: object, options: [])
        return try await request(path: path, method: "PATCH", body: data)
    }

    private func request<Response: Decodable>(path: String, method: String, body: Data?) async throws -> Response {
        guard let url = URL(string: "\(baseURL.trimmedSlash)/\(path.trimmedLeadingSlash)") else {
            throw WatchAPIError.invalidURL(path)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let token = tokenStore.token
        if !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw WatchAPIError.missingResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw WatchAPIError.server(
                status: httpResponse.statusCode,
                message: Self.errorMessage(from: data) ?? "Request failed with HTTP \(httpResponse.statusCode)"
            )
        }
        return try decoder.decode(Response.self, from: data)
    }

    private static func errorMessage(from data: Data) -> String? {
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let error = object["error"] as? String,
           !error.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return error
        }
        let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return text?.isEmpty == false ? text : nil
    }

    private static func resolveBaseURL() -> String {
        let local = secret("mvpApiBaseUrl")?.trimmedSlash ?? "http://localhost:3000"
        let remote = secret("mvpApiBaseUrlRemote")?.trimmedSlash
        #if targetEnvironment(simulator)
        return local
        #else
        return remote?.isEmpty == false ? remote! : local
        #endif
    }

    private static func secret(_ key: String) -> String? {
        guard let url = Bundle.main.url(forResource: "Secrets", withExtension: "plist"),
              let data = try? Data(contentsOf: url),
              let object = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] else {
            return nil
        }
        return (object[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private extension String {
    var trimmedSlash: String {
        trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    var trimmedLeadingSlash: String {
        var value = self
        while value.first == "/" {
            value.removeFirst()
        }
        return value
    }
}
