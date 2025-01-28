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
    func transformToPascalCase() -> String {
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

public struct CodeConnectCreatorCreatedFile: Encodable {
    public var filePath: String
}

public struct CodeConnectCreatorResult: Encodable {
    public var createdFiles: [CodeConnectCreatorCreatedFile]
    public var messages: [ParserResultMessage]
}

public struct CodeConnectCreator {
    // Takes a URL pointing to a node and generate the code connect for the given node.
    public static func createCodeConnect(component: Component, output: String?) -> CodeConnectCreatorResult {
        // Convert components to code connect files
        var createdFiles: [CodeConnectCreatorCreatedFile] = []
        var messages: [ParserResultMessage] = []

        do {
            guard let url = URL(string: component.figmaNodeUrl) else {
                throw CodeConnectCreationError.invalidFigmaNodeUrl
            }

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
                createdFiles.append(CodeConnectCreatorCreatedFile(filePath: outputFile.path))
            } else {
                throw CodeConnectCreationError.couldntCreateFile(path: outputFile.path)
            }
        } catch {
            messages.append(ParserResultMessage(level: .error, message: error.localizedDescription))
        }

        return CodeConnectCreatorResult(createdFiles: createdFiles, messages: messages)
    }

    // MARK: - Private

    static func attributeSyntaxForProperty(_ property: ComponentProperty, name: String) -> AttributeSyntax {
        AttributeSyntax(
            TypeSyntax(stringLiteral: property.type.correspondingAnnotationName),
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
                                    value: MemberAccessExprSyntax(name: "\(raw: option.normalizingPropValue())")
                                )
                            }
                        }
                    )
                }
            }
        )
    }

    static func convertComponentToCodeConnectFile(_ component: Component, url: String) throws -> SourceFileSyntax {
        let componentName = component.name.transformToPascalCase()

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
                            .attribute(self.attributeSyntaxForProperty(property, name: name))
                        }.with(\.trailingTrivia, .newline),
                        modifiers: [],
                        bindingSpecifier: .keyword(.var)
                    ) {
                        // Add the default value if it exists
                        PatternBindingSyntax(
                            pattern: PatternSyntax("\(raw: name.normalizingPropValue())"),
                            typeAnnotation: property.type.swiftTypeSpecifier(component: component.name, property: name),
                            initializer: property.defaultValueExpr() != nil ? InitializerClauseSyntax(value: property.defaultValueExpr()!) : nil
                        )
                    }

                    let leadingTrivia: Trivia = i == 0 ?
                        Trivia(
                            pieces: [
                                .blockComment("/*"),
                                .newlines(1),
                                .blockComment("Use @FigmaString, @FigmaEnum, @FigmaBoolean and @FigmaInstance property wrappers to connect Figma properties to code"),
                                .newlines(2)
                            ]
                        ) : Trivia(pieces: [.newlines(2)])
                    let trailingTrivia: Trivia = i == properties.count - 1
                        ? Trivia(
                            pieces: [
                                .newlines(1),
                                .lineComment("*/"),
                                .newlines(2)
                            ]
                        ) : Trivia()
                    varDecl
                        .with(\.leadingTrivia, Trivia(pieces: leadingTrivia + varDecl.leadingTrivia))
                        .with(\.trailingTrivia, Trivia(pieces: varDecl.trailingTrivia.pieces + trailingTrivia))
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
            // Import SwiftUI to resolve View type
            try ImportDeclSyntax("import SwiftUI")

            // Import Figma to resolve Figma property wrappers
            try ImportDeclSyntax("import Figma").with(\.trailingTrivia, .newlines(2))
            structDecl
        }
    }
}

fileprivate extension ComponentPropertyType {
    var correspondingAnnotationName: String {
        switch self {
        case .boolean:
            "FigmaBoolean"
        case .instanceSwap:
            "FigmaInstance"
        case .text:
            "FigmaString"
        case .variant:
            "FigmaEnum"
        }
    }
}
#endif
