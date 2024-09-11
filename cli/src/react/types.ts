import { FigmaConnectMeta } from '../connect/api'

export type ReactMeta<P> = FigmaConnectMeta<P, React.Component | JSX.Element> & {
  /**
   * A list of import statements that will render in the Code Snippet in Figma.
   * This overrides the auto-generated imports for the component. When this is specified,
   * the `importPaths` option in the config file is also ignored.
   */
  imports?: string[]
}
