#if os(macOS)
import Foundation
import SwiftFormat
import SwiftParser
import SwiftSyntax

struct JSTemplateHelpers {
    /// Helper function for rendering children -- Reads in the prefix which is passed from the parser and applies it to
    /// all non-empty new lines, and then trims the trailing newline.
    ///
    /// For nested instances that render in pills, manually add spacing in between so that they appear on separate lines.
    static let swiftChildrenRenderFn: String =
        """
        function __fcc_renderSwiftChildren(children, prefix) {
          if (children === undefined) {
            return children
          }
          return children.flatMap((child, index) => {
            if (child.type === 'CODE') {
              let code = child.code.split('\\n').map((line) => {
                return line.trim() !== '' ? `${prefix}${line}` : line;
              }).join('\\n')
              if (index !== children.length - 1) {
                code = code + '\\n'
              }
              return {
                ...child,
                code: code,
              }
            } else {
                let elements = []
                const shouldAddNewline = index > 0 && children[index - 1].type === 'CODE' && !children[index - 1].code.endsWith('\\n')
                elements.push({ type: 'CODE', code: `${shouldAddNewline ? '\\n' : ''}${prefix}` })
                elements.push(child)
                if (index !== children.length - 1) {
                    elements.push({ type: 'CODE', code: '\\n' })
                }
                return elements
            }
          })
        }
        """

    static func swiftChildrenCall(variableName: String, prefix: String) -> String {
        return "${__fcc_renderSwiftChildren(\(variableName), \'\(prefix)\')}"
    }
}

fileprivate extension JSONPrimitive {
    var keyValue: String {
        switch self {
        case .string(let string):
            return "\(string)"
        case .bool(let bool):
            return "\(bool)"
        case .number(let double):
            return "\(double)"
        case .null:
            return "undefined"
        }
    }
    
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

fileprivate extension PropMap {
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
            guard let params = valueMappedParams() else {
                return """
                '\(args.figmaPropName)', {
                'true': true,
                'false': false
                }
                """
            }
            return params
        case .string, .instance:
            return "'\(args.figmaPropName)'"
        case .enumerable:
            if let params = valueMappedParams() {
                return params
            } else {
                return "'\(args.figmaPropName)'"
            }
        }
    }
    
    func valueMappedParams() -> String? {
        guard let valueMapping = args.valueMapping else {
            return nil
        }
        return """
        '\(args.figmaPropName)', {
        \(valueMapping.compactMap { "'\($0.key.keyValue)': \($0.value.jsValue)" }.sorted().joined(separator: ",\n"))
        }
        """
    }
}

fileprivate extension FigmaChildren {
    var jsFunctionName: String {
        "children"
    }
    
    var functionParams: String {
        return "[\(args.layers.map { "\"\($0)\"" }.joined(separator: ", "))]"
    }
    
}

fileprivate extension TemplateDataProp {
    static let namespace = "figma.properties"

    var qualifiedFunctionName: String { TemplateDataProp.namespace + "." + jsFunctionName }
    var jsFunctionName: String {
        switch self {
        case .children(let children):
            return children.jsFunctionName
        case .propMap(let propMap):
            return propMap.jsFunctionName
        }
    }
    
    var functionParams: String {
        switch self {
        case .children(let children):
            return children.functionParams
        case .propMap(let propMap):
            return propMap.functionParams
        }
    }

    var functionCall: String {
        return "\(qualifiedFunctionName)(\(functionParams))"
    }
}

fileprivate struct FigmaConditionalTemplate {
    enum Condition {
        case equalsDefault(propName: String, defaultValue: JSONPrimitive)
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

    /// Returns a string formatted at a JS template string, prepending a prefix to the `apply` and `elseApply` cases if necessary. The prefix is used to add whitespace in order to format properly when rendered in Dev Mode.
    /// For example, if `apply` is `.tint(.blue)` and `elseApply` is `.tint(.blue).disabled(true)`, with prefix = `\t`
    /// the resultant template will be
    /// `${some_condition ? '\t.tint(.blue)' : '\t.tint(.blue).disabled(true)'}`
    func templateStringWithPrefix(_ prefix: String) -> String {
        // Double escape newline characters
        let jsParseablePrefix = prefix.replacingOccurrences(of: "\n", with: "\\n")

        var applyString = "undefined"
        if let apply {
            applyString = "`\(jsParseablePrefix + apply)`"
        }

        var elseApplyString = "undefined"
        if let elseApply {
            elseApplyString = "`\(jsParseablePrefix + elseApply)`"
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
        lines.append(JSTemplateHelpers.swiftChildrenRenderFn)
        lines.append(contentsOf: createPropDefinitions())
        lines.append(rewriteCodeBlockWithTemplate())
        return lines.joined(separator: "\n")
    }

    private func createPropDefinitions() -> [String] {
        var propDefinitions = [String]()
        for (key, value) in templateData.props {
            propDefinitions.append("const \(key) = \(value.functionCall)")
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

        let rewrittenCode = newSyntaxTree.description.replaceConditionalTemplates(
            conditionalTemplates: rewriter.conditionalTemplates
        ).replaceNestedInstancePlaceholders(
            nestedInstanceCalls: rewriter.nestedInstanceCalls
        ).trimmingCharacters(in: .whitespacesAndNewlines)
        
        return "export default figma.swift`\(rewrittenCode)`"
    }
}

fileprivate extension String {
    
    /// In order to replace `figmaApply` and `hideDefault` calls, we use string substitution to find replacement strings and
    /// Insert the appropriate ternary expression.
    ///
    /// - Parameter conditionalTemplates: The conditional templates that should be rendered in place of placeholders
    /// - Returns: An updated string replacing `replacementFunctionNameForApplyAndDefaults(withDotAndParens:)` calls.
    func replaceConditionalTemplates(
        conditionalTemplates: [FigmaConditionalTemplate]
    ) -> String {
        var currentCode = self
        for (replaceIndex, conditionalTemplate) in conditionalTemplates.enumerated() {
            let replacementString = replaceIndex.replacementFunctionNameForApplyAndDefaults(withDotAndParens: true)
            guard let replacementStringLoc = currentCode.range(of: replacementString) else {
                return currentCode
            }
            // Replace leading up to the nearest newline in order to capture leading whitespace, tabs, etc.
            let startReplacementIndex =
                currentCode.prefix(upTo: replacementStringLoc.lowerBound).lastIndex(of: "\n")
                    ?? replacementStringLoc.lowerBound
            let prefix = String(currentCode[startReplacementIndex ..< replacementStringLoc.lowerBound])

            currentCode.replaceSubrange(
                startReplacementIndex ..< replacementStringLoc.upperBound,
                with: conditionalTemplate.templateStringWithPrefix(prefix)
            )
        }
        return currentCode
    }
    
    
    /// In order to support inline rendering of `Figma.children` and `Figma.instance` calls, we use a js helper to handle formatting once substitutions have been made.
    /// Since Swift formatting isn't supported on the client side, this helps us add formatting at the parser level.
    ///
    /// Note: The logic here and `replaceConditionalTemplates` differ in that `replaceConditionalTemplate` captures the leading `\n` into the ternary expressions.
    ///
    /// - Parameter nestedInstanceCalls: The variable names for whenever a `@FigmaChildren` or `@FigmaInstance` property is called from code.
    /// - Returns: An updated version of the string with placeholders replaced with the appropriate JS Template string.
    func replaceNestedInstancePlaceholders(
        nestedInstanceCalls: [String]
    ) -> String {
        var currentCode = self
        for (replaceIndex, varName) in nestedInstanceCalls.enumerated() {
            let replacementString = replaceIndex.replacementPropertyPlaceholders()
            guard let replacementStringLoc = currentCode.range(of: replacementString) else {
                return currentCode
            }
            
            
            var startReplacementIndex: Index
            // Get the leading text after the nearest newline, preserving the existing newline.
            // Only prepend the prefix if its whitespace only
            if let lastNewline = currentCode.prefix(upTo: replacementStringLoc.lowerBound).lastIndex(of: "\n") {
                let startIdx = currentCode.index(after: lastNewline)
                if startIdx < replacementStringLoc.lowerBound &&
                   String(currentCode[startIdx ..< replacementStringLoc.lowerBound]).isWhitespaceOnly {
                    startReplacementIndex = startIdx
                } else {
                    startReplacementIndex = replacementStringLoc.lowerBound
                }
            } else {
                startReplacementIndex = replacementStringLoc.lowerBound
            }

            let prefix = String(currentCode[startReplacementIndex ..< replacementStringLoc.lowerBound])
            
            currentCode.replaceSubrange(
                startReplacementIndex ..< replacementStringLoc.upperBound,
                with: JSTemplateHelpers.swiftChildrenCall(variableName: varName, prefix: prefix)
            )

        }
        return currentCode
    }
}

fileprivate class MappedPropertyRewriter: SyntaxRewriter {
    enum NodeNames {
        static let figmaApplyFunction = "figmaApply"
        static let elseApplyLabel = "elseApply"
    }

    let propMaps: [String: TemplateDataProp]
    var conditionalTemplates: [FigmaConditionalTemplate] = []
    var nestedInstanceCalls: [String] = []
    
    init(propMaps: [String: TemplateDataProp]) {
        self.propMaps = propMaps
    }

    override func visit(_ node: MemberAccessExprSyntax) -> ExprSyntax {
        let nodeName = node.declName.baseName.text
        guard let parent = node.parent, parent.is(LabeledExprSyntax.self) || parent.is(CodeBlockItemSyntax.self),
              let propMap =
              propMaps[nodeName]
        else {
            return super.visit(node)
        }

        if case .children(_) = propMap {
            let replacement = nestedInstanceCalls.count.replacementPropertyPlaceholders()
            nestedInstanceCalls.append(nodeName)
            return ExprSyntax(stringLiteral: replacement)
                .with(\.leadingTrivia, node.leadingTrivia)
                .with(\.trailingTrivia, node.trailingTrivia)
        } else if case .propMap(let instance) = propMap, instance.kind == .instance {
            let replacement = nestedInstanceCalls.count.replacementPropertyPlaceholders()
            nestedInstanceCalls.append(nodeName)
            return ExprSyntax(stringLiteral: replacement)
                .with(\.leadingTrivia, node.leadingTrivia)
                .with(\.trailingTrivia, node.trailingTrivia)
        } else {
            let template = propMap.transformTemplateString(nodeName)
            return ExprSyntax(stringLiteral: template)
                .with(\.leadingTrivia, node.leadingTrivia)
                .with(\.trailingTrivia, node.trailingTrivia)
        }

    }

    // Finds usages of prop mapped variables and replaces them with the JavaScript template string.
    override func visit(_ node: DeclReferenceExprSyntax) -> ExprSyntax {
        let nodeName = node.baseName.text
        guard let parent = node.parent, parent.is(LabeledExprSyntax.self) || parent.is(CodeBlockItemSyntax.self) || parent.is(InitializerClauseSyntax.self), 
                let propMap =
            propMaps[node.baseName.text]
        else {
            return super.visit(node)
        }
        if case .children(_) = propMap {
            let replacement = nestedInstanceCalls.count.replacementPropertyPlaceholders()
            nestedInstanceCalls.append(nodeName)
            return ExprSyntax(stringLiteral: replacement)
                .with(\.leadingTrivia, node.leadingTrivia)
                .with(\.trailingTrivia, node.trailingTrivia)
        } else if case .propMap(let instanceMap) = propMap, instanceMap.kind == .instance {
            let replacement = nestedInstanceCalls.count.replacementPropertyPlaceholders()
            nestedInstanceCalls.append(nodeName)
            return ExprSyntax(stringLiteral: replacement)
                .with(\.leadingTrivia, node.leadingTrivia)
                .with(\.trailingTrivia, node.trailingTrivia)
        } else {
            let template = propMap.transformTemplateString(nodeName)
            return ExprSyntax(stringLiteral: template)
                .with(\.leadingTrivia, node.leadingTrivia)
                .with(\.trailingTrivia, node.trailingTrivia)
        }
    }

    override func visit(_ node: FunctionCallExprSyntax) -> ExprSyntax {
        // If this is a .figmaApply call, rewrite it
        if node.calledExpression.as(MemberAccessExprSyntax.self)?.declName.baseName.text == NodeNames.figmaApplyFunction {
            return rewriteFigmaApply(node) ?? super.visit(node)
        }

        // If this nodes argument contains a prop mapped value with hideDefault = true, rewrite it.
        if let propMappedArg = node.arguments.first(where: { labeledExprSyntax in
            guard let baseName = labeledExprSyntax.getArgumentBasename(),
                  case .propMap(let propMap) = propMaps[baseName],
                  propMap.hideDefault
            else { return false }
            return true
        })?.getArgumentBasename(),
            case .propMap(let propMap) = propMaps[propMappedArg],
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
        defaultValue: JSONPrimitive
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
            LabeledExprListSyntax(node.arguments.map {
                if $0.getArgumentBasename() == defaultArgName {
                    return $0.with(\.expression, ExprSyntax(stringLiteral: "${\(defaultArgName)}"))
                }
                return $0
            })
        )

        // Create a new called expression that can be easily found and replaced in a second pass.
        let newCalledExpression = calledExpression.with(
            \.declName,
            DeclReferenceExprSyntax(
                baseName: "\(raw: conditionalTemplates.count.replacementFunctionNameForApplyAndDefaults(withDotAndParens: false))"
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
                baseName: "\(raw: conditionalTemplates.count.replacementFunctionNameForApplyAndDefaults(withDotAndParens: false))"
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
    func replacementFunctionNameForApplyAndDefaults(withDotAndParens: Bool) -> String {
        return withDotAndParens ? ".___FIGMA_APPLY_\(self)__()" : "___FIGMA_APPLY_\(self)__"
    }

    func replacementPropertyPlaceholders() -> String {
        return "__FIGMA_REPLACE_\(self)__"
    }
}

#endif
