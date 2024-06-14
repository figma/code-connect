import Foundation
import XCTest

@testable import CodeConnectParser

class CodeConnectParserTest: XCTestCase {
    func testParser() throws {
        let expectedRequestBody = CodeConnectRequestBody(
            figmaNode: "https://figma.com/file/abc/Test?node-id=123",
            source: "",
            sourceLocation: CodeConnectRequestBody.SourceLocation(line: 14),
            component: "FigmaButton",
            variant: ["Has Icon": .bool(true)],
            template: """
            const figma = require('figma')

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
            export default figma.swift`FigmaButton(variant: ${buttonVariant}, title: "${title}").disabled(${disabled})
            `
            """,
            templateData: TemplateData(
                props: [
                    "buttonVariant": PropMap(
                        kind: .enumerable,
                        args: PropMapArgs(
                            figmaPropName: "👥 Variant",
                            valueMapping: [
                                "Primary": .string("ButtonVariant.primary"),
                                "Destructive": .string("ButtonVariant.danger"),
                                "Secondary": .string("ButtonVariant.secondary"),
                                "FigJam": .string("ButtonVariant.figjam"),
                                "Secondary Danger": .string("ButtonVariant.secondaryDanger"),
                                "Inverse": .string("ButtonVariant.inverse"),
                                "Success": .string("ButtonVariant.success")
                            ]
                        ),
                        hideDefault: false,
                        defaultValue: .string(".primary")
                    ),
                    "title": PropMap(
                        kind: .string,
                        args: PropMapArgs(
                            figmaPropName: "🎛️ Label",
                            valueMapping: nil
                        ), 
                        hideDefault: false,
                        defaultValue: .string("\"Submit\"")
                    ),
                    "disabled": PropMap(
                        kind: .boolean,
                        args: PropMapArgs(
                            figmaPropName: "🎛️ Disabled",
                            valueMapping: nil
                        ),
                        hideDefault: false,
                        defaultValue: .bool(false)
                    )
                ],
                imports: []
            )
        )

        let url = try XCTUnwrap(Bundle.module.url(forResource: "Button.figma", withExtension: "test"))
        let figmadoc = try XCTUnwrap(CodeConnectParser.createCodeConnects([url], importMapping: [:], sourceControlPath: nil).codeConnectFiles.first)

        XCTAssertEqual(figmadoc, expectedRequestBody)
    }
}
