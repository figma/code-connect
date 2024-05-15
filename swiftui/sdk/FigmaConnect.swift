import SwiftUI

/// The protocol that defines what a Code Connect file needs to implement
public protocol FigmaConnect<Component>: View {
    associatedtype Component: View

    /// An optional set of variants that this component corresponds to in Figma.
    /// If multiple FigmaConnect files correspond to the same figmaNodeUrl, the one
    /// with the most matching variant properties in `variant` will be shown in Figma.
    /// Although the type is `[String: Any]`, a variant value can only be a `String` or `Bool`.
    var variant: [String: Any]? { get }
    /// Type of the component
    var component: Component.Type { get }
    /// URL pointing to the node in Figma
    var figmaNodeUrl: String { get }
}

public extension FigmaConnect {
    var variant: [String: Any]? { return nil }
}

/// Wraps a property to the corresponding property in Figma.
@propertyWrapper public struct FigmaProp<Value> {
    /// The underlying value that's being wrapped
    public var wrappedValue: Value
    /// The name of the component property in Figma
    let name: String
    /// A mapping of potential component properties in figma to values in code.
    let mapping: [String: Value]?

    /// If `true`, and the value of the usage of this prop is equivalent to the default value, the usage will be hidden. For example,
    /// consider the case where the default disabled state of a view is false.
    ///
    /// ```
    ///    @FigmaProp("Disabled", hideDefault: true)
    ///    var disabled: Bool = false
    ///
    ///    var body: some View {
    ///        MyView()
    ///            .disabled(self.disabled)
    ///    }
    /// ```
    /// If the component in Figma has `Disabled = false`, the resulting code will simply be `MyView()`
    let hideDefault: Bool

    public init(
        wrappedValue: Value,
        _ name: String,
        mapping: [String: Value]? = nil,
        hideDefault: Bool = false
    ) {
        self.wrappedValue = wrappedValue
        self.name = name
        self.mapping = mapping
        self.hideDefault = hideDefault
    }
}
