export type EnumValue =
  | string
  | boolean
  | number
  | symbol
  | undefined
  | JSX.Element
  | Function
  | Object

export interface FigmaConnectAPI {
  /**
   * Defines a code snippet that displays in Figma when a component is selected. This function has two signatures:
   * - When called with a component reference as the first argument, it will infer metadata such as the import statement
   * and location in source file from the component reference
   * - When called only with a Figma node URL, this metadata will not be included. This is useful when you want to display a code snippet
   * for something that isn't a React component, such as a `<button>` element
   *
   * @param component A reference to the React component
   * @param figmaNodeUrl A link to the node in Figma, for example:`https://www.figma.com/file/123abc/My-Component?node-id=123:456`
   * @param meta {@link FigmaConnectMeta}
   */
  connect<P = {}>(component: any, figmaNodeUrl: string, meta?: FigmaConnectMeta<P>): void

  /**
   * Defines a code snippet that displays in Figma when a component is selected. This function has two signatures:
   * - When called with a component reference as the first argument, it will infer metadata such as the import statement
   * and location in source file from the component reference
   * - When called only with a Figma node URL, this metadata will not be included. This is useful when you want to display a code snippet
   * for something that isn't a React component, such as a `<button>` element
   *
   * @param figmaNodeUrl A link to the node in Figma, for example:`https://www.figma.com/file/123abc/My-Component?node-id=123:456`
   * @param meta {@link FigmaConnectMeta}
   */
  connect<P = {}>(figmaNodeUrl: string, meta?: FigmaConnectMeta<P>): void

  /**
   * Maps a Figma property to a boolean value for the connected component. This prop is replaced
   * with values from the Figma instance when viewed in Dev Mode. For example:
   * ```ts
   * props: {
   *  disabled: figma.boolean('Disabled'),
   * }
   * ```
   * Would show the `disabled` property if the Figma property "Disabled" is true.
   *
   * @param figmaPropName The name of the property on the Figma component
   */
  boolean(figmaPropName: string): boolean

  /**
   * Maps a Figma boolean property to a set of values for the connected component, providing
   * a value mapping for `true` and `false`. This prop is replaced with values from the
   * Figma instance when viewed in Dev Mode. Example:
   * ```ts
   * props: {
   *  label: figma.boolean('Disabled', {
   *    true: <Label />,
   *    false: <HiddenLabel />
   *  }),
   * }
   * ```
   * Would replace `label` with `<Label />` if the Figma property "Disabled" is true.
   *
   * @param figmaPropName The name of the property on the Figma component
   * @param valueMapping A mapping of values for `true` and `false`
   */
  boolean<TrueT extends EnumValue, FalseT extends EnumValue>(
    figmaPropName: string,
    valueMapping?: {
      true?: TrueT
      false?: FalseT
    },
  ): ValueOf<Record<'true' | 'false', TrueT | FalseT>>

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
  instance(figmaPropName: string): JSX.Element

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
  children(layerNames: string | string[]): JSX.Element

  /**
   * Maps nested properties from a Figma instance layer. The first argument
   * should be the layer name of the nested instance. The mapping object passed
   * in is in the same format as the `props` object in the `connect` function.
   * For example:
   * ```ts
   * props: {
   *   nested: figma.nestedProps('Nested', {
   *     label: figma.string('Text'),
   *     icon: figma.instance('Icon'),
   *   }),
   * }
   * Which would then allow you to access the nested properties in the `example` function like so:
   * ```ts
   * (props) => <Button label={props.nested.label} icon={props.nested.icon} />
   * ```
   */
  nestedProps<V>(layer: string, input: V): V

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

// ExtraExampleT allows us to pass in an extra type to the `example` property,
// so that in Storybook, we can use strings to refer to non-hoisted functions
export interface FigmaConnectMeta<T = {}, ExtraExampleT = never> {
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
   * The code example to display in Figma. Any mapped `props` is passed to the component,
   * where those values will be replaced with the mapped value when inspecting that instance in Figma.
   * @param props
   * @returns
   */
  example?: ((props: T) => React.Component | JSX.Element) | ExtraExampleT

  /**
   * A list of import statements that will render in the Code Snippet in Figma.
   * This overrides the auto-generated imports for the component. When this is specified,
   * the `importPaths` option in the config file is also ignored.
   */
  imports?: string[]

  /**
   * A list of links that will display in Figma along with the examples
   */
  links?: FigmaConnectLink[]
}
