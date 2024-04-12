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
            template: "const figma = require(\'figma\')\n\nconst buttonVariant = figma.properties.enum(\'👥 Variant\', {\n\'Destructive\': \'ButtonVariant.danger\',\n\'FigJam\': \'ButtonVariant.figjam\',\n\'Inverse\': \'ButtonVariant.inverse\',\n\'Primary\': \'ButtonVariant.primary\',\n\'Secondary Danger\': \'ButtonVariant.secondaryDanger\',\n\'Secondary\': \'ButtonVariant.secondary\',\n\'Success\': \'ButtonVariant.success\'\n})\nconst disabled = figma.properties.boolean(\'🎛️ Disabled\')\nconst title = figma.properties.string(\'🎛️ Label\')\nexport default figma.swift`FigmaButton(variant: ${buttonVariant}, title: \"${title}\").disabled(${disabled})\n`",
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
                        )
                    ),
                    "title": PropMap(
                        kind: .string,
                        args: PropMapArgs(
                            figmaPropName: "🎛️ Label",
                            valueMapping: nil
                        )
                    ),
                    "disabled": PropMap(
                        kind: .boolean,
                        args: PropMapArgs(
                            figmaPropName: "🎛️ Disabled",
                            valueMapping: nil
                        )
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
