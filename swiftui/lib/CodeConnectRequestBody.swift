#if os(macOS)
import Foundation

public struct TemplateData: Encodable, Equatable {
    let props: [String: PropMap]
    let imports: [String]
}

public struct PropMap: Encodable, Equatable {
    let kind: PropKind
    let args: PropMapArgs

    func transformTemplateString(_ templateString: String) -> String {
        switch kind {
        case .string:
            return "\"\(templateString)\""
        default:
            return templateString
        }
    }
}

public struct PropMapArgs: Encodable, Equatable {
    let figmaPropName: String
    let valueMapping: [String: DictionaryValue]?
}

// Format that we send up the code connect file to the server
public struct CodeConnectRequestBody: Encodable, Equatable {
    struct SourceLocation: Encodable, Equatable {
        let line: Int
    }
    public let figmaNode: String
    var source: String
    var sourceLocation: SourceLocation
    let component: String
    let variant: [String: VariantValue]
    let template: String
    let templateData: TemplateData

    // Default params
    let language: String = "swift"
    let label: String = "SwiftUI"

    mutating func update(source: String, sourceLocation: SourceLocation) {
        self.source = source
        self.sourceLocation = sourceLocation
    }

    public func infoLabel() -> String {
        var label = component
        label = label + variant.map({ (key, value) in
            "\(key)=\(value)"
        }).joined(separator: " ")
        return label + " " + figmaNode
    }
}

public enum PropKind: String, Encodable, Equatable {
    case boolean
    case string
    case enumerable = "enum"
    case instance
}

public struct PropMapProperty: Encodable, Equatable {
    let kind: PropKind
    let figmaPropName: String
    let valueMapping: [String: DictionaryValue]?
}

public enum DictionaryValue: Encodable, Equatable {
    case string(String)
    case bool(Bool)
    case number(Double)
    case null

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }
}

public enum VariantValue: Encodable, Equatable {
    case string(String)
    case bool(Bool)

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        }
    }

    func toString() -> String {
        switch self {
        case .string(let string):
            return string
        case .bool(let bool):
            return String(bool)
        }
    }
}

#endif
