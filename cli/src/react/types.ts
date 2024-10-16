import { FigmaConnectMeta, ConnectedComponent } from '../connect/api'

// Converts our internal type for instances, which adds methods to it,
// to their underlying primitive type, so they can be used in examples.
// prettier-ignore
type MapType<T> =
  T extends ConnectedComponent ? JSX.Element :
  // Apply recursively to objects and arrays
  T extends object ? { [K in keyof T]: MapType<T[K]> } :
  T extends Array<infer U> ? MapType<U>[] :
  T

export type ReactMeta<P> = FigmaConnectMeta<
  P,
  MapType<P>,
  React.Component | JSX.Element | string | ((props: any) => JSX.Element)
> & {
  /**
   * A list of import statements that will render in the Code Snippet in Figma.
   * This overrides the auto-generated imports for the component. When this is specified,
   * the `importPaths` option in the config file is also ignored.
   */
  imports?: string[]
}
