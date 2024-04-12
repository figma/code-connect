#if os(macOS)
import Foundation
import SwiftFormat
import SwiftParser
import SwiftSyntax

extension DictionaryValue {
    var jsValue: String {
        switch self {
        case .string(let string):
            return "'\(string)'"
        case .bool(let bool):
            return "\(bool)"
        case .number(let double):
            return "\(double)"
        case .null:
            return "undefined"
        }
    }
}

extension PropMap {
    static let namespace = "figma.properties"

    var qualifiedFunctionName: String { PropMap.namespace + "." + jsFunctionName }
    var jsFunctionName: String {
        switch kind {
        case .boolean:
            return "boolean"
        case .enumerable:
            return "enum"
        case .instance:
            return "instance"
        case .string:
            return "string"
        }
    }

    var functionParams: String {
        switch kind {
        case .boolean, .string, .instance:
            return "'\(args.figmaPropName)'"
        case .enumerable:
            if let valueMapping = args.valueMapping {
                return """
                '\(args.figmaPropName)', {
                \(valueMapping.compactMap { "'\($0.key)': \($0.value.jsValue)" }.sorted().joined(separator: ",\n"))
                }
                """
            } else {
                return "'\(args.figmaPropName)'"
            }
        }
    }
}

struct CodeConnectTemplateWriter {
    let code: CodeBlockItemListSyntax
    let templateData: TemplateData

    func createTemplate() -> String? {
        var lines = [String]()
        lines.append("const figma = require('figma')\n")
        lines.append(contentsOf: createPropDefinitions())
        lines.append(rewriteCodeBlockWithTemplate())
        return lines.joined(separator: "\n")
    }

    private func createPropDefinitions() -> [String] {
        var propDefinitions = [String]()
        templateData.props.forEach { key, value in
            propDefinitions.append("const \(key) = \(value.qualifiedFunctionName)(\(value.functionParams))")
        }
        return propDefinitions.sorted()
    }

    private func rewriteCodeBlockWithTemplate() -> String {
        let rewriter = CodeBlockRewriter(propMaps: templateData.props)
        let formatted = (try? SwiftFormat.format(code.trimmedDescriptionRemovingReturnStatement())) ?? code.trimmedDescriptionRemovingReturnStatement()
        let tree = Parser.parse(source: formatted)
        let new = rewriter.visit(tree)
        return "export default figma.swift`\(new.description)`"
    }
}

class CodeBlockRewriter: SyntaxRewriter {
    let propMaps: [String: PropMap]
    init(propMaps: [String: PropMap]) {
        self.propMaps = propMaps
    }

    override func visit(_ node: MemberAccessExprSyntax) -> ExprSyntax {
        guard let parent = node.parent, parent.is(LabeledExprSyntax.self), let propMap =
            propMaps[node.declName.baseName.text]
        else {
            return super.visit(node)
        }
        let template = propMap.transformTemplateString("${\(node.declName.baseName.text)}")
        return ExprSyntax(stringLiteral: template).with(\.leadingTrivia, node.leadingTrivia).with(\.trailingTrivia, node.trailingTrivia)
    }

    override func visit(_ node: DeclReferenceExprSyntax) -> ExprSyntax {
        guard let parent = node.parent, parent.is(LabeledExprSyntax.self), let propMap =
            propMaps[node.baseName.text]
        else {
            return super.visit(node)
        }
        let template = propMap.transformTemplateString("${\(node.baseName.text)}")
        return ExprSyntax(stringLiteral: template)
    }
}
#endif
