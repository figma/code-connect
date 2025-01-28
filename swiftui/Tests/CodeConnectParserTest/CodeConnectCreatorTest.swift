import Foundation
import XCTest

@testable import CodeConnectParser

class CodeConnectUploaderTest: XCTestCase {

    func testCodeConnectUploadCreatesValidDefinition() throws {
        let component = Component(
            name: "Button",
            id: "123",
            type: .component,
            componentProperties: [
                "isDisabled": ComponentProperty(
                    defaultValue: .a(false),
                    type: .boolean,
                    variantOptions: nil
                ),
                "text": ComponentProperty(
                    defaultValue: .b("Submit"),
                    type: .text,
                    variantOptions: nil
                ),
                "variant": ComponentProperty(
                    defaultValue: nil,
                    type: .variant,
                    variantOptions: ["primary", "secondary"]
                )
            ]
        )

        let figmadoc = try XCTUnwrap(CodeConnectCreator.convertComponentToCodeConnectFile(component, url: "https://www.figma.com/file/123/456"))

        XCTAssertEqual(
            figmadoc.formatted().description,
            """
            import SwiftUI
            import Figma

            struct Button_doc: FigmaConnect {
                let component = Button.self
                let figmaNodeUrl = "https://www.figma.com/file/123/456"

                /*
                Use @FigmaString, @FigmaEnum, @FigmaBoolean and @FigmaInstance property wrappers to connect Figma properties to code

                @FigmaBoolean("isDisabled")
                var isDisabled: Bool = false

                @FigmaString("text")
                var text: String = "Submit"

                @FigmaEnum("variant", mapping: ["primary": .primary, "secondary": .secondary])
                var variant: ButtonVariant = .primary // An enum type and default value is required here
                */

                var body: some View {
                    // Add your code example here by returning a View
                    Button()
                }
            }
            """
        )
    }

    func testCodeConnectUploadCreatesValidDefinitionWhenNoVariantOptionsSupplied() throws {
        let component = Component(
            name: "Button",
            id: "123",
            type: .component,
            componentProperties: [
                "variant": ComponentProperty(
                    defaultValue: nil,
                    type: .variant,
                    variantOptions: nil
                )
            ]
        )

        let figmadoc = try XCTUnwrap(CodeConnectCreator.convertComponentToCodeConnectFile(component, url: "https://www.figma.com/file/123/456"))

        XCTAssertEqual(
            figmadoc.formatted().description,
            """
            import SwiftUI
            import Figma

            struct Button_doc: FigmaConnect {
                let component = Button.self
                let figmaNodeUrl = "https://www.figma.com/file/123/456"

                /*
                Use @FigmaString, @FigmaEnum, @FigmaBoolean and @FigmaInstance property wrappers to connect Figma properties to code
            
                @FigmaEnum("variant")
                var variant: ButtonVariant = nil // An enum type and default value is required here
                */

                var body: some View {
                    // Add your code example here by returning a View
                    Button()
                }
            }
            """
        )
    }
}
