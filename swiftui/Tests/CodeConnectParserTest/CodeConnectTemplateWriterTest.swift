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
                "buttonVariant": .propMap(PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "Variant",
                        valueMapping: [
                            .string("Primary"): .string("ButtonVariant.primary"),
                            .string("Destructive"): .string("ButtonVariant.danger")
                        ]
                    ),
                    hideDefault: false,
                    defaultValue: nil)

                ),
                "title": .propMap(PropMap(
                    kind: .string,
                    args: PropMapArgs(
                        figmaPropName: "Label",
                        valueMapping: nil
                    ),
                    hideDefault: false,
                    defaultValue: nil)
                ),
                "icon": .propMap(PropMap(
                    kind: .instance,
                    args: PropMapArgs(
                        figmaPropName: "Icon",
                        valueMapping: nil
                    ),
                    hideDefault: false,
                    defaultValue: nil)
                ),
                "disabled": .propMap(PropMap(
                    kind: .boolean,
                    args: PropMapArgs(
                        figmaPropName: "Disabled",
                        valueMapping: nil
                    ),
                    hideDefault: false,
                    defaultValue: nil)
                )
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTemplate = """
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
        export default figma.swift`Button(variant: ${buttonVariant})\n    .disabled(${disabled})\n    .title("${title.replace(/\\n/g, \'\\\\n\')}")`
        """
        XCTAssertEqual(writer.createTemplate(), JSTemplateTestHelpers.templateWithInitialBoilerplate(expectedTemplate))
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
                "isPrimary": .propMap(PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "Type",
                        valueMapping: [
                            .string("Primary"): .bool(true)
                        ]
                    ),
                    hideDefault: false,
                    defaultValue: nil)
                )
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTemplate = """
        const isPrimary = figma.properties.enum('Type', {
        'Primary': true
        })
        export default figma.swift`Button()\n    .someModifier()${isPrimary ? `\\n    .tint(.blue)` : undefined} \n    .someOtherModifier()`
        """
        XCTAssertEqual(writer.createTemplate(), JSTemplateTestHelpers.templateWithInitialBoilerplate(expectedTemplate))
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
                "isPrimary": .propMap(PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "Type",
                        valueMapping: [
                            .string("Primary"): .bool(true)
                        ]
                    ),
                    hideDefault: false,
                    defaultValue: nil)
                )
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTemplate = """
        const isPrimary = figma.properties.enum('Type', {
        'Primary': true
        })
        export default figma.swift`Button()\n    .someModifier()${isPrimary ? `\\n    .tint(.blue)` : `\\n    .tint(.clear)`} \n    .someOtherModifier()`
        """
        XCTAssertEqual(writer.createTemplate(), JSTemplateTestHelpers.templateWithInitialBoilerplate(expectedTemplate))
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
                "isPrimary": .propMap(PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "Type",
                        valueMapping: [
                            .string("Primary"): .bool(true)
                        ]
                    ),
                    hideDefault: false,
                    defaultValue: nil)
                ),
                "isDisabled": .propMap(PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "State",
                        valueMapping: [
                            .string("Disabled"): .bool(true),
                            .string("Enabled"): .bool(false)
                        ]
                    ),
                    hideDefault: false,
                    defaultValue: nil)
                )
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTemplate = """
        const isDisabled = figma.properties.enum('State', {
        'Disabled': true,
        'Enabled': false
        })
        const isPrimary = figma.properties.enum('Type', {
        'Primary': true
        })
        export default figma.swift`Button()\n    .someModifier()${isPrimary ? `\\n    .tint(.blue)` : `\\n    .tint(.clear)`} \n    .someOtherModifier()${isDisabled ? `\\n    .disabled(true)` : undefined}`
        """
        XCTAssertEqual(writer.createTemplate(), JSTemplateTestHelpers.templateWithInitialBoilerplate(expectedTemplate))
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
                "disabled": .propMap(PropMap(
                    kind: .enumerable,
                    args: PropMapArgs(
                        figmaPropName: "State",
                        valueMapping: [
                            .string("Disabled"): .bool(true),
                            .string("Enabled"): .bool(false)
                        ]
                    ),
                    hideDefault: true,
                    defaultValue: .bool(false)
                ))
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTemplate = """
        const disabled = figma.properties.enum('State', {
        'Disabled': true,
        'Enabled': false
        })
        export default figma.swift`Button()\n    .someModifier()${disabled === false ? undefined : `\\n    .disabled(${disabled}) {\n        // Some trailing closure\n    }`} \n    .someOtherModifier()`
        """
        XCTAssertEqual(writer.createTemplate(), JSTemplateTestHelpers.templateWithInitialBoilerplate(expectedTemplate))
    }

    func test_figmaChildren() {
        let code = CodeBlockItemListSyntax(stringLiteral:
            """
            VStack {
                self.contents
            }
            """
        )

        let templateData = TemplateData(
            props: [
                "contents": .children(FigmaChildren(layerNames: ["A", "B"]))
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTemplate = """
        const contents = figma.properties.children(["A", "B"])
        export default figma.swift`VStack {\n${__fcc_renderSwiftChildren(contents, '    ')}\n}`
        """
        XCTAssertEqual(writer.createTemplate(), JSTemplateTestHelpers.templateWithInitialBoilerplate(expectedTemplate))
    }

    func test_propInClosure() {
        let code = CodeBlockItemListSyntax(stringLiteral:
            """
            VStack {
                self.icon
            }
            """
        )

        let templateData = TemplateData(
            props: [
                "icon": .propMap(PropMap(
                    kind: .instance,
                    args: PropMapArgs(figmaPropName: "Icon", valueMapping: nil),
                    hideDefault: false, defaultValue: nil
                ))
            ],
            imports: []
        )

        let writer = CodeConnectTemplateWriter(code: code, templateData: templateData)

        let expectedTemplate = """
        const icon = figma.properties.instance('Icon')
        export default figma.swift`VStack {\n${__fcc_renderSwiftChildren(icon, '    ')}\n}`
        """
        XCTAssertEqual(writer.createTemplate(), JSTemplateTestHelpers.templateWithInitialBoilerplate(expectedTemplate))
    }
}
