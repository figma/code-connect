import Foundation
import XCTest

@testable import CodeConnectParser

class CodeConnectParserTest: XCTestCase {
    func testParser() throws {
        let expectedDoc = CodeConnectDoc(
            figmaNode: "https://figma.com/file/abc/Test?node-id=123",
            source: "See below",
            sourceLocation: CodeConnectDoc.SourceLocation(line: 14),
            component: "FigmaButton",
            variant: ["Has Icon": .bool(true)],
            template: JSTemplateTestHelpers.templateWithInitialBoilerplate("""
            const buttonVariant = figma.properties.enum('👥 Variant', {
            'Destructive': 'ButtonVariant.danger',
            'FigJam': 'ButtonVariant.figjam',
            'Inverse': 'ButtonVariant.inverse',
            'Primary': 'ButtonVariant.primary',
            'Secondary Danger': 'ButtonVariant.secondaryDanger',
            'Secondary': 'ButtonVariant.secondary',
            'Success': 'ButtonVariant.success'
            })
            const disabled = figma.properties.boolean('🎛️ Disabled', {
            'true': true,
            'false': false
            })
            const icon = figma.properties.instance('Icon')
            const role = figma.properties.boolean('Is Destructive', {
            'false': '.none',
            'true': '.destructive'
            })
            const title = figma.properties.string('🎛️ Label')
            export default figma.swift`FigmaButton(\n    variant: ${buttonVariant},\n    role: ${role},\n    title: \"${title.replace(/\\n/g, \'\\\\n\')}\",\n    icon: ${__fcc_renderSwiftChildren(icon, \'\')}\n)\n.disabled(${disabled}) { ${__fcc_renderSwiftChildren(icon, \'\')} }`
            """),
            templateData: TemplateData(
                props: [
                    "buttonVariant": .propMap(PropMap(
                        kind: .enumerable,
                        args: PropMapArgs(
                            figmaPropName: "👥 Variant",
                            valueMapping: [
                                .string("Primary"): .string("ButtonVariant.primary"),
                                .string("Destructive"): .string("ButtonVariant.danger"),
                                .string("Secondary"): .string("ButtonVariant.secondary"),
                                .string("FigJam"): .string("ButtonVariant.figjam"),
                                .string("Secondary Danger"): .string("ButtonVariant.secondaryDanger"),
                                .string("Inverse"): .string("ButtonVariant.inverse"),
                                .string("Success"): .string("ButtonVariant.success")
                            ]
                        ),
                        hideDefault: false,
                        defaultValue: .string(".primary"))
                    ),
                    "title": .propMap(PropMap(
                        kind: .string,
                        args: PropMapArgs(
                            figmaPropName: "🎛️ Label",
                            valueMapping: nil
                        ),
                        hideDefault: false,
                        defaultValue: .string("\"Submit\"")
                    )),
                    "disabled": .propMap(PropMap(
                        kind: .boolean,
                        args: PropMapArgs(
                            figmaPropName: "🎛️ Disabled",
                            valueMapping: nil
                        ),
                        hideDefault: false,
                        defaultValue: .bool(false)
                    )),
                    "role": .propMap(PropMap(
                        kind: .boolean,
                        args: PropMapArgs(
                            figmaPropName: "Is Destructive",
                            valueMapping: [
                                .bool(true): .string(".destructive"),
                                .bool(false): .string(".none"),
                            ]
                        ),
                        hideDefault: false,
                        defaultValue: .string(".none")
                    )),
                    "icon": .propMap(PropMap(
                        kind: .instance,
                        args: PropMapArgs(
                            figmaPropName: "Icon",
                            valueMapping: nil
                        ),
                        hideDefault: false,
                        defaultValue: .null
                    ))
                ],
                imports: [],
                nestable: true
            )
        )

        let url = try XCTUnwrap(Bundle.module.url(forResource: "Button.figma", withExtension: "test"))
        var figmadoc = try XCTUnwrap(CodeConnectParser.createCodeConnects([url], importMapping: [:]).docs.first(where: {
            $0.component == "FigmaButton"
        }))

        // The source is not easily predictable as it depends on the location on disk,
        // so instead check it looks sensible, then set the doc's source to match the
        // expectation so we can still XCTAssertEqual instead of manually testing each field
        XCTAssertTrue(figmadoc.source.hasSuffix("/Button.figma.test"))
        figmadoc.source = expectedDoc.source

        XCTAssertEqual(figmadoc, expectedDoc)
    }
    
    func testLegacyParser() throws {
        let expectedDoc = CodeConnectDoc(
            figmaNode: "https://figma.com/file/abc/Test?node-id=123",
            source: "See below",
            sourceLocation: CodeConnectDoc.SourceLocation(line: 68),
            component: "LegacyFigmaButton",
            variant: ["Has Icon": .bool(true)],
            template: JSTemplateTestHelpers.templateWithInitialBoilerplate("""
            const buttonVariant = figma.properties.enum('👥 Variant', {
            'Destructive': 'ButtonVariant.danger',
            'FigJam': 'ButtonVariant.figjam',
            'Inverse': 'ButtonVariant.inverse',
            'Primary': 'ButtonVariant.primary',
            'Secondary Danger': 'ButtonVariant.secondaryDanger',
            'Secondary': 'ButtonVariant.secondary',
            'Success': 'ButtonVariant.success'
            })
            const disabled = figma.properties.boolean('🎛️ Disabled', {
            'true': true,
            'false': false
            })
            const title = figma.properties.string('🎛️ Label')
            export default figma.swift`FigmaButton(variant: ${buttonVariant}, title: "${title.replace(/\\n/g, \'\\\\n\')}").disabled(${disabled})`
            """),
            templateData: TemplateData(
                props: [
                    "buttonVariant": .propMap(PropMap(
                        kind: .enumerable,
                        args: PropMapArgs(
                            figmaPropName: "👥 Variant",
                            valueMapping: [
                                .string("Primary"): .string("ButtonVariant.primary"),
                                .string("Destructive"): .string("ButtonVariant.danger"),
                                .string("Secondary"): .string("ButtonVariant.secondary"),
                                .string("FigJam"): .string("ButtonVariant.figjam"),
                                .string("Secondary Danger"): .string("ButtonVariant.secondaryDanger"),
                                .string("Inverse"): .string("ButtonVariant.inverse"),
                                .string("Success"): .string("ButtonVariant.success")
                            ]
                        ),
                        hideDefault: false,
                        defaultValue: .string(".primary"))
                    ),
                    "title": .propMap(PropMap(
                        kind: .string,
                        args: PropMapArgs(
                            figmaPropName: "🎛️ Label",
                            valueMapping: nil
                        ), 
                        hideDefault: false,
                        defaultValue: .string("\"Submit\"")
                    )),
                    "disabled": .propMap(PropMap(
                        kind: .boolean,
                        args: PropMapArgs(
                            figmaPropName: "🎛️ Disabled",
                            valueMapping: nil
                        ),
                        hideDefault: false,
                        defaultValue: .bool(false)
                    ))
                ],
                imports: [],
                nestable: true
            )
        )

        let url = try XCTUnwrap(Bundle.module.url(forResource: "Button.figma", withExtension: "test"))
        var figmadoc = try XCTUnwrap(CodeConnectParser.createCodeConnects([url], importMapping: [:]).docs.first(where: { $0.component == "LegacyFigmaButton"}))

        // The source is not easily predictable as it depends on the location on disk,
        // so instead check it looks sensible, then set the doc's source to match the
        // expectation so we can still XCTAssertEqual instead of manually testing each field
        XCTAssertTrue(figmadoc.source.hasSuffix("/Button.figma.test"))
        figmadoc.source = expectedDoc.source

        XCTAssertEqual(figmadoc, expectedDoc)
    }
    
    func testMultilineBodyDefinitionsAreNotNestable() throws {
        let expectedDoc = CodeConnectDoc(
            figmaNode: "https://figma.com/file/abc/Test?node-id=123",
            source: "",
            sourceLocation: CodeConnectDoc.SourceLocation(line: 0),
            component: "AnyView",
            variant: [:],
            template: JSTemplateTestHelpers.templateWithInitialBoilerplate("""
            export default figma.swift`@State var isOn = true\n\nElementWithBinding(isOn: $isOn)`
            """),
            templateData: TemplateData(
                props: [:],
                imports: [],
                nestable: false
            )
        )

        let url = try XCTUnwrap(Bundle.module.url(forResource: "Button.figma", withExtension: "test"))
        let figmadoc = try XCTUnwrap(CodeConnectParser.createCodeConnects([url], importMapping: [:])).docs.first(where: { $0.component == "AnyView" })

        XCTAssertEqual(figmadoc, expectedDoc)
    }
}
