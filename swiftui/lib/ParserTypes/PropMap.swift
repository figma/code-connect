#if os(macOS)
import Foundation

public struct PropMap: Encodable, Equatable {
    enum CodingKeys: CodingKey {
        case kind
        case args
    }
    let kind: PropKind
    let args: PropMapArgs
    // Helpers for parsing
    let hideDefault: Bool
    let defaultValue: DictionaryValue?
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

public enum PropKind: String, Encodable, Equatable {
    case boolean
    case string
    case enumerable = "enum"
    case instance
}
#endif
