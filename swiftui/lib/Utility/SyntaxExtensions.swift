#if os(macOS)
import Foundation
import SwiftSyntax
import Figma

enum ParsingError: Error {
    case nonStringLiteralKey
    case variantIncorrectValueType
    case incorrectStringDictionaryFormat

    var localizedDescription: String {
        switch self {
        case .nonStringLiteralKey:
            return "Expected a string literal as a key for the dictionary"
        case .variantIncorrectValueType:
            return "Expected either a `String` or `Bool` literal for variant options"
        case .incorrectStringDictionaryFormat:
            return "Expected a [String: String] dictionary"
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

    // Reconstructs a dictionary literal
    func reconstructDictionary() throws -> [String: DictionaryValue] {
        guard case let .elements(elements) = self.content else {
            return [:]
        }
        var reconstructedDictionary: [String: DictionaryValue] = [:]
        try elements.forEach { element in
            guard let key = element.key.as(StringLiteralExprSyntax.self)?.concatenateSegments() else {
                throw ParsingError.nonStringLiteralKey
            }
            if let boolValue = element.value.as(BooleanLiteralExprSyntax.self) {
                reconstructedDictionary[key] = DictionaryValue.bool(boolValue.booleanValue())
            } else if let value = element.value.as(FloatLiteralExprSyntax.self)?.literal
                        ?? element.value.as(IntegerLiteralExprSyntax.self)?.literal,
                      let number = Double(value.text)
            {
                reconstructedDictionary[key] = DictionaryValue.number(number)
            } else {
                reconstructedDictionary[key] = DictionaryValue.string(element.value.trimmedDescription)
            }
        }
        return reconstructedDictionary
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
    func trimmedDescriptionRemovingReturnStatement() -> String {
        if let returnStmtExpr = self.first?.item.as(ReturnStmtSyntax.self)?.expression {
            return returnStmtExpr.trimmedDescription
        }
        return self.trimmedDescription
    }
}
#endif
