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
    var _codeConnectFilePath: String = ""

    // Default params
    let language: String = "swift"
    let label: String = "SwiftUI"

    mutating func update(source: String, sourceLocation: SourceLocation) {
        self.source = source
        self.sourceLocation = sourceLocation
    }

    // _codeConnectFilePath is internal metadata used for migration and is not part of doc equality
    public static func == (lhs: CodeConnectDoc, rhs: CodeConnectDoc) -> Bool {
        return lhs.figmaNode == rhs.figmaNode &&
            lhs.source == rhs.source &&
            lhs.sourceLocation == rhs.sourceLocation &&
            lhs.component == rhs.component &&
            lhs.variant == rhs.variant &&
            lhs.template == rhs.template &&
            lhs.templateData == rhs.templateData &&
            lhs.functionName == rhs.functionName
    }
}
#endif
