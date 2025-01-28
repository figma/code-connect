#if os(macOS)
import Foundation
import SwiftSyntax

enum ComponentParsingError: Error {
    case componentFailedToParse
}

// Represents a component as returned from the files API
public struct Component: Decodable {
    let figmaNodeUrl: String
    let name: String
    let normalizedName: String
    let id: String
    let type: ComponentType
    let componentProperties: [String: ComponentProperty]?

    enum CodingKeys: String, CodingKey {
        case figmaNodeUrl, name, normalizedName, id, type, componentProperties = "componentPropertyDefinitions"
    }

    init(name: String, id: String, type: ComponentType, componentProperties: [String: ComponentProperty]) {
        self.figmaNodeUrl = "TODO"
        self.name = name
        self.normalizedName = "TODO"
        self.id = id
        self.type = type
        self.componentProperties = componentProperties
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        figmaNodeUrl = try container.decode(String.self, forKey: .figmaNodeUrl)
        name = try container.decode(String.self, forKey: .name)
        normalizedName = try container.decode(String.self, forKey: .normalizedName)
        id = try container.decode(String.self, forKey: .id)
        type = try container.decode(ComponentType.self, forKey: .type)
        componentProperties = try container.decodeIfPresent([String: ComponentProperty].self, forKey: .componentProperties)
    }
}

enum ComponentType: String, Decodable {
    case component = "COMPONENT"
    case componentSet = "COMPONENT_SET"
}

enum ComponentPropertyType: String, Decodable {
    case boolean = "BOOLEAN"
    case instanceSwap = "INSTANCE_SWAP"
    case text = "TEXT"
    case variant = "VARIANT"

    /**
     Returns the Swift type for a ComponentPropertyType
     - Parameter component: An optional component name argument to help determine the variant's Swift type
     - Parameter property: An property component name argument to help determine the variant's Swift type
     - Returns: The Swift Type: Bool, Any, String, or the variant's type.
     */
    func swiftTypeSpecifier(component: String?, property: String?) -> TypeAnnotationSyntax {
        switch self {
        case .boolean:
            return TypeAnnotationSyntax(type: IdentifierTypeSyntax(name: "Bool"))
        case .instanceSwap:
            return TypeAnnotationSyntax(type: IdentifierTypeSyntax(name: "Any"))
        case .text:
            return TypeAnnotationSyntax(type: IdentifierTypeSyntax(name: "String"))
        case .variant:
            if let component, let property {
                let variantName = "\(component.transformToPascalCase())\(property.transformToPascalCase())"

                // Attempt to guess the Swift enum type based on the property and component name
                // This won't always work, but it gives an indication to the user what is required for
                // a @FigmaEnum definition.
                return TypeAnnotationSyntax(type: IdentifierTypeSyntax(name: "\(raw: variantName)"))
            }

            return TypeAnnotationSyntax(type: IdentifierTypeSyntax(name: "Any"))
        }
    }
}

struct ComponentProperty: Decodable {
    var defaultValue: Either<Bool, String>?
    var type: ComponentPropertyType
    var variantOptions: [String]?

    enum CodingKeys: String, CodingKey {
        case type, defaultValue, variantOptions
    }

    init(
        defaultValue: Either<Bool, String>?,
        type: ComponentPropertyType,
        variantOptions: [String]?
    ) {
        self.defaultValue = defaultValue
        self.type = type
        self.variantOptions = variantOptions
    }

    init(from: Decoder) throws {
        do {
            let container = try from.container(keyedBy: CodingKeys.self)
            type = try container.decode(ComponentPropertyType.self, forKey: .type)
            if type == .boolean {
                defaultValue = try .a(container.decode(Bool.self, forKey: .defaultValue))
            } else if type == .text {
                defaultValue = try .b(container.decode(String.self, forKey: .defaultValue))
            } else if type == .variant {
                variantOptions = try container.decode([String].self, forKey: .variantOptions)
            }
        } catch {
            throw ComponentParsingError.componentFailedToParse
        }
    }

    func defaultValueExpr() -> ExprSyntaxProtocol? {
        guard let defaultValue else {
            let trailingTrivia = Trivia(pieces: [
                .spaces(1),
                .lineComment("// An enum type and default value is required here")
            ])

            if type == .variant, let defaultVariantOption = variantOptions?.first?.normalizingPropValue() {
                return MemberAccessExprSyntax(name: "\(raw: defaultVariantOption)").with(\.trailingTrivia, Trivia(pieces: trailingTrivia))
            }

            // Return the trailing trivia even if we have no default enum value to choose from
            return NilLiteralExprSyntax().with(\.trailingTrivia, Trivia(pieces: trailingTrivia))
        }

        switch defaultValue {
        case .a(let a):
            return BooleanLiteralExprSyntax(booleanLiteral: a)
        case .b(let b):
            return StringLiteralExprSyntax(content: b)
        }
    }
}

enum Either<A: Decodable, B: Decodable>: Decodable {
    case a(A)
    case b(B)
}
#endif
