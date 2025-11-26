import Foundation
import XCTest

@testable import CodeConnectParser

class CodeConnectParserInvalidJSTest: XCTestCase {
    func testDoubleWrappedTemplateVariables() throws {
        // Test that double wrapped template variables are fixed
        // Before this fix, the template would be rendered as ${${foo}} instead of ${foo}, which is invalid JavaScript
        // happens because the element _before_ it has hideDefault = true, so the template writer adds an extra wrapper.
        let expectedDoc = CodeConnectDoc(
            figmaNode: "https://figma.com/file/abc/Test?node-id=123",
            source: "See below",
            sourceLocation: CodeConnectDoc.SourceLocation(line: 141),
            component: "ListRowChevron",
            variant: [:],
            template: JSTemplateTestHelpers.templateWithInitialBoilerplate("""
            const disabled = figma.properties.enum('State', {
            'Active': false,
            'Disabled': true,
            'Hover': false,
            'Idle': false
            })
            const showDivider = figma.properties.boolean('Show divider', {
            'true': true,
            'false': false
            })
            const size = figma.properties.enum('Size', {
            'Large': '.large',
            'Medium': '.medium',
            'Small': '.small'
            })
            const title = figma.properties.string('Title')
            export default figma.swift`ListRowChevron {\n    Text(\"${title.replace(/\\n/g, \'\\\\n\')}\")\n}\n.size(${size})\n.paddingHorizontal(paddingHorizontal)${showDivider === false ? undefined : `\\n.divider(${showDivider})`}\n.disabled(${disabled})`
            """),
            templateData: TemplateData(
                props: [
                    "showDivider": .propMap(PropMap(
                        kind: .boolean,
                        args: PropMapArgs(
                            figmaPropName: "Show divider",
                            valueMapping: nil
                        ),
                        hideDefault: true,
                        defaultValue: .bool(false)
                    )),
                    "title": .propMap(PropMap(
                        kind: .string,
                        args: PropMapArgs(
                            figmaPropName: "Title",
                            valueMapping: nil
                        ),
                        hideDefault: false,
                        defaultValue: .string("\"Title\"")
                    )),
                    "disabled": .propMap(PropMap(
                        kind: .enumerable,
                        args: PropMapArgs(
                            figmaPropName: "State",
                            valueMapping: [
                                .string("Idle"): .bool(false),
                                .string("Active"): .bool(false),
                                .string("Disabled"): .bool(true),
                                .string("Hover"): .bool(false)
                            ]
                        ),
                        hideDefault: false,
                        defaultValue: .bool(false)
                    )),
                    "size": .propMap(PropMap(
                        kind: .enumerable,
                        args: PropMapArgs(
                            figmaPropName: "Size",
                            valueMapping: [
                                .string("Small"): .string(".small"),
                                .string("Large"): .string(".large"),
                                .string("Medium"): .string(".medium")
                            ]
                        ),
                        hideDefault: false,
                        defaultValue: .string(".small")
                    ))
                ],
                imports: [],
                nestable: true
            ),
            functionName: "ListRowChevron_connection"
        )

        let url = try XCTUnwrap(Bundle.module.url(forResource: "Samples.figma", withExtension: "test"))
        var figmadoc = try XCTUnwrap(CodeConnectParser.createCodeConnects([url], importMapping: [:]).docs.first(where: {
            $0.component == "ListRowChevron"
        }))

        // The source is not easily predictable as it depends on the location on disk,
        // so instead check it looks sensible, then set the doc's source to match the
        // expectation so we can still XCTAssertEqual instead of manually testing each field
        XCTAssertTrue(figmadoc.source.hasSuffix("/Samples.figma.test"))
        figmadoc.source = expectedDoc.source

        XCTAssertEqual(figmadoc, expectedDoc)
    }
}
