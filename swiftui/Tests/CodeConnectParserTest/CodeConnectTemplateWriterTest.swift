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
                    ),
                    hideDefault: false,
                    defaultValue: nil


                ),
                "title": PropMap(
                    kind: .string,
                    args: PropMapArgs(
                        figmaPropName: "Label",
                        valueMapping: nil
                    ),
                    hideDefault: false,
                    defaultValue: nil
                ),
                "icon": PropMap(
                    kind: .instance,
                    args: PropMapArgs(
                        figmaPropName: "Icon",
                        valueMapping: nil
                    ),
                    hideDefault: false,
                    defaultValue: nil
                ),
                "disabled": PropMap(
                    kind: .boolean,
                    args: PropMapArgs(
                        figmaPropName: "Disabled",
                        valueMapping: nil
                    ),
                    hideDefault: false,
                    defaultValue: nil
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
        const disabled = figma.properties.boolean('Disabled', {
        'true': true,
        'false': false
        })
        const icon = figma.properties.instance('Icon')
        const title = figma.properties.string('Label')
        export default figma.swift`Button(variant: ${buttonVariant})\n    .disabled(${disabled})\n    .title("${title}")\n`
        """
        XCTAssertEqual(writer.createTemplate(), expectedTempate)
    }

    func test_figmaApply_withNoElse() {
        let code = CodeBlockItemListSyntax(stringLiteral:
            """
            Button()
                .someModifier()
                .figmaApply(isPrimary) {
                    $0.tint(.blue)
                }
                .someOtherModifier()
            """
        )
        let templateData = TemplateData(
            props: [
                "isPrimary": PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "Type",
                        valueMapping: [
                            "Primary": .bool(true)
                        ]
                    ),
                    hideDefault: false,
                    defaultValue: nil
                )
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTempate = """
        const figma = require('figma')

        const isPrimary = figma.properties.enum('Type', {
        'Primary': true
        })
        export default figma.swift`Button()\n    .someModifier()${isPrimary ? `\\n    .tint(.blue)` : undefined} \n    .someOtherModifier()\n`
        """
        XCTAssertEqual(writer.createTemplate(), expectedTempate)
    }

    func test_figmaApply_withElse() {
        let code = CodeBlockItemListSyntax(stringLiteral:
            """
            Button()
                .someModifier()
                .figmaApply(isPrimary) {
                    $0.tint(.blue)
                } elseApply: {
                    $0.tint(.clear)
                }
                .someOtherModifier()
            """
        )
        let templateData = TemplateData(
            props: [
                "isPrimary": PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "Type",
                        valueMapping: [
                            "Primary": .bool(true)
                        ]
                    ),
                    hideDefault: false,
                    defaultValue: nil
                )
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTempate = """
        const figma = require('figma')

        const isPrimary = figma.properties.enum('Type', {
        'Primary': true
        })
        export default figma.swift`Button()\n    .someModifier()${isPrimary ? `\\n    .tint(.blue)` : `\\n    .tint(.clear)`} \n    .someOtherModifier()\n`
        """
        XCTAssertEqual(writer.createTemplate(), expectedTempate)
    }

    func test_figmaApply_withMultiple() {
        let code = CodeBlockItemListSyntax(stringLiteral:
            """
            Button()
                .someModifier()
                .figmaApply(isPrimary) {
                    $0.tint(.blue)
                } elseApply: {
                    $0.tint(.clear)
                }
                .someOtherModifier()
                .figmaApply(isDisabled) { view in
                    view.disabled(true)
                }
            """
        )
        let templateData = TemplateData(
            props: [
                "isPrimary": PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "Type",
                        valueMapping: [
                            "Primary": .bool(true)
                        ]
                    ),
                    hideDefault: false,
                    defaultValue: nil
                ),
                "isDisabled": PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "State",
                        valueMapping: [
                            "Disabled": .bool(true),
                            "Enabled": .bool(false)
                        ]
                    ),
                    hideDefault: false,
                    defaultValue: nil
                )
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTempate = """
        const figma = require('figma')

        const isDisabled = figma.properties.enum('State', {
        'Disabled': true,
        'Enabled': false
        })
        const isPrimary = figma.properties.enum('Type', {
        'Primary': true
        })
        export default figma.swift`Button()\n    .someModifier()${isPrimary ? `\\n    .tint(.blue)` : `\\n    .tint(.clear)`} \n    .someOtherModifier()${isDisabled ? `\\n    .disabled(true)` : undefined} \n`
        """
        XCTAssertEqual(writer.createTemplate(), expectedTempate)
    }

    func test_hideDefault() {
        let code = CodeBlockItemListSyntax(stringLiteral:
            """
            Button()
                .someModifier()
                .disabled(disabled) { 
                    // Some trailing closure
                }
                .someOtherModifier()
            """
        )

        let templateData = TemplateData(
            props: [
                "disabled": PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "State",
                        valueMapping: [
                            "Disabled": .bool(true),
                            "Enabled": .bool(false)
                        ]
                    ),
                    hideDefault: true,
                    defaultValue: .bool(false)
                )
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTempate = """
        const figma = require('figma')

        const disabled = figma.properties.enum('State', {
        'Disabled': true,
        'Enabled': false
        })
        export default figma.swift`Button()\n    .someModifier()${disabled === false ? undefined : `\\n    .disabled(${disabled}) {\n        // Some trailing closure\n    }`} \n    .someOtherModifier()\n`
        """
        XCTAssertEqual(writer.createTemplate(), expectedTempate)
    }
}
