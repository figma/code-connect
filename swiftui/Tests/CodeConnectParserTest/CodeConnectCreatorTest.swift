import Foundation
import XCTest

@testable import CodeConnectParser

class CodeConnectUploaderTest: XCTestCase {

    func testCodeConnectUploader() throws {
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
            import Figma

            struct Button_doc: FigmaConnect {
                let component = Button.self
                let figmaNodeUrl = "https://www.figma.com/file/123/456"

                /*
                Use @FigmaProp property wrappers to connect Figma properties to code

                @FigmaProp("isDisabled")
                var isDisabled: Bool = false

                @FigmaProp("text")
                var text: String = "Submit"

                @FigmaProp("variant", mapping: ["primary": primary, "secondary": secondary])
                var variant: Any
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
