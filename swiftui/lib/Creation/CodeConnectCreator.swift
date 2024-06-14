#if os(macOS)
import Foundation
import SwiftFormat
import SwiftSyntax
import SwiftSyntaxBuilder

enum CodeConnectCreationError: LocalizedError {
    case unknown
    case invalidFigmaNodeUrl
    case noFigmaNodesInUrl
    case noDocumentInFile
    case nodeIsNotComponentOrComponentSet(node: String)
    case nodeHasNoName(node: String)
    case networkRequestFailed(errorCode: Int, description: String?)
    case serverReturnedInvalidFormat
    case couldntCreateFile(path: String)
    case failedToCreateCodeConnectFile(node: String)

    var errorDescription: String? {
        switch self {
        case .unknown:
            return "An unknown error has ocurred"
        case .invalidFigmaNodeUrl:
            return "The URL provided was invalid -- The URL should be a link to a Figma node in design mode"
        case .noFigmaNodesInUrl:
            return "The URL provided did not point to a specific component node to connect to."
        case .noDocumentInFile:
            return "No document was found in the figma file"
        case .nodeIsNotComponentOrComponentSet(let node):
            return "Node \(node) is not a component or component set"
        case .nodeHasNoName(let node):
            return "Node \(node) has no name"
        case .networkRequestFailed(let errorCode, let description):
            return "Failed to retrieve the file from Figma -- Received a \(errorCode) status code \(description ?? "")"
        case .serverReturnedInvalidFormat:
            return "The file requested from the url could not be read."
        case .couldntCreateFile(let path):
            return "Failed to create a file at \(path)"
        case .failedToCreateCodeConnectFile(let node):
            return "Failed to create the code connect file from \(node)"
        }
    }
}

extension String {
    // Changes component names to a single PascalCase word stripping out starting numbers
    func normalizeComponentName() -> String {
        self.replacingOccurrences(of: "[^a-zA-Z0-9]", with: " ", options: .regularExpression)
            .split(separator: " ")
            .map { word in
                word.prefix(1).uppercased() + word.dropFirst()
            }
            .joined()
            .replacingOccurrences(of: "^[0-9]", with: "_$0", options: .regularExpression)
    }

    // Remove the identifiers appended to property names and
    func normalizingPropName() -> String {
        return self.replacingOccurrences(of: "#[0-9:]*", with: "", options: .regularExpression)
    }

    // Remove the numbers appended to property values and convert to camelCase
    func normalizingPropValue() -> String {
        let name = self.replacingOccurrences(of: "#[0-9:]*", with: "", options: .regularExpression).replacingOccurrences(of: "[^a-zA-Z0-9]", with: " ", options: .regularExpression)
            .split(separator: " ")
            .map { word in
                word.prefix(1).uppercased() + word.dropFirst()
            }
            .joined()
            .replacingOccurrences(of: "^[0-9]", with: "_$0", options: .regularExpression)
        var lowercased = name.prefix(1).lowercased() + name.dropFirst()
        if lowercased.isSwiftKeyword {
            lowercased = "_" + lowercased
        }
        return lowercased
    }
}

public struct CodeConnectCreator {
    // Takes a URL pointing to a node and generate the code connect for the given node.
    public static func createCodeConnect(url: String, token: String, output: String?) async throws {
        guard let nodeId = try? Validation.parseNodeId(from: url),
              let fileKey = try? Validation.parseFileKey(from: url),
              let url = URL(string: url)
        else {
            throw CodeConnectCreationError.invalidFigmaNodeUrl
        }

        guard let request = try FigmaAPIRoute.files(fileKey: fileKey, nodeIds: [nodeId]).createFigmaAPIRequest(token: token, nodeUrl: url, body: nil) else {
            throw CodeConnectCreationError.unknown
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else { throw CodeConnectCreationError.unknown }
        guard httpResponse.statusCode == 200 else {
            let description = String(data: data, encoding: .utf8)
            throw CodeConnectCreationError.networkRequestFailed(errorCode: httpResponse.statusCode, description: description)
        }

        guard let figmaFile = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
            throw CodeConnectCreationError.serverReturnedInvalidFormat
        }

        // Verify that a document exists and then find components corresponding to nodeIds
        guard let document = figmaFile["document"] as? [String: Any] else { throw CodeConnectCreationError.noDocumentInFile }
        guard let component = try findComponentsInDocument(document: document, nodeIds: [nodeId]).first else { return }

        // Convert components to code connect files
        let codeConnect = try convertComponentToCodeConnectFile(component, url: url.absoluteString)
        var outputFile: URL
        if let output {
            let outputUrl = URL(fileURLWithPath: output)
            if outputUrl.isDirectory {
                outputFile = outputUrl.appendingPathComponent("\(component.name).figma.swift")
            } else {
                outputFile = outputUrl
            }
        } else {
            outputFile = URL(fileURLWithPath: "\(component.name).figma.swift")
        }
        guard let fileData = codeConnect.formatted().description.data(using: .utf8) else {
            throw CodeConnectCreationError.failedToCreateCodeConnectFile(node: url.path)
        }

        let outputDir = outputFile.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: outputDir.path) {
            do {
                try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
            } catch {
                throw CodeConnectCreationError.couldntCreateFile(path: outputFile.path)
            }
        }

        if FileManager.default.createFile(atPath: outputFile.path, contents: fileData) {
            print("Created Code Connect file at \(outputFile.path)")
        } else {
            throw CodeConnectCreationError.couldntCreateFile(path: outputFile.path)
        }
    }

    // MARK: - Private

    static func convertComponentToCodeConnectFile(_ component: Component, url: String) throws -> SourceFileSyntax {
        let componentName = component.name.normalizeComponentName()

        // Struct definition with the CodeConnect struct
        let structDecl = try StructDeclSyntax(
            name: "\(raw: componentName)_doc",
            inheritanceClause: InheritanceClauseSyntax {
                InheritedTypeSyntax(type: IdentifierTypeSyntax(name: "FigmaConnect"))
            }
        ) {
            // Component definition
            try VariableDeclSyntax("let component = \(raw: componentName).self")

            // Node URL definition
            try VariableDeclSyntax("let figmaNodeUrl = \"\(raw: url)\"").with(\.trailingTrivia, .newlines(2))

            if let properties = component.componentProperties {
                // Variable definitions
                for (i, (name, property)) in properties.sorted(by: { c1, c2 in
                    c1.key < c2.key
                }).enumerated() {
                    let varDecl = VariableDeclSyntax(
                        leadingTrivia: [],
                        // Add the @FigmaProp property wrapper
                        attributes: AttributeListSyntax {
                            .attribute(
                                AttributeSyntax(
                                    "FigmaProp",
                                    argumentList: {
                                        LabeledExprSyntax(expression: StringLiteralExprSyntax(content: name.normalizingPropName()))
                                        if case .variant = property.type, let options = property.variantOptions {
                                            // Mapping dictionary
                                            LabeledExprSyntax(
                                                label: "mapping",
                                                expression: DictionaryExprSyntax {
                                                    for option in options {
                                                        DictionaryElementSyntax(
                                                            key: StringLiteralExprSyntax(content: option),
                                                            value: ExprSyntax(stringLiteral: "\(option.normalizingPropValue())")
                                                        )
                                                    }
                                                }
                                            )
                                        }
                                    }
                                )
                            )
                        }.with(\.trailingTrivia, .newline),
                        modifiers: [],
                        bindingSpecifier: .keyword(.var)
                    ) {
                        // Add the default value if it exists
                        PatternBindingSyntax(
                            pattern: PatternSyntax("\(raw: name.normalizingPropValue())"),
                            typeAnnotation: property.type.swiftTypeSpecifier,
                            initializer: property.defaultValueExpr() != nil ? InitializerClauseSyntax(value: property.defaultValueExpr()!) : nil
                        )
                    }
                    if i == 0 {
                        varDecl.with(\.leadingTrivia, Trivia(pieces: [
                            .blockComment("/*"),
                            .newlines(1),
                            .blockComment("Use @FigmaProp property wrappers to connect Figma properties to code"),
                            .newlines(2),
                        ])).with(\.trailingTrivia, .newlines(2))
                    } else if i == properties.count - 1 {
                        varDecl.with(\.trailingTrivia, Trivia(pieces: [
                            .newlines(1),
                            .lineComment("*/"),
                            .newlines(2),
                        ]))
                    } else {
                        varDecl.with(\.trailingTrivia, .newlines(2))
                    }
                }

                // Create example code definition
                DeclSyntax("""
                var body: some View {
                // Add your code example here by returning a View
                \(raw: componentName)()
                }
                """)
            }
        }
        // Create the source file
        return try SourceFileSyntax {
            try ImportDeclSyntax("import Figma").with(\.trailingTrivia, .newlines(2))
            structDecl
        }
    }

    static func findComponentsInDocument(document: [String: Any], nodeIds: [String]) throws -> [Component] {
        var stack: [[String: Any]] = [document]
        var components: [Component] = []

        let decoder = JSONDecoder()
        // DFS for all components in a document, looking for nodes that match `nodeIds`
        while stack.count > 0 {
            guard let current = stack.popLast() else { continue }
            if let children = current["children"] as? [[String: Any]] {
                stack.append(contentsOf: children)
            }
            guard let id = current["id"] as? String, nodeIds.contains(id) else {
                continue
            }

            // In order to create a code connection the node must be a component or component set
            guard let type = current["type"] as? String,
                  type == "COMPONENT" || type == "COMPONENT_SET"
            else {
                throw CodeConnectCreationError.nodeIsNotComponentOrComponentSet(node: id)
            }

            guard current["name"] as? String != nil else {
                throw CodeConnectCreationError.nodeHasNoName(node: id)
            }
            // Turn current into a Component
            let jsonData = try JSONSerialization.data(withJSONObject: current, options: .fragmentsAllowed)

            let component: Component = try decoder.decode(Component.self, from: jsonData)
            components.append(component)
        }
        return components
    }
}
#endif
