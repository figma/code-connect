#if os(macOS)
import Foundation

public struct TemplateData: Encodable, Equatable {
    let props: [String: PropMap]
    let imports: [String]
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
#endif
