#if os(macOS)
import Foundation

public enum JSONPrimitive: Encodable, Equatable, Hashable {
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
#endif
