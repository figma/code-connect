import SwiftUI

/// Wraps a property to a corresponding string property in Figma. The resultant string where the wrapped
/// property is used will take on the value of the string property in Figma.
///
/// For example, to map a string property `Label` to a parameter that takes a String in code, you would write:
///  ```
///    @FigmaString("Label")
///    var label: MyLabel = "Submit"
///
///    var body: some View {
///        MyLabel(self.label)
///    }
/// ```
/// The snippet rendered in Figma will replace self.label with the value of the Figma property `Label`
@propertyWrapper public struct FigmaString {
    /// The underlying value that's being wrapped
    public var wrappedValue: String
    /// The name of the component property in Figma
    let name: String

    public init(
        wrappedValue: String,
        _ name: String
    ) {
        self.wrappedValue = wrappedValue
        self.name = name
    }
}

/// Wraps a property in Figma and maps it to a corresponding mapping in code. This is used for Variant properties
/// in Figma where the value of the variant corresponds to a specific value in code.
///
/// For example, to map a variant in Figma `Style` that has options `Primary` and `Secondary` to the corresponding variant in 
/// code you would write:
///
///  ```
///     @FigmaEnum(
///         "Style",
///         mapping: [
///             "Primary": MyViewStyle.primary,
///             "Secondary": MyViewStyle.secondary
///         ]
///     )
///     var style: MyViewStyle = .primary
///
///     var body: some View {
///         MyView()
///             .style(self.style)
///     }
/// ```
/// The snippet rendered in Figma will replace `self.style`  with `MyViewStyle.primary`  or `MyViewStyle.secondary`
/// if the `Style` variant is `Primary` or `Secondary` respectively.
@propertyWrapper public struct FigmaEnum<Value> {
    /// The underlying value that's being wrapped
    public var wrappedValue: Value
    /// The name of the component property in Figma
    let name: String
    /// A mapping of potential variant names in figma to values in code.
    let mapping: [String: Value]

    /// If `true`, and the value of the usage of this prop is equivalent to the default value, the usage will be hidden. For example,
    /// consider the case where the default disabled state of a view is false.
    ///
    /// ```
    ///     @FigmaEnum(
    ///         "Style",
    ///         mapping: [
    ///             "Primary": .primary,
    ///             "Secondary": .secondary
    ///         ],
    ///         hideDefault: true
    ///     )
    ///     var style: MyViewStyle = .primary
    ///
    ///     var body: some View {
    ///         MyView()
    ///             .style(self.style)
    ///     }
    /// ```
    /// If the component in Figma has `ButtonStyle = Primary`, the resulting code will simply be `MyView()`.
    let hideDefault: Bool

    public init(
        wrappedValue: Value,
        _ name: String,
        mapping: [String: Value],
        hideDefault: Bool = false
    ) {
        self.wrappedValue = wrappedValue
        self.name = name
        self.mapping = mapping
        self.hideDefault = hideDefault
    }
}

/// Wraps a property to the corresponding boolean property in Figma. This can be used to map boolean values to values in code.
/// By default, this maps the boolean values in Figma to the corresponding `Bool` in Swift.
///
/// For example, to map a boolean property `Disabled` to a parameter that takes a `Bool` in code, you would write:
///  ```
///     @FigmaBoolean("Disabled")
///     var disabled: Bool = false
///
///     var body: some View {
///         MyView()
///             .disabled(self.disabled)
///
///     }
/// ```
/// The snippet rendered in Figma will replace `self.disabled` with the value of the Figma property `Disabled`
///
/// Booleans might map to values that aren't booleans directly. In these situations, you can use the `mapping` property to define
/// a relationship between a boolean in Figma to an arbitrary value. For example, to map a parameter that is used to define
/// the role of a button you would write:
///  ```
///     @FigmaBoolean(
///         "Is Destructive",
///         mapping: [
///             true: MyButtonRole.destructive,
///             false: MyButtonRole.none
///         ],
///         hideDefault: true
///     )
///     var buttonRole: MyButtonRole = .none
///
///     var body: some View {
///         MyButton(role: self.buttonRole)
///     }
/// ```
/// The snippet rendered in Figma will replace `self.buttonRole` with `MyButtonRole.destructive` when
/// `Is Destructive` is `true`, and `MyButtonRole.none` when `Is Destructive` is `false`.
@propertyWrapper public struct FigmaBoolean<Value> {
    /// The underlying value that's being wrapped
    public var wrappedValue: Value
    /// The name of the component property in Figma
    let name: String
    /// A mapping of boolean values in figma to values in code. If this is nil,
    /// the value of the boolean property in Figma will be used as the value in code.
    let mapping: [Bool: Value]?

    /// If `true`, and the value of the usage of this prop is equivalent to the default value, the usage will be hidden. For example,
    /// consider the case where the default disabled state of a view is false.
    ///
    /// ```
    ///    @FigmaBoolean("Disabled", hideDefault: true)
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
        mapping: [Bool: Value]? = nil,
        hideDefault: Bool = false
    ) {
        self.wrappedValue = wrappedValue
        self.name = name
        self.mapping = mapping
        self.hideDefault = hideDefault
    }
}

/// Wraps a property that corresponds to an Instance Swap property in Figma. If the instance that is being swapped to contains its own
/// Code Connect file, it will be rendered inline or shown as a link to the corresponding Code Connect snippet.
///
/// For example, to map an icon property to an instance swapped icon you would write:
///
///  ```
///     @FigmaInstance("Icon")
///     var icon: MyIcon? = nil
///
///     var body: some View {
///         MyButton(role: self.buttonRole) {
///             // Some action
///         } icon: {
///             self.icon
///         }
///     }
/// ```
/// In Figma, self.icon will be replaced with the example that should be rendered for the specific `Icon` instance if it exists.
@propertyWrapper public struct FigmaInstance<Value> {
    /// The underlying value that's being wrapped
    public var wrappedValue: Value
    /// The name of the component property in Figma
    let name: String

    public init(
        wrappedValue: Value,
        _ name: String
    ) {
        self.wrappedValue = wrappedValue
        self.name = name
    }
}

/// `FigmaChildren` is a property wrapper used to map child instances of a Figma component that are not bound to an instance-swap property.
///
/// For example,
///```
/// @FigmaChildren(layers: ["Header", "Row"])
/// var contents: AnyView? = nil
///
/// var body: some View {
///     VStack {
///         self.contents
///     }
/// }
/// ```
///
/// In Figma, the nested Code Connect files with layer names "Header" or "Row" will be rendered inside of the `VStack` according to their arrangement in the design.
///
/// Note: The nested instance must be connected separately.
@propertyWrapper public struct FigmaChildren<Value> {
    public var wrappedValue: Value
    let layers: [String]

    public init(wrappedValue: Value, layers: [String]) {
        self.wrappedValue = wrappedValue
        self.layers = layers
    }
}


/// Wraps a property to the corresponding property in Figma.
@available(*, deprecated, message: "Use @FigmaBoolean, @FigmaString, @FigmaEnum or @FigmaInstance instead.")
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
