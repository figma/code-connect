#if os(macOS)
import Foundation
import CodeConnectParser

enum UnpublishErrors: LocalizedError {
    case unknown
    case noValidCodeConnections
    case invalidTokenError
    case networkError(errorCode: Int, description: String)
    case failedToResolveUrl(url: String)

    var errorDescription: String? {
        switch self {
        case .unknown:
            return "An unknown error occurred while attempting to delete code connections."
        case .noValidCodeConnections:
            return "Could not find a valid code connection to delete."
        case .invalidTokenError:
            return "Failed to delete the code connections from Figma -- Check to see that your token has write permissions for dev resources."
        case .networkError(let errorCode, let description):
            return "Failed to delete the code connections from Figma -- Received a \(errorCode) status code: \(description)"
        case .failedToResolveUrl(let url):
            return "Failed to resolve the Figma URL with base domain \(url)"
        }
    }
}

public struct CodeConnectUnpublisher {
    struct UnpublishBody: Encodable {
        enum CodingKeys: String, CodingKey {
            case nodesToDelete = "nodes_to_delete"
        }
        struct DeleteInfo: Encodable {
            let figmaNode: String
            let label: String = "SwiftUI"
        }
        let nodesToDelete: [DeleteInfo]
    }

    static func deleteFigmaConnectFiles(
        docs: [CodeConnectRequestBody],
        token: String
    ) async throws {
        guard let validDoc = docs.first(where: { URL(string: $0.figmaNode) != nil}),
                let nodeUrl = URL(string: validDoc.figmaNode) else {
            throw UnpublishErrors.noValidCodeConnections
        }
        let unpublishBody = UnpublishBody(nodesToDelete: docs.map({ codeConnect in
            UnpublishBody.DeleteInfo(figmaNode: codeConnect.figmaNode)
        }))

        let encodedBody = try JSONEncoder().encode(unpublishBody)
        guard let request = try FigmaAPIRoute.unpublish.createFigmaAPIRequest(token: token, nodeUrl: nodeUrl, body: encodedBody) else {
            throw UnpublishErrors.unknown
        }
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResonse = response as? HTTPURLResponse else { throw UnpublishErrors.unknown }
        guard httpResonse.statusCode != 200 else { return }
        if httpResonse.statusCode == 403 {
            throw UnpublishErrors.invalidTokenError
        } else {
            throw UnpublishErrors.networkError(errorCode: httpResonse.statusCode, description: httpResonse.description)
        }
    }
}

#endif
