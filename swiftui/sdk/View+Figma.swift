import SwiftUI

public extension View {
    /// Applies a transformation to a view based on the value of `figmaBoolean`
    /// This can be used to represent a mapping between a property in Figma to a complex condition in
    /// code. For example:
    ///
    /// ```
    /// struct MyComponent_doc: FigmaConnect {
    ///    ...
    ///    @FigmaProp("Type", mapping: ["Primary": true])
    ///    var isPrimary: Bool = false
    ///
    ///    var body: some View {
    ///         MyComponent()
    ///             .figmaApply(isPrimary) {
    ///                 $0.tint(.blue)
    ///             } elseApply {
    ///                 $0.tint(.clear)
    ///             }
    ///    }
    /// ```
    ///
    /// In Figma, if the value of `State` is `Primary`, the resultant code will show
    /// ```
    ///     MyComponent()
    ///         .tint(.blue)
    /// ```
    ///
    ///Otherwise, it will show:
    ///
    /// ```
    ///     MyComponent()
    ///         .tint(.clear)
    /// ```
    ///
    /// If `isFalse` is nil, then nothing will be shown.
    ///
    /// - Parameters:
    ///   - boolean: The boolean that is associated with a property mapping.
    ///   - isTrue: The transformation to apply if `boolean = true`
    ///   - isFalse: The transformation to apply if `boolean = false`
    func figmaApply<T: View>(
        _ figmaBoolean: Bool,
        _ isTrue: ((Self) -> T)?,
        elseApply isFalse: ((Self) -> T)? = nil
    ) -> some View {
        // No implementation, but is used by the parser
        return self
    }
}
