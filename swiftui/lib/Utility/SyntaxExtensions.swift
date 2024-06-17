#if os(macOS)
import Foundation
import SwiftSyntax
import Figma

enum ParsingError: Error {
    case nonStringLiteralKey
    case variantIncorrectValueType
    case incorrectStringDictionaryFormat
    case nonStringLiteralsForLayers
    case nonBooleanLiteralKey

    var localizedDescription: String {
        switch self {
        case .nonStringLiteralKey:
            return "Expected a string literal as a key for the dictionary"
        case .nonBooleanLiteralKey:
            return "Expected a boolean literal as a key for the dictionary."
        case .variantIncorrectValueType:
            return "Expected either a `String` or `Bool` literal for variant options"
        case .incorrectStringDictionaryFormat:
            return "Expected a [String: String] dictionary"
        case .nonStringLiteralsForLayers:
            return "Layer names in a @FigmaChildren declaration can only be string literals."
        }
    }
}

extension InheritanceClauseSyntax {
    func inheritsFrom(_ type: String) -> Bool {
        return inheritedTypes.contains {
            $0.type.trimmedDescription == type
        }
    }
}

extension VariableDeclSyntax {
    func bindingFor(_ identifier: String) -> PatternBindingSyntax? {
        return self.bindings.first(where: {
            $0.pattern.as(IdentifierPatternSyntax.self)?.identifier.text == identifier
        })
    }
    
    func firstAttributeNamed(_ name: String) -> AttributeSyntax? {
        return attributes.first(where: { element in
            element.as(AttributeSyntax.self)?.attributeName.as(IdentifierTypeSyntax.self)?.name.text == name
        })?.as(AttributeSyntax.self)
    }
    
    func firstAttributeMatching(_ names: [String]) -> AttributeSyntax? {
        return attributes.first(where: { element in
            guard let attributeName = element.as(AttributeSyntax.self)?.attributeName.as(IdentifierTypeSyntax.self)?.name.text else { return false }
            return names.contains(attributeName)
        })?.as(AttributeSyntax.self)
    }
}

extension PatternBindingSyntax {
    // Extracts a string literal from a computed property or an inline declaration
    func extractStringLiteralBinding() -> String? {
        if let computedProp = accessorBlock?.accessors.as(CodeBlockItemListSyntax.self)?.first?.item.as(StringLiteralExprSyntax.self) {
            return computedProp.concatenateSegments()
        } else if let variableDecl = initializer?.value.as(StringLiteralExprSyntax.self) {
            return variableDecl.concatenateSegments()
        }
        return nil
    }

    func extractDefinition() -> String? {
        if let computedProp = accessorBlock?.accessors.as(CodeBlockItemListSyntax.self)?.first {
            return computedProp.item.description
        } else if let variableDecl = initializer?.value.as(MemberAccessExprSyntax.self) {
            return variableDecl.base?.description
        }
        return nil
    }

    func extractVariantDictionaryBinding() -> [String: VariantValue]? {
        if let computedProp = accessorBlock?.accessors.as(CodeBlockItemListSyntax.self)?.first?.item.as(DictionaryExprSyntax.self) {
            return try? computedProp.reconstructVariantDictionary()
        } else if let variableDecl = initializer?.value.as(DictionaryExprSyntax.self) {
            return try? variableDecl.reconstructVariantDictionary()
        }
        return nil
    }
}

extension BooleanLiteralExprSyntax {
    func booleanValue() -> Bool {
        return self.literal.text == "true" ? true : false
    }
}

extension DictionaryExprSyntax {

    // Creates a variant dictionary for variants
    func reconstructVariantDictionary() throws -> [String: VariantValue] {
        guard case let .elements(elements) = self.content else { return [:] }
        var dictionary: [String: VariantValue] = [:]
        try elements.forEach { element in
            guard let key = element.key.as(StringLiteralExprSyntax.self)?.concatenateSegments() else {
                throw ParsingError.nonStringLiteralKey
            }
            if let value = element.value.as(StringLiteralExprSyntax.self)?.concatenateSegments() {
                dictionary[key] = .string(value)
            } else if let value = element.value.as(BooleanLiteralExprSyntax.self) {
                dictionary[key] = .bool(value.booleanValue())
            } else {
                throw ParsingError.variantIncorrectValueType
            }
        }
        return dictionary
    }

    func reconstructStringDictionary() throws -> [String: String] {
        guard case let .elements(elements) = self.content else {
            return [:]
        }
        var reconstructedDictionary: [String: String] = [:]
        try elements.forEach { element in
            guard let key = element.key.as(StringLiteralExprSyntax.self)?.concatenateSegments(),
                  let value = element.value.as(StringLiteralExprSyntax.self)?.concatenateSegments() else {
                throw ParsingError.incorrectStringDictionaryFormat
            }
            reconstructedDictionary[key] = value
        }
        return reconstructedDictionary
    }

    // Reconstructs a dictionary literal with string keys
    func reconstructStringKeyedDictionary() throws -> [String: JSONPrimitive] {
        guard case let .elements(elements) = self.content else {
            return [:]
        }
        var reconstructedDictionary: [String: JSONPrimitive] = [:]
        try elements.forEach { element in
            guard let key = element.key.as(StringLiteralExprSyntax.self)?.concatenateSegments() else {
                throw ParsingError.nonStringLiteralKey
            }
            let value = element.value.extractLiteralOrNamedValue()
            reconstructedDictionary[key] = value
        }
        return reconstructedDictionary
    }
    
    // Reconstructs a dictionary literal with boolean keys
    func reconstructBooleanKeyedDictionary() throws -> [Bool: JSONPrimitive] {
        guard case let .elements(elements) = self.content else {
            return [:]
        }
        var reconstructedDictionary: [Bool: JSONPrimitive] = [:]
        try elements.forEach { element in
            guard let key = element.key.as(BooleanLiteralExprSyntax.self)?.booleanValue() else {
                throw ParsingError.nonStringLiteralKey
            }
            let value = element.value.extractLiteralOrNamedValue()
            reconstructedDictionary[key] = value
        }
        return reconstructedDictionary
    }
}

extension ArrayExprSyntax {
    func reconstructArray() throws -> [String] {
        return try elements.compactMap { element in
            guard let stringExpr = element.expression.as(StringLiteralExprSyntax.self) else {
                throw ParsingError.nonStringLiteralsForLayers
            }
            return stringExpr.concatenateSegments()
        }
    }
}

extension StringLiteralExprSyntax {
    func concatenateSegments() -> String? {
        return segments
            .compactMap { element in
                element.as(StringSegmentSyntax.self)?.content.text
            }.joined()
    }
}

extension CodeBlockItemListSyntax {
    static let validNestableSyntaxes: [SyntaxProtocol.Type] = [ReturnStmtSyntax.self, FunctionCallExprSyntax.self, DeclReferenceExprSyntax.self]
    func trimmedDescriptionRemovingReturnStatement() -> String {
        if let returnStmtExpr = self.first?.item.as(ReturnStmtSyntax.self)?.expression {
            return returnStmtExpr.trimmedDescription
        }
        return self.trimmedDescription
    }
    
    /// Determines whether or not a code snippet can be nested. Otherwise, it will be rendered as a "Pill" that links to an instance.
    var nestable: Bool {
        // If there are more than one code blocks, or no code blocks, then this element is not nestable.
        guard self.count == 1, let item = self.first?.item else { return false }
        return CodeBlockItemListSyntax.validNestableSyntaxes.contains(where: {
            item.is($0)
        })
    }
}

extension ClosureExprSyntax {
    func getCodeAppliedToClosureArgument() -> String? {
        var viewArg = "$0"
        // Check if there's a closure signature
        if let signature {
            // Check if there's an argument in shorthand form
            if let shorthand = signature.parameterClause?.as(ClosureShorthandParameterListSyntax.self)?.first?.name.text {
                viewArg = shorthand
            } else if let firstParam = signature.parameterClause?.as(ClosureParameterClauseSyntax.self)?.parameters.first?.firstName.text {
                viewArg = firstParam
            }
        }

        // Get the function call string suffixed after the viewArg declaration
        return statements.description.suffix(after: viewArg)
    }
}

extension ExprSyntax {
    func extractLiteralOrNamedValue() -> JSONPrimitive {
        if let boolValue = self.as(BooleanLiteralExprSyntax.self) {
            return JSONPrimitive.bool(boolValue.booleanValue())
        } else if let value = self.as(FloatLiteralExprSyntax.self)?.literal
                    ?? self.as(IntegerLiteralExprSyntax.self)?.literal,
                  let number = Double(value.text)
        {
            return JSONPrimitive.number(number)
        } else if self.is(NilLiteralExprSyntax.self) {
            return .null
        } else {
            return JSONPrimitive.string(self.trimmedDescription)
        }
    }
}

extension LabeledExprSyntax {
    // Returns the base name of the argument (I.e strips out self.argumentName)
    func getArgumentBasename() -> String? {
        return expression.as(MemberAccessExprSyntax.self)?.declName.baseName.text ?? expression.as(DeclReferenceExprSyntax.self)?.baseName.text
    }
}
#endif
