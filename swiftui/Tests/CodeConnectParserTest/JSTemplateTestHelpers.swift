import Foundation

@testable import CodeConnectParser

struct JSTemplateTestHelpers {
    static func templateWithInitialBoilerplate(_ template: String) -> String{
        return [
            """
            const figma = require('figma')

            \(JSTemplateHelpers.swiftChildrenRenderFn)
            """,
            template
        ].joined(separator: "\n")
    }
}
