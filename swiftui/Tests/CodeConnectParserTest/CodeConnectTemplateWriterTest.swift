import Foundation
import SwiftSyntax
import XCTest

@testable import CodeConnectParser

class CodeConnectTemplateWriterTest: XCTestCase {
    func test_templateWriter() {
        let code = CodeBlockItemListSyntax(stringLiteral:
            """
            Button(variant: self.buttonVariant)
                .disabled(disabled)
                .title(self.title)
            """
        )
        let templateData = TemplateData(
            props: [
                "buttonVariant": PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "Variant",
                        valueMapping: [
                            "Primary": .string("ButtonVariant.primary"),
                            "Destructive": .string("ButtonVariant.danger")
                        ]
                    )
                ),
                "title": PropMap(
                    kind: .string,
                    args: PropMapArgs(
                        figmaPropName: "Label",
                        valueMapping: nil
                    )
                ),
                "icon": PropMap(
                    kind: .instance,
                    args: PropMapArgs(
                        figmaPropName: "Icon",
                        valueMapping: nil
                    )
                ),
                "disabled": PropMap(
                    kind: .boolean,
                    args: PropMapArgs(
                        figmaPropName: "Disabled",
                        valueMapping: nil
                    )
                )
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTempate = """
        const figma = require('figma')

        const buttonVariant = figma.properties.enum('Variant', {
        'Destructive': 'ButtonVariant.danger',
        'Primary': 'ButtonVariant.primary'
        })
        const disabled = figma.properties.boolean('Disabled')
        const icon = figma.properties.instance('Icon')
        const title = figma.properties.string('Label')
        export default figma.swift`Button(variant: ${buttonVariant})\n    .disabled(${disabled})\n    .title("${title}")\n`
        """
        XCTAssertEqual(writer.createTemplate(), expectedTempate)
    }
}
