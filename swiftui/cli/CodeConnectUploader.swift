#if os(macOS)
import Foundation
import CodeConnectParser

enum UploadErrors: LocalizedError {
    case unknown
    case noValidCodeConnections
    case invalidTokenError
    case networkError(errorCode: Int, description: String)
    case failedToResolveUrl(url: String)

    var errorDescription: String? {
        switch self {
        case .unknown:
            return "An unknown error occurred while attempting to upload to the server"
        case .noValidCodeConnections:
            return "Could not find a valid code connection to publish."
        case .invalidTokenError:
            return "Failed to upload the documents to Figma -- Check to see that your token has write permissions for dev resources."
        case .networkError(let errorCode, let description):
            return "Failed to upload the documents to Figma -- Received a \(errorCode) status code: \(description)"
        case .failedToResolveUrl(let url):
            return "Failed to resolve the Figma URL with base domain \(url)"
        }
    }
}

public struct CodeConnectUploader {
    static func uploadFigmaConnectFiles(
        docs: [CodeConnectRequestBody],
        token: String
    ) async throws {
        guard let validDoc = docs.first(where: { URL(string: $0.figmaNode) != nil}),
                let nodeUrl = URL(string: validDoc.figmaNode) else {
            throw UploadErrors.noValidCodeConnections
        }
        let encodedDocs = try JSONEncoder().encode(docs)
        guard let request = try FigmaAPIRoute.codeConnect.createFigmaAPIRequest(token: token, nodeUrl: nodeUrl, body: encodedDocs) else {
            throw UploadErrors.unknown
        }
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResonse = response as? HTTPURLResponse else { throw UploadErrors.unknown }
        guard httpResonse.statusCode != 200 else { return }
        if httpResonse.statusCode == 403 {
            throw UploadErrors.invalidTokenError
        } else {
            throw UploadErrors.networkError(errorCode: httpResonse.statusCode, description: httpResonse.description)
        }
    }
}

#endif
