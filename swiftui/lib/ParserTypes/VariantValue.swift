#if os(macOS)
import Foundation

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
