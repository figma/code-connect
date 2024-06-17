#if os(macOS)
import ArgumentParser
import CodeConnectParser
import Foundation

struct FigmaConnectError: LocalizedError {
    public internal(set) var message: String

    public init(_ message: String) {
        self.message = message
    }

    var errorDescription: String? {
        message
    }
}

struct Config: Decodable {
    let importPaths: [String: String]?
    let include: [String]?
    let exclude: [String]?
}

enum RequestMode: String, Decodable {
    case create = "CREATE"
    case publish = "PUBLISH"
    case parse = "PARSE"
}

struct Request: Decodable {
    var mode: RequestMode
}

struct ParseRequest: Decodable {
    var mode: String
    var config: Config
    var paths: [String]
}

struct CreateRequest: Decodable {
    var mode: String
    var config: Config
    var destinationDir: String
    var destinationFile: String?
    var component: Component
}

@main
struct CLI: AsyncParsableCommand {
    func run() throws {
        var jsonString = ""
        while let line = readLine() {
            jsonString += line
        }

        guard let jsonData = jsonString.data(using: .utf8) else {
            throw ValidationError("Error parsing request JSON")
        }


        let decoder = JSONDecoder()
        let request: Request = try decoder.decode(Request.self, from: jsonData)

        switch request.mode {
        case .parse:
            let parseRequest = try decoder.decode(ParseRequest.self, from: jsonData)

            let result = CodeConnectParser.createCodeConnects(
                parseRequest.paths.map { URL(fileURLWithPath: $0) },
                importMapping: parseRequest.config.importPaths ?? [:]
            )

            try writeResultToStdout(result)

        case .create:
            let createRequest = try decoder.decode(CreateRequest.self, from: jsonData)

            let result = CodeConnectCreator.createCodeConnect(component: createRequest.component, output: createRequest.destinationDir)

            try writeResultToStdout(result)

        default:
            throw ValidationError("Mode '\(request.mode)' not supported")
        }
    }
}

func logError(_ error: String) {
    if let data = error.data(using: .utf8) {
        FileHandle.standardError.write(data)
    }
}

func writeResultToStdout(_ result: Encodable) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    let jsonData = try encoder.encode(result)

    if let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    }
}


private func getGitRemoteUrl(repoPath: URL) throws -> String? {
    let url = try shell(command: "git config --get remote.origin.url", directoryUrl: repoPath)
    guard let url else { return nil }
    return url.trimmingCharacters(in: .whitespaces)
}
#endif
