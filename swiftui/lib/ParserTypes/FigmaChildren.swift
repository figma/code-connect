#if os(macOS)
import Foundation

public struct FigmaChildren: Encodable, Equatable {
    struct Args: Encodable, Equatable {
        let layers: [String]
    }
    let kind = "children"
    let args: Args
    
    init(layers: [String]) {
        self.args = Args(layers: layers)
    }
}

#endif
