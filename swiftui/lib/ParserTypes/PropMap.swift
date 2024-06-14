#if os(macOS)
import Foundation

enum TemplateDataProp: Encodable, Equatable {
    case propMap(_: PropMap)
    case children(_: FigmaChildren)
    
    
    func encode(to encoder: any Encoder) throws {
        switch self {
        case .propMap(let propMap):
            try propMap.encode(to: encoder)
        case .children(let children):
            try children.encode(to: encoder)
        }
    }
    
    // Performs additional processing to the template variable thats inserted
    // into the JS Template. For example, a string insertion needs to have
    // quotation marks around it.
    func transformTemplateString(_ jsVarName: String) -> String {
        // Add quotations around string templates & escape newlines to avoid breaking template rendering.
        if case let .propMap(propMap) = self, propMap.kind == .string {
            return "\"${\(jsVarName).replace(/\\n/g, \'\\\\n\')}\""
        }
        return "${\(jsVarName)}"
    }
}

public struct PropMap: Encodable, Equatable {
    enum CodingKeys: CodingKey {
        case kind
        case args
    }
    let kind: PropKind
    let args: PropMapArgs
    // Helpers for parsing
    let hideDefault: Bool
    let defaultValue: JSONPrimitive?

}

public struct PropMapArgs: Encodable, Equatable {
    let figmaPropName: String
    let valueMapping: [JSONPrimitive: JSONPrimitive]?
}

public enum PropKind: String, Encodable, Equatable {
    case boolean
    case string
    case enumerable = "enum"
    case instance
}

#endif
