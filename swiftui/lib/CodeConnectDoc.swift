#if os(macOS)
import Foundation

public struct TemplateData: Encodable, Equatable {
    let props: [String: TemplateDataProp]
    let imports: [String]
    let nestable: Bool
    
    init(props: [String : TemplateDataProp], imports: [String], nestable: Bool = false) {
        self.props = props
        self.imports = imports
        self.nestable = nestable
    }
}

// Format that we send up the code connect file to the server
public struct CodeConnectDoc: Encodable, Equatable {
    struct SourceLocation: Encodable, Equatable {
        let line: Int
    }
    public let figmaNode: String
    var source: String
    var sourceLocation: SourceLocation
    let component: String?
    let variant: [String: VariantValue]
    let template: String
    let templateData: TemplateData
    let functionName: String

    // Default params
    let language: String = "swift"
    let label: String = "SwiftUI"

    mutating func update(source: String, sourceLocation: SourceLocation) {
        self.source = source
        self.sourceLocation = sourceLocation
    }
}
#endif
