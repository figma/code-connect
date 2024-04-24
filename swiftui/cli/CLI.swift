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

struct Config: Codable {
    struct FigmaConnectConfig: Codable {
        let swift: SwiftConfig?
        let include: [String]?
        let exclude: [String]?
    }

    struct SwiftConfig: Codable {
        let importPaths: [String: String]?
    }

    let codeConnect: FigmaConnectConfig
}

@main
struct CLI: AsyncParsableCommand {
    static let configuration: CommandConfiguration = .init(
        commandName: "figma-swift",
        abstract: "A tool for integrating swift code with Figma",
        subcommands: [Connect.self]
    )
}

struct Connect: AsyncParsableCommand {
    static let configuration: CommandConfiguration = .init(
        commandName: "connect",
        abstract: "A CLI tool that allows you to connect code to figma.",
        subcommands: [Create.self, Publish.self, Parse.self, Unpublish.self]
    )

    struct Unpublish: AsyncParsableCommand {

        static let configuration: CommandConfiguration = .init(
            commandName: "unpublish",
            abstract: "Run to find any files that include structs conforming to `FigmaConnect` and unpublish them from Figma. " +
            "By default this looks for a config file named \"figma.config.json\", and uses the `include` and `exclude` fields to determine which files to parse. " +
            "If no config file is found, this parses the current directory. An optional `--dir` flag can be used to specify a directory to parse."
        )

        @Option(name: [.customLong("token"), .customShort("t")], help: "Figma API Token with write access to Code Connect.")
        public var accessToken: String?


        @Option(name: .shortAndLong, help: "Path to a configuration json file")
        public var configPath: String?

        @Option(name: .shortAndLong, help: "An optional directory of files. The default value for this is the current directory.")
        public var dir: String?

        public func run() async throws {
            guard let token = accessToken ?? ProcessInfo.processInfo.environment["FIGMA_ACCESS_TOKEN"] else {
                throw ValidationError("Code Connect requires a valid API key. Use the --access-token parameter to specify a valid API key or set the \"FIGMA_ACCESS_TOKEN\" environment variable.")
            }

            let config = try Connect.getConfigFromConfigPath(configPath: configPath)
            if config?.codeConnect.include != nil  && dir != nil {
                throw ValidationError("Could not resolve search paths since both a config file and directory were provided.")
            }
            let result = try parseCodeConnects(config: config, dir: dir)
            let codeConnectFiles = result.codeConnectFiles
            guard codeConnectFiles.count > 0 else {
                print("No code connect files found")
                return
            }

            print("Deleting \(codeConnectFiles.count) Code Connection(s). \(result.errors) connection(s) failed to parse.")


            try await CodeConnectUnpublisher.deleteFigmaConnectFiles(docs: result.codeConnectFiles, token: token)
            let codeConnectLogStatements = codeConnectFiles.map({ codeConnect in
                return codeConnect.infoLabel()
            }).joined(separator: "\n")
            print("Successfully deleted:\n\(codeConnectLogStatements)")

        }
    }

    struct Publish: AsyncParsableCommand {
        static let configuration: CommandConfiguration = .init(
            commandName: "publish",
            abstract: "Run to find any files that include structs conforming to `FigmaConnect`. " +
            "By default this looks for a config file named \"figma.config.json\", and uses the `include` and `exclude` fields to determine which files to parse. " +
            "If no config file is found, this parses the current directory. An optional `--dir` flag can be used to specify a directory to parse."
        )

        @Option(name: [.customLong("access-token"), .customShort("t")], help: "Figma API Token with write access to Code Connect.")
        public var accessToken: String?

        @Option(name: .shortAndLong, help: "Path to a configuration json file")
        public var configPath: String?

        @Option(name: .shortAndLong, help: "An optional directory of files. The default value for this is the current directory.")
        public var dir: String?

        @Flag(name: .customLong("skip-validation"), help: "Skip validation of code connect files.")
        public var skipValidation: Bool = false

        @Flag(name: .customLong("dry-run"), help: "Performs a dry run of publishing, returning errors if any exist but does not publish your connected components.")
        public var dryRun: Bool = false

        public func run() async throws {
            guard let token = accessToken ?? ProcessInfo.processInfo.environment["FIGMA_ACCESS_TOKEN"] else {
                throw ValidationError("Code Connect requires a valid API key. Use the --token parameter to specify a valid API key or set the \"FIGMA_ACCESS_TOKEN\" environment variable.")
            }
            let config = try Connect.getConfigFromConfigPath(configPath: configPath)
            guard config?.codeConnect.include == nil || dir == nil else {
                throw ValidationError("Couldn't resolve which paths should be searched in since both a config file with include and directory were provided")
            }
            let result = try parseCodeConnects(config: config, dir: dir)

            let codeConnectFiles = result.codeConnectFiles

            guard codeConnectFiles.count > 0 else {
                print("No code connect files found")
                return
            }

            print("Parsed \(codeConnectFiles.count) Code Connection(s). \(result.errors) connection(s) failed to parse.")

            if !skipValidation {
                print("Validating code connect files.")
                guard try await Validation.validateCodeConnectFiles(result.codeConnectFiles, token: token) else {
                    return
                }
            }
            
            let codeConnectLogStatements = codeConnectFiles.map({ codeConnect in
                return codeConnect.infoLabel()
            }).joined(separator: "\n")

            if dryRun {
                print ("Succesfully validated:\n\(codeConnectLogStatements)")
                return
            }

            try await CodeConnectUploader.uploadFigmaConnectFiles(docs: codeConnectFiles, token: token)

            print("Successfully published:\n\(codeConnectLogStatements)")
        }
    }

    struct Create: AsyncParsableCommand {
        static var configuration = CommandConfiguration(
            commandName: "create",
            abstract: "Create a new Code Connect file for a component in Figma."
        )

        @Argument
        public var nodeUrl: String

        @Option(name: [.customLong("access-token"), .customShort("t")], help: "Figma API Token with write access to Code Connect.")
        public var accessToken: String?

        @Option(name: .shortAndLong, help: "Output figmadoc file")
        public var output: String?

        public func run() async throws {
            guard let token = accessToken ?? ProcessInfo.processInfo.environment["FIGMA_ACCESS_TOKEN"] else {
                throw ValidationError("Code Connect requires a valid API key. Use the --access-token parameter to specify a valid API key or set the \"FIGMA_ACCESS_TOKEN\" environment variable.")
            }
            try await CodeConnectCreator.createCodeConnect(url: nodeUrl, token: token, output: output)
        }
    }

    struct Parse: AsyncParsableCommand {
        static var configuration = CommandConfiguration(
            commandName: "parse",
            abstract: "Parses code connect files and outputs to stdout or a file."
        )

        @Option(name: .shortAndLong, help: "Path to a configuration json file")
        public var configPath: String?

        @Option(name: .shortAndLong, help: "Output file to write the resulting JSON to")
        public var out: String?

        @Option(name: .shortAndLong, help: "An optional directory of files. The default value for this is the current directory.")
        public var dir: String?

        @Flag(name: .customLong("use-js-templates"), help: "Whether or not this should use the updated JS templates")
        public var useJsTemplates: Bool = false

        public func run() async throws {
            let config = try Connect.getConfigFromConfigPath(configPath: configPath)
            if config?.codeConnect.include != nil  && dir != nil {
                throw ValidationError("Couldn't resolve which paths should be searched in since both a config file with include and directory were provided")
            }
            let result = try parseCodeConnects(config: config, dir: dir)
            let codeConnectFiles = result.codeConnectFiles
            guard codeConnectFiles.count > 0 else {
                print("No code connect files found")
                return
            }

            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            let data = try encoder.encode(codeConnectFiles)
            guard let jsonString = String(data: data, encoding: .utf8) else {
                throw FigmaConnectError("Failed to parse a code connection from the given files")
            }
            print("Parsed \(codeConnectFiles.count) Code Connection(s). \(result.errors) connection(s) failed to parse.")
            print(jsonString)
            if let out {
                FileManager.default.createFile(atPath: out, contents: data)
            }
        }
    }

    static func parseCodeConnects(config: Config?, dir: String?) throws -> CodeConnectParserResult {
        var codeConnectSearchPaths: [URL]
        if let config, config.codeConnect.include != nil {
            codeConnectSearchPaths = Connect.getSearchPathsFromConfig(config: config)
        } else {
            let dir = dir ?? FileManager.default.currentDirectoryPath
            codeConnectSearchPaths = Connect.listFilesInDirectory(URL(fileURLWithPath: dir), withSuffix: ".swift")
        }

        let currentPath = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let gitRemoteUrl = try? getGitRemoteUrl(repoPath: currentPath)
        // Find all figmadoc conforming components
        return CodeConnectParser.createCodeConnects(
            codeConnectSearchPaths,
            importMapping: config?.codeConnect.swift?.importPaths ?? [:],
            sourceControlPath: gitRemoteUrl
        )
    }

    static func getConfigFromConfigPath(configPath: String?) throws -> Config? {
        if let configPath {
            if !FileManager.default.fileExists(atPath: configPath) {
                throw ValidationError("A configuration file was not found at \(configPath)")
            }
            do {
                return try JSONDecoder().decode(Config.self, from: Data(contentsOf: URL(fileURLWithPath: configPath)))
            } catch {
                throw ValidationError("Config file had incorrect format")
            }
        } else {
            let defaultPath = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true).appendingPathComponent("codeconnect.config.json")
            if FileManager.default.fileExists(atPath: defaultPath.path) {
                print("Using config file found at \(defaultPath.path)")
                do {
                    return try JSONDecoder().decode(Config.self, from: Data(contentsOf: defaultPath))
                } catch {
                    throw ValidationError("Config file had incorrect format")
                }

            }
        }
        return nil
    }

    static func getSearchPathsFromConfig(config: Config) -> [URL] {
        let includedFiles = CodeConnectParser.getFilesMatching(config.codeConnect.include ?? ["*"])
        let excludedFiles = (config.codeConnect.exclude != nil)
        ? CodeConnectParser.getFilesMatching(config.codeConnect.exclude!)
            : []

        return Array(Set(includedFiles).subtracting(Set(excludedFiles)).compactMap { URL(fileURLWithPath: $0) })
    }

    static func listFilesInDirectory(_ directoryURL: URL, withSuffix suffix: String) -> [URL] {
        var elements: [URL] = []

        do {
            let contents = try FileManager.default.contentsOfDirectory(at: directoryURL, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])

            for fileURL in contents {
                if fileURL.isDirectory {
                    elements.append(contentsOf: listFilesInDirectory(fileURL, withSuffix: suffix))
                }
                if fileURL.absoluteString.hasSuffix(suffix) {
                    elements.append(fileURL)
                }
            }
            return elements
        } catch {
            writeError(error.localizedDescription)
            // TODO: log an error here
            return []
        }
    }
}

private func getGitRemoteUrl(repoPath: URL) throws -> String? {
    let url = try shell(command: "git config --get remote.origin.url", directoryUrl: repoPath)
    guard let url else { return nil }
    return url.trimmingCharacters(in: .whitespaces)
}
#endif
