#if os(macOS)
import Foundation

public struct FigmaChildren: Encodable, Equatable {
    struct Args: Encodable, Equatable {
        let layerNames: [String]
    }
    let kind = "children"
    let args: Args
    
    init(layerNames: [String]) {
        self.args = Args(layerNames: layerNames)
    }
}

#endif
