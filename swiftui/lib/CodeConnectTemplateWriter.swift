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
        case .boolean:
            return """
            '\(args.figmaPropName)', {
            'true': true,
            'false': false
            }
            """
        case .string, .instance:
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

struct FigmaConditionalTemplate {
    enum Condition {
        case equalsDefault(propName: String, defaultValue: DictionaryValue)
        case boolean(propName: String)

        var templatedDescription: String {
            switch self {
            case .equalsDefault(let propName, let defaultValue):
                return "\(propName) === \(defaultValue.jsValue)"
            case .boolean(let propName):
                return "\(propName)"
            }
        }
    }

    let condition: Condition
    let apply: String?
    let elseApply: String?

    func templateStringWithLeadingTrivia(_ trivia: String) -> String {
        // Double escape newline characters
        let jsParseableTrivia = trivia.replacingOccurrences(of: "\n", with: "\\n")

        var applyString: String = "undefined"
        if let apply {
            applyString = "`\(jsParseableTrivia + apply)`"
        }

        var elseApplyString: String = "undefined"
        if let elseApply {
            elseApplyString = "`\(jsParseableTrivia + elseApply)`"
        }

        return "${\(condition.templatedDescription) ? \(applyString) : \(elseApplyString)}"
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
        let formatted = (try? SwiftFormat.format(code.trimmedDescriptionRemovingReturnStatement())) ?? code.trimmedDescriptionRemovingReturnStatement()
        let tree = Parser.parse(source: formatted)
        let rewriter = MappedPropertyRewriter(
            propMaps: templateData.props
        )

        var conditionalTemplates: [FigmaConditionalTemplate] = []
        var newSyntaxTree = rewriter.visit(tree)

        // Quite a hack, when you rewrite a node it doesn't traverse into the
        // children. Due to the ability to chain function calls, we need to contually traverse the
        // syntax tree until all of the `figmaApply` calls have been replaced.

        while rewriter.conditionalTemplates.count != conditionalTemplates.count {
            conditionalTemplates = rewriter.conditionalTemplates
            newSyntaxTree = rewriter.visit(newSyntaxTree)
        }

        let rewrittenCode = replaceConditionalTemplates(
            code: newSyntaxTree.description,
            conditionalTemplates: rewriter.conditionalTemplates
        )
        return "export default figma.swift`\(rewrittenCode)`"
    }

    private func replaceConditionalTemplates(
        code: String,
        conditionalTemplates: [FigmaConditionalTemplate]
    ) -> String {
        var currentCode = code
        for (replaceIndex, conditionalTemplate) in conditionalTemplates.enumerated() {
            let replacementString = replaceIndex.replacementFunctionNameForApply(withDotAndParens: true)
            guard let replacementStringLoc = currentCode.range(of: replacementString) else {
                return currentCode
            }
            // Replace leading up to the nearest newline in order to capture leading whitespace, tabs, etc.
            let startReplacementIndex =
                currentCode.prefix(upTo: replacementStringLoc.lowerBound).lastIndex(of: "\n")
                    ?? replacementStringLoc.lowerBound
            let trivia = String(currentCode[startReplacementIndex ..< replacementStringLoc.lowerBound])
            currentCode.replaceSubrange(
                startReplacementIndex ..< replacementStringLoc.upperBound,
                with: conditionalTemplate.templateStringWithLeadingTrivia(trivia)
            )
        }
        return currentCode
    }
}

class MappedPropertyRewriter: SyntaxRewriter {
    enum NodeNames {
        static let figmaApplyFunction = "figmaApply"
        static let elseApplyLabel = "elseApply"
    }

    let propMaps: [String: PropMap]
    var conditionalTemplates: [FigmaConditionalTemplate] = []

    init(
        propMaps: [String: PropMap]
    ) {
        self.propMaps = propMaps
    }

    override func visit(_ node: MemberAccessExprSyntax) -> ExprSyntax {
        guard let parent = node.parent, parent.is(LabeledExprSyntax.self),
              let propMap =
              propMaps[node.declName.baseName.text]
        else {
            return super.visit(node)
        }

        let template = propMap.transformTemplateString("${\(node.declName.baseName.text)}")
        return ExprSyntax(stringLiteral: template)
            .with(\.leadingTrivia, node.leadingTrivia)
            .with(\.trailingTrivia, node.trailingTrivia)
    }

    // Finds usages of prop mapped variables and replaces them with the JavaScript template string.
    override func visit(_ node: DeclReferenceExprSyntax) -> ExprSyntax {
        guard let parent = node.parent, parent.is(LabeledExprSyntax.self), let propMap =
            propMaps[node.baseName.text]
        else {
            return super.visit(node)
        }
        let template = propMap.transformTemplateString("${\(node.baseName.text)}")
        return ExprSyntax(stringLiteral: template)
    }

    override func visit(_ node: FunctionCallExprSyntax) -> ExprSyntax {
        // If this is a .figmaApply call, rewrite it
        if node.calledExpression.as(MemberAccessExprSyntax.self)?.declName.baseName.text == NodeNames.figmaApplyFunction {
            return rewriteFigmaApply(node) ?? super.visit(node)
        }

        // If this nodes argument contains a prop mapped value with hideDefault = true, rewrite it.
        if let propMappedArg = node.arguments.first(where: { labeledExprSyntax in
            guard let baseName = labeledExprSyntax.getArgumentBasename(),
                  let propMap = propMaps[baseName],
                  propMap.hideDefault
            else { return false }
            return true
        })?.getArgumentBasename(),
            let propMap = propMaps[propMappedArg],
            let defaultValue = propMap.defaultValue
        {
            return rewriteFunctionCallWithHideDefault(
                node,
                defaultArgName: propMappedArg,
                defaultValue: defaultValue
            ) ?? super.visit(node)
        }
        return super.visit(node)
    }


    /// Rewrites a function call with a replacement string for function calls that use a property annotated with `hideDefault`.
    /// These calls are added to `conditionalTemplates` so that they can be replaced upon a second pass.
    /// For example, for the given Code Connect file
    ///  ```
    ///    @FigmaProp("Disabled", hideDefault: true)
    ///    var disabled: Bool = false
    ///
    ///    var body: some View {
    ///        MyView()
    ///            .disabled(self.disabled)
    ///    }
    /// ```
    /// If the component in Figma has `Disabled = false`, the resulting code will simply be `MyView()`
    func rewriteFunctionCallWithHideDefault(
        _ node: FunctionCallExprSyntax,
        defaultArgName: String,
        defaultValue: DictionaryValue
    ) -> ExprSyntax? {
        guard let calledExpression = node.calledExpression.as(MemberAccessExprSyntax.self) else {
            return nil
        }

        // Create a placeholder that doesn't include all the nested function calls. This is used
        // for the template string.
        let templateString = node.with(
            \.calledExpression,
            ExprSyntax(MemberAccessExprSyntax(name: calledExpression.declName.baseName))
        ).with(
            \.arguments,
             LabeledExprListSyntax(node.arguments.map({
                 if $0.getArgumentBasename() == defaultArgName {
                     return $0.with(\.expression, ExprSyntax(stringLiteral:"${\(defaultArgName)}"))
                 }
                 return $0
             }))
        )

        // Create a new called expression that can be easily found and replaced in a second pass.
        let newCalledExpression = calledExpression.with(
            \.declName,
            DeclReferenceExprSyntax(
                baseName: "\(raw: conditionalTemplates.count.replacementFunctionNameForApply(withDotAndParens: false))"
            )
        )

        conditionalTemplates.append(
            // Show nothing if the default is true
            FigmaConditionalTemplate(
                condition: .equalsDefault(propName: defaultArgName, defaultValue: defaultValue),
                apply: nil,
                elseApply: templateString.description
            )
        )

        // Strip out the closures and arguments
        let newNode = node
            .with(\.trailingClosure, nil)
            .with(\.additionalTrailingClosures, MultipleTrailingClosureElementListSyntax())
            .with(\.arguments, LabeledExprListSyntax())
            .with(\.calledExpression, ExprSyntax(newCalledExpression))

        return ExprSyntax(newNode)
    }

    /// Parses defintions of `figmaApply` and converts them into a string that can be found and replaced later.
    /// `figmaApply` calls are appended to `conditionalTemplates` so that each call can be replaced in the code upon a second pass.
    func rewriteFigmaApply(_ node: FunctionCallExprSyntax) -> ExprSyntax? {
        // Check that this token matches a prop
        guard let name = node.arguments.first?.expression.description else { return nil }

        // Get the argument and closure details
        guard let applyDefinition = node.arguments.first(where: {
            $0.label?.text != NodeNames.elseApplyLabel && $0.expression.is(ClosureExprSyntax.self)
        })?.expression.as(ClosureExprSyntax.self)?.getCodeAppliedToClosureArgument()
            ?? node.trailingClosure?.getCodeAppliedToClosureArgument() else { return nil }

        let elseApplyDefinition = node.arguments.first { $0.label?.text == NodeNames.elseApplyLabel }?
            .expression.as(ClosureExprSyntax.self)?
            .getCodeAppliedToClosureArgument()
            ?? node.additionalTrailingClosures.first(where: { $0.label.text == NodeNames.elseApplyLabel })?.closure
            .as(ClosureExprSyntax.self)?
            .getCodeAppliedToClosureArgument()

        guard let calledExpression = node.calledExpression.as(MemberAccessExprSyntax.self) else {
            return nil
        }

        // Create a replacement string for second pass
        let newCalledExpression = calledExpression.with(
            \.declName,
            DeclReferenceExprSyntax(
                baseName: "\(raw: conditionalTemplates.count.replacementFunctionNameForApply(withDotAndParens: false))"
            )
        )

        conditionalTemplates.append(
            FigmaConditionalTemplate(
                condition: .boolean(propName: name),
                apply: applyDefinition,
                elseApply: elseApplyDefinition
            )
        )

        // Strip out the closures and arguments
        let newNode = node
            .with(\.trailingClosure, nil)
            .with(\.additionalTrailingClosures, MultipleTrailingClosureElementListSyntax())
            .with(\.arguments, LabeledExprListSyntax())
            .with(\.calledExpression, ExprSyntax(newCalledExpression))

        return ExprSyntax(newNode)
    }
}

fileprivate extension Int {
    func replacementFunctionNameForApply(withDotAndParens: Bool) -> String {
        return withDotAndParens ? ".___FIGMA_APPLY_\(self)__()" : "___FIGMA_APPLY_\(self)__"
    }
}

#endif
