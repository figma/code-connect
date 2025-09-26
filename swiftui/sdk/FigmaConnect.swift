import SwiftUI

/// The protocol that defines what a Code Connect file needs to implement
@MainActor
public protocol FigmaConnect: View {
    associatedtype Component: View = AnyView

    /// An optional set of variants that this component corresponds to in Figma.
    /// If multiple FigmaConnect files correspond to the same figmaNodeUrl, the one
    /// with the most matching variant properties in `variant` will be shown in Figma.
    /// Although the type is `[String: Any]`, a variant value can only be a `String` or `Bool`.
    var variant: [String: Any]? { get }
    /// Type of the component
    var component: Component.Type? { get }
    /// URL pointing to the node in Figma
    var figmaNodeUrl: String { get }
}

public extension FigmaConnect {
    var variant: [String: Any]? { return nil }
    var component: Component.Type? { return nil }
}
