#if os(macOS)
import Foundation

public protocol APIRouting {
    var scheme: String { get }
    var path: String { get }
    var method: String { get }
    var apiURL: String { get }
    var queryItems: [URLQueryItem] { get }

    func createApiUrl(nodeUrl: URL) -> URL?
    func createFigmaAPIRequest(token: String, nodeUrl: URL, body: Data?) throws -> URLRequest?
}

public extension APIRouting {
    func createApiUrl(nodeUrl: URL) -> URL? {
        var components = URLComponents()
        components.path = apiURL
        components.scheme = scheme
        components.queryItems = queryItems
        return components.url
    }

    func createFigmaAPIRequest(
        token: String,
        nodeUrl: URL,
        body: Data?
    ) throws -> URLRequest? {
        guard let url = createApiUrl(nodeUrl: nodeUrl) else {
            return nil
        }
        var request = URLRequest(url: url)
        request.httpBody = body
        request.setValue(token, forHTTPHeaderField: "X-Figma-Token")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpMethod = method

        return request
    }
}

public enum FigmaAPIRoute: APIRouting {
    case codeConnect
    case files(fileKey: String, nodeIds: [String])
    case unpublish
    case nodes(fileKey: String, nodeIds: [String])

    public var scheme: String { "https" }

    public var path: String {
        switch self {
        case .files(let fileKey, _):
            return "/v1/files/\(fileKey)"
        case .codeConnect:
            return "/v1/code_connect"
        case .unpublish:
            return "/v1/code_connect"
        case .nodes(let fileKey, _):
            return "/v1/files/\(fileKey)/nodes"
        }
    }

    public var apiURL: String {
        return "api.figma.com" + path
    }

    public var method: String {
        switch self {
        case .files, .nodes:
            return "GET"
        case .codeConnect:
            return "POST"
        case .unpublish:
            return "DELETE"
        }
    }

    public var queryItems: [URLQueryItem] {
        switch self {
        case .codeConnect:
            return []
        case .files(_, let nodeIds), .nodes(_, let nodeIds):
            return [
                URLQueryItem(name: "ids", value: nodeIds.joined(separator: ","))
            ]
        case .unpublish:
            return []
        }
    }
}
#endif
