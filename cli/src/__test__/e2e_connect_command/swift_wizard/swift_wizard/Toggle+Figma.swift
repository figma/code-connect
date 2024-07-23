import Figma
import SwiftUI

struct Toggle_doc: FigmaConnect {
    let component = Toggle<AnyView>.self;

    let figmaNodeUrl = "https://www.figma.com/file/test/test?node-id=12-345"

    @State private var isOn = true
    var body: some View {
        Toggle(isOn: $isOn) {
            // Add a label here
        }
    }

}

#Preview {
    Toggle_doc()
}
