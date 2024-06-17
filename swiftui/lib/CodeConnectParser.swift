#if os(macOS)
import Figma
import Foundation
import SwiftFormat
import SwiftParser
import SwiftSyntax

public extension URL {
    var isDirectory: Bool {
        (try? resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true
    }
}

enum ParserError: LocalizedError {
    case figmaMacroDefinitionNotFound
    case figmaMacroDefinitionVariantDictionaryFailedToParse
    case failedToParseExampleDefinition(connectionName: String)
    case figmaPropMissingComponentPropertyName(variable: String)
    case figmaEnumMissingMissingMapping(variable: String)
    case missingUrlDefinition(connectionName: String)
    case missingCodeBlock(connectionName: String)
    case missingComponentDefinition(connectionName: String)
    case variantDefinitionWasNotAVariantDict
    case failedToFindPath(description: String)
    case failedToParseAPropertyMapping(variable: String)

    var errorDescription: String? {
        switch self {
        case .figmaMacroDefinitionNotFound:
            return "The figma macro definition could not be found, or had incorrect arguments."
        case .figmaMacroDefinitionVariantDictionaryFailedToParse:
            return "The figma macro definition variant dictionary failed to parse. The dictionary must be a [String: String]."
        case .failedToParseExampleDefinition(let connectionName):
            return "Failed to parse the example definition from \(connectionName)"
        case .figmaPropMissingComponentPropertyName(let variable):
            return "The variable \(variable) is missing the Figma component property name."
        case .figmaEnumMissingMissingMapping(let variable):
            return "The variable \(variable) is missing a mapping argument."
        case .missingUrlDefinition(let connectionName):
            return "\(connectionName) is missing a URL to the node in Figma."
        case .missingCodeBlock(let connectionName):
            return "\(connectionName) is missing a body definition."
        case .missingComponentDefinition(let connectionName):
            return "\(connectionName) is missing a component type."
        case .variantDefinitionWasNotAVariantDict:
            return "The variant map could not be parsed. (This might be because there is a `variant` variable that will need to be renamed). Variant values must be either a String or Bool literal."
        case .failedToFindPath(let description):
            return "Failed to find the path of the repository: \(description)"
        case .failedToParseAPropertyMapping(let variable):
            return "The variable \(variable) could not be parsed as a Figma Property Mapping.."
        }
    }
}

enum NodeNames {
    static let protocolName = "FigmaConnect"
    static let macroName = "Figma"
    static let component = "component"
    static let figmaNodeUrl = "figmaNodeUrl"
    static let body = "body"

    // Prop mappings & parameters
    static let figmaProp = "FigmaProp"
    static let figmaEnum = "FigmaEnum"
    static let figmaBoolean = "FigmaBoolean"
    static let figmaInstance = "FigmaInstance"
    static let figmaString = "FigmaString"

    static let figmaPropMappingArg = "mapping"
    static let hideDefault = "hideDefault"
    static let variant = "variant"
    static let children = "FigmaChildren"
    static let layers = "layers"

    static let propertyMappingDefinitionNames = [figmaProp, figmaEnum, figmaBoolean, figmaInstance, figmaString]
}

class StructDefinitionFinder: SyntaxVisitor {
    private(set) var structDeclarations: [String: SourceLocation] = [:]
    var definitionsToFind: Set<String>
    var converter: SourceLocationConverter

    init(definitionsToFind: Set<String>, converter: SourceLocationConverter) {
        self.definitionsToFind = definitionsToFind
        self.converter = converter
        super.init(viewMode: .sourceAccurate)
    }

    override func visit(_ node: StructDeclSyntax) -> SyntaxVisitorContinueKind {
        if definitionsToFind.contains(node.name.text) {
            structDeclarations[node.name.text] = node.startLocation(converter: converter)
        }
        return super.visit(node)
    }
}

class FigmaConnectStructVisitor: SyntaxVisitor {
    let importMapping: [String: String]
    let baseUrl: URL
    var docs: [CodeConnectDoc] = []
    var messages: [ParserResultMessage] = []

    init(importMapping: [String: String], baseUrl: URL) {
        self.importMapping = importMapping
        self.baseUrl = baseUrl
        super.init(viewMode: .fixedUp)
    }

    func extractNameFromFigmaPropDecl(_ decl: AttributeSyntax) -> String? {
        let nameDecl = decl.arguments?.as(LabeledExprListSyntax.self)?.first
        return nameDecl?.expression.as(StringLiteralExprSyntax.self)?.concatenateSegments()
    }

    func extractStringMappingFromFigmaPropDecl(_ decl: AttributeSyntax) throws -> [String: JSONPrimitive]? {
        return try decl.arguments?.as(LabeledExprListSyntax.self)?.first(where: {
            $0.label?.text == NodeNames.figmaPropMappingArg
        })?.expression.as(DictionaryExprSyntax.self)?.reconstructStringKeyedDictionary()
    }

    func extractBoolMappingFromFigmaPropDecl(_ decl: AttributeSyntax) throws -> [Bool: JSONPrimitive]? {
        return try decl.arguments?.as(LabeledExprListSyntax.self)?.first(where: {
            $0.label?.text == NodeNames.figmaPropMappingArg
        })?.expression.as(DictionaryExprSyntax.self)?.reconstructBooleanKeyedDictionary()
    }

    func extractFigmaPropMapping(varName: String, attribute: AttributeSyntax, varDecl: VariableDeclSyntax) throws -> TemplateDataProp? {
        guard let attributeType = attribute.attributeName.as(IdentifierTypeSyntax.self)?.name.text else { return nil }

        if attributeType == NodeNames.figmaProp {
            return try extractLegacyFigmaPropMap(varName: varName, attribute: attribute, varDecl: varDecl)
        } else if attributeType == NodeNames.figmaEnum {
            return try extractEnumPropMap(varName: varName, attribute: attribute, varDecl: varDecl)
        } else if attributeType == NodeNames.figmaBoolean {
            return try extractBooleanPropMap(varName: varName, attribute: attribute, varDecl: varDecl)
        } else if attributeType == NodeNames.figmaString {
            return try extractPropMapWithPropNameOnly(varName: varName, attribute: attribute, varDecl: varDecl, kind: .string)
        } else if attributeType == NodeNames.figmaInstance {
            return try extractPropMapWithPropNameOnly(varName: varName, attribute: attribute, varDecl: varDecl, kind: .instance)
        } else {
            throw ParserError.failedToParseAPropertyMapping(variable: varName)
        }
    }

    func extractPropMapWithPropNameOnly(
        varName: String,
        attribute: AttributeSyntax,
        varDecl: VariableDeclSyntax,
        kind: PropKind
    )  throws -> TemplateDataProp {
        guard let name = extractNameFromFigmaPropDecl(attribute) else {
            throw ParserError.figmaPropMissingComponentPropertyName(variable: varName)
        }
        return .propMap(PropMap(
            kind: kind,
            args: PropMapArgs(figmaPropName: name, valueMapping: nil),
            hideDefault: false,
            defaultValue: extractDefaultValueFromFigmaPropDecl(varDecl))
        )
    }

    func extractBooleanPropMap(
        varName: String,
        attribute: AttributeSyntax,
        varDecl: VariableDeclSyntax
    ) throws -> TemplateDataProp {
        guard let name = extractNameFromFigmaPropDecl(attribute) else {
            throw ParserError.figmaPropMissingComponentPropertyName(variable: varName)
        }
        let mapping = try extractBoolMappingFromFigmaPropDecl(attribute)?.reduce(into: [:], { partialResult, element in
            partialResult[JSONPrimitive.bool(element.key)] = element.value
        })
        return .propMap(PropMap(
            kind: .boolean,
            args: PropMapArgs(figmaPropName: name, valueMapping: mapping),
            hideDefault: shouldHideDefaultFromFigmaPropDecl(attribute),
            defaultValue: extractDefaultValueFromFigmaPropDecl(varDecl))
        )
    }

    func extractEnumPropMap(
        varName: String,
        attribute: AttributeSyntax,
        varDecl: VariableDeclSyntax
    ) throws -> TemplateDataProp {
        guard let name = extractNameFromFigmaPropDecl(attribute) else {
            throw ParserError.figmaPropMissingComponentPropertyName(variable: varName)
        }
        guard let mapping = try extractStringMappingFromFigmaPropDecl(attribute)?.reduce(into: [:], { partialResult, element in
            partialResult[JSONPrimitive.string(element.key)] = element.value
        }) else {
            throw ParserError.figmaPropMissingComponentPropertyName(variable: varName)
        }
        return .propMap(PropMap(
            kind: .enumerable,
            args: PropMapArgs(figmaPropName: name, valueMapping: mapping),
            hideDefault: shouldHideDefaultFromFigmaPropDecl(attribute),
            defaultValue: extractDefaultValueFromFigmaPropDecl(varDecl))
        )
    }

    func extractLegacyFigmaPropMap(
        varName: String,
        attribute: AttributeSyntax,
        varDecl: VariableDeclSyntax
    ) throws -> TemplateDataProp {
        guard let name = extractNameFromFigmaPropDecl(attribute) else {
            throw ParserError.figmaPropMissingComponentPropertyName(variable: varName)
        }
        if let mapping = try extractStringMappingFromFigmaPropDecl(attribute)?.reduce(into: [:], { partialResult, element in
            partialResult[JSONPrimitive.string(element.key)] = element.value
        }) {
            return .propMap(PropMap(
                kind: .enumerable,
                args: PropMapArgs(figmaPropName: name, valueMapping: mapping),
                hideDefault: shouldHideDefaultFromFigmaPropDecl(attribute),
                defaultValue: extractDefaultValueFromFigmaPropDecl(varDecl))

            )
        } else {
            let kind = extractPropKindFromFigmaPropDecl(varDecl)
            return .propMap(PropMap(
                kind: kind,
                args: PropMapArgs(figmaPropName: name, valueMapping: nil),
                hideDefault: shouldHideDefaultFromFigmaPropDecl(attribute),
                defaultValue: extractDefaultValueFromFigmaPropDecl(varDecl)
            ))
        }
    }

    func extractPropKindFromFigmaPropDecl(_ decl: VariableDeclSyntax) -> PropKind {
        // Parse from type specifier
        if let typeSpecifier = decl.bindings.first?.typeAnnotation?.type.as(IdentifierTypeSyntax.self)?.name.text
        {
            if typeSpecifier == "Bool" { return .boolean }
            if typeSpecifier == "String" { return .string }
        } else if let literalDefinitionType = decl.bindings.first?.initializer?.value {
            if literalDefinitionType.is(BooleanLiteralExprSyntax.self) { return .boolean }
            if literalDefinitionType.is(StringLiteralExprSyntax.self) { return .string }
        }
        return .instance
    }

    func extractLayerNamesFromFigmaChildrenDecl(_ decl: AttributeSyntax) -> [String]? {
        return try? decl.arguments?.as(LabeledExprListSyntax.self)?.first(where: {
            $0.label?.text == NodeNames.layers
        })?.expression.as(ArrayExprSyntax.self)?.reconstructArray()
    }

    func extractDefaultValueFromFigmaPropDecl(_ decl: VariableDeclSyntax) -> JSONPrimitive? {
        return decl.bindings.first?.initializer?.value.extractLiteralOrNamedValue()
    }

    func shouldHideDefaultFromFigmaPropDecl(_ decl: AttributeSyntax) -> Bool {
        guard let booleanValue = decl.arguments?.as(LabeledExprListSyntax.self)?.first(where: {
            $0.label?.text == NodeNames.hideDefault
        })?.expression.as(BooleanLiteralExprSyntax.self)?.booleanValue() else {
            return false
        }
        return booleanValue
    }

    func extractFigmaConnectFromNode(_ node: StructDeclSyntax) throws -> CodeConnectDoc? {
        let members = node.memberBlock.members
        var component: String?
        var figmaNodeUrl: String?
        var templateDataProps: [String: TemplateDataProp] = [:]
        var variant: [String: VariantValue]?
        var codeBlock: CodeBlockItemListSyntax?

        for member in members {
            if let varDecl = member.decl.as(VariableDeclSyntax.self),
               let varName = varDecl.bindings.first?.pattern.as(IdentifierPatternSyntax.self)?.identifier.text
            {
                // Find node url
                if let nodeUrlBinding = varDecl.bindingFor(NodeNames.figmaNodeUrl) {
                    figmaNodeUrl = nodeUrlBinding.extractStringLiteralBinding()
                } else if let componentBinding = varDecl.bindingFor(NodeNames.component) {
                    component = componentBinding.extractDefinition()
                } else if let variantBinding = varDecl.bindingFor(NodeNames.variant) {
                    guard let variantMap = variantBinding.extractVariantDictionaryBinding() else {
                        throw ParserError.variantDefinitionWasNotAVariantDict
                    }
                    variant = variantMap
                } else if let body = varDecl.bindingFor(NodeNames.body),
                          let code = body.accessorBlock?.accessors.as(CodeBlockItemListSyntax.self)
                {
                    codeBlock = code
                } else if let figmaProp = varDecl.firstAttributeMatching(NodeNames.propertyMappingDefinitionNames),
                    let propMap = try extractFigmaPropMapping(varName: varName, attribute: figmaProp, varDecl: varDecl) {
                        templateDataProps[varName] = propMap
                } else if let children = varDecl.firstAttributeNamed(NodeNames.children) {
                    if let layerNames = extractLayerNamesFromFigmaChildrenDecl(children) {
                        templateDataProps[varName] = .children(FigmaChildren(layerNames: layerNames))
                    }
                }
            }
        }

        // Handle Errors

        guard let component else {
            throw ParserError.missingComponentDefinition(connectionName: node.name.text)
        }
        guard let figmaNodeUrl else {
            throw ParserError.missingUrlDefinition(connectionName: node.name.text)
        }

        guard let codeBlock else {
            throw ParserError.missingCodeBlock(connectionName: node.name.text)
        }

        var imports: [String] = []

        importMapping.forEach { path, importName in
            if baseUrl.absoluteString.range(of: path, options: .regularExpression) != nil {
                imports.append(importName)
            }
        }

        let templateData = TemplateData(
            props: templateDataProps,
            imports: imports,
            nestable: codeBlock.nestable
        )
        let templateWriter = CodeConnectTemplateWriter(code: codeBlock, templateData: templateData)
        guard let template = templateWriter.createTemplate() else {
            throw ParserError.failedToParseExampleDefinition(connectionName: node.name.text)
        }

        // TODO: Find the source location
        return CodeConnectDoc(
            figmaNode: figmaNodeUrl,
            source: "",
            sourceLocation: CodeConnectDoc.SourceLocation(line: 0),
            component: component,
            variant: variant ?? [:],
            template: template,
            templateData: templateData
        )
    }

    override func visit(_ node: StructDeclSyntax) -> SyntaxVisitorContinueKind {
        // Visit Structs with @Figma macro attribute
        if (node.attributes.first(where: {
            $0.as(AttributeSyntax.self)?.attributeName.as(IdentifierTypeSyntax.self)?.name.text == NodeNames.macroName
        }) != nil)
            || (node.inheritanceClause?.inheritsFrom(NodeNames.protocolName) ?? false)
        {
            do {
                if let doc = try extractFigmaConnectFromNode(node) {
                    messages.append(ParserResultMessage(level: .info, message: "Successfully connected component: \(node.name.text)"))
                    docs.append(doc)
                }
            } catch {
                messages.append(ParserResultMessage(level: .error, message: "Couldn't parse connected component \(node.name.text) with error: \(error.localizedDescription)"))
            }

            // Skip once connect code has been found
            return .skipChildren
        }
        return super.visit(node)
    }
}

public enum CodeConnectParser {
    // Generate code connect files based on files in paths.
    public static func createCodeConnects(
        _ paths: [URL],
        importMapping: [String: String]
    ) -> CodeConnectParserResult {
        // Maps a set of component names to Code Connect files, one component may have multiple.
        var docs: [String: [CodeConnectDoc]] = [:]
        var messages: [ParserResultMessage] = []
        // First pass: Find all FCC definitions
        paths.forEach { url in
            do {
                guard let file = try? String(contentsOf: url) else { return }
                let syntaxTree = Parser.parse(source: file)
                let finder = FigmaConnectStructVisitor(importMapping: importMapping, baseUrl: url)
                finder.walk(syntaxTree)
                finder.docs.forEach { doc in
                    var docsForComponent = docs[doc.component, default: []]
                    docsForComponent.append(doc)
                    docs[doc.component] = docsForComponent
                }
                messages += finder.messages
            }
        }

        // Second pass: Look through paths to find the code definitions
        paths.forEach { url in
            guard let file = try? String(contentsOf: url) else { return }
            let syntaxTree = Parser.parse(source: file)
            let converter = SourceLocationConverter(fileName: url.path, tree: syntaxTree)
            let structDefinitionFinder = StructDefinitionFinder(
                definitionsToFind: Set(docs.keys),
                converter: converter
            )
            structDefinitionFinder.walk(syntaxTree)
            for (structName, sourceLocation) in structDefinitionFinder.structDeclarations {
                guard let newDocs = docs[structName] else { continue }
                docs[structName] = newDocs.map { body in
                    var newDoc = body
                    newDoc.update(
                        source: sourceLocation.file,
                        sourceLocation: CodeConnectDoc.SourceLocation(
                            line: sourceLocation.line
                        )
                    )
                    return newDoc
                }
            }
        }
        return CodeConnectParserResult(docs: Array(docs.values).flatMap { $0 }, messages: messages)
    }
}

public func shell(command: String, directoryUrl: URL?) throws -> String? {
    let process = Process()
    process.currentDirectoryURL = directoryUrl
    let pipe = Pipe()
    let errorPipe = Pipe()

    process.standardOutput = pipe
    process.standardError = errorPipe

    process.launchPath = "/bin/bash"
    process.arguments = ["-c", command]
    process.launch()

    let errorData = try errorPipe.fileHandleForReading.readToEnd()
    if let errorData {
        let errorString = String(data: errorData, encoding: .utf8) ?? ""
        throw ParserError.failedToFindPath(description: errorString)
    }

    guard let data = try pipe.fileHandleForReading.readToEnd() else { return nil }
    return String(data: data, encoding: .utf8)
}

public struct CodeConnectParserResult: Encodable {
    public var docs: [CodeConnectDoc]
    public var messages: [ParserResultMessage]
}

#endif
