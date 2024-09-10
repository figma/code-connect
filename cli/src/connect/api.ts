export type EnumValue =
  | string
  | boolean
  | number
  | symbol
  | undefined
  | JSX.Element
  | Function
  | Object

// This contains the base API interface for figma.connect calls across React and
// HTML. Any parts which are platform-specific (either the function signature or
// its docblock) are specified in the individual index_<platform> and added to
// this using union typing.
//
// To override a docblock, all signatures of that function must be moved into
// the platform-specific index file.
export interface FigmaConnectAPI<InstanceChildrenT> {
  /**
   * Maps a Figma Variant property to a set if values for the connected component. This prop is replaced
   * with values from the Figma instance when viewed in Dev Mode. For example:
   * ```ts
   * props: {
   *  type: figma.enum('Type', {
   *    Primary: 'primary',
   *     Secondary: 'secondary',
   *  }),
   * }
   * ```
   * Would output "primary" if the Type Variant in Figma is set to "Primary".
   *
   * @param figmaPropName The name of the property on the Figma component
   * @param valueMapping A mapping of values for the Figma Variant
   */
  enum<V extends EnumValue>(figmaPropName: string, valueMapping: Record<string, V>): V

  /**
   * Maps a Figma property to a string value for the connected component. This prop is replaced
   * with values from the Figma instance when viewed in Dev Mode. For example:
   * ```ts
   * props: {
   *  text: figma.string('Text'),
   * }
   * ```
   * Would replace `text` with the text content from the Figma property "Text".
   *
   * @param figmaPropName The name of the property on the Figma component
   */
  string(figmaPropName: string): string

  /**
   * Maps a Figma instance property for the connected component. This prop is replaced
   * with values from the Figma instance when viewed in Dev Mode. For example:
   * ```ts
   * props: {
   *  icon: figma.instance('Icon'),
   * }
   * ```
   * Would show the nested examples for the component passed to the "Icon" property in Figma.
   *
   * @param figmaPropName The name of the property on the Figma component
   */
  instance(figmaPropName: string): InstanceChildrenT

  /**
   * Maps a Figma instance layer to a nested code example. For example:
   * ```ts
   * props: {
   *  icon: figma.children('Icon')
   * }
   * ```
   * Would show the nested code example for the child instance named 'Icon'. This also supports
   * an array: `tabs: figma.children(['Tab 1', 'Tab 2'])` to map multiple nested examples.
   *
   * You can pass a single wildcard '*' character to match partial names. For example:
   * ```ts
   * props: {
   *   icon: figma.children('Icon*')
   * }
   * ```
   * Would show the nested code example for any child instance which name starts with "Icon"
   *
   * @param figmaPropName The name of the property on the Figma component
   */
  children(layerNames: string | string[]): InstanceChildrenT

  /**
   * Creates a className string by joining an array of strings. The argument supports both
   * string literals and nested functions like `figma.enum` and `figma.boolean` that return
   * a string. For example:
   * ```ts
   * props: {
   *   className: figma.className([
   *     'btn-base',
   *     figma.enum('Size', { Large: 'btn-large' }),
   *     figma.boolean('Disabled', { true: 'btn-disabled', false: '' }),
   *   ]),
   * }
   *
   * @param className
   */
  className(className: (string | undefined)[]): string

  /**
   * Maps a Figma text layer to a string value representing the text content of that layer.
   * This function takes the layer name within the original component as its parameter.
   * For example:
   * ```ts
   * props: {
   *  text: figma.textContent('Text Layer')
   * }
   * ```
   *
   * @param layer The name of the text layer in the Figma component
   */
  textContent(layer: string): string
}

export type ValueOf<T> = T[keyof T]

export type PropMapping<T> = {
  [key in keyof T]: T[key]
}

export interface FigmaConnectLink {
  name: string
  url: string
}

export interface FigmaConnectMeta<T = {}, ExampleFnReturnT = unknown> {
  /**
   * Restricts this figma connect to any variants that fullfill the given filter.
   * The filter is a map of Figma variant names to values. Example:
   * ```ts
   * {
   *  variant: { "Has Icon": true }
   * }
   */
  variant?: Record<string, string | boolean | number>

  /**
   * Prop mappings for the connected component. This is used to map the values of the component's props
   * to the values that are used in Figma, using helper functions like `Figma.boolean`. For example:
   * ```ts
   * props: {
   *   disabled: figma.boolean('Disabled'),
   *   text: figma.string('Text'),
   *   size: figma.enum('Size', {
   *     slim: 'slim',
   *     medium: 'medium',
   *     large: 'large',
   *   }),
   * }
   */
  props?: T

  /**
   * The code example to display in Figma. Any mapped `props` are passed to the component,
   * where those values will be replaced with the mapped value when inspecting that instance in Figma.
   * @param props
   * @returns
   */
  example?: (props: T) => ExampleFnReturnT

  /**
   * A list of links that will display in Figma along with the examples
   */
  links?: FigmaConnectLink[]
}
