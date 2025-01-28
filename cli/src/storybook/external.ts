import { FigmaConnectMeta } from '../connect/api'

/**
 * Type for the Storybook `parameters` when using Figma Code Connect. This can
 * be used in your Storybook default export like:
 * ```
 * export default {
 *   // ...
 *   parameters: {
 *     // ...
 *   } satisfies StoryParameters,
 * }
 */
export type StoryParameters<T> = {
  design: {
    type: 'figma'
    /**
     * A link to the node in Figma, for example:`https://www.figma.com/file/123abc/My-Component?node-id=123:456`
     */
    url: string
    /**
     * Optional array of examples to show in Figma. If none are specified, Figma
     * will show a default code example.
     */
    examples?: (FigmaConnectMeta<T, T>['example'] | string | ExampleObject<T>)[]
    /**
     * A list of import statements that will render in the Code Snippet in Figma.
     */
    imports?: string[]
  } & Pick<FigmaConnectMeta, 'props' | 'links'>
}

type ExampleObject<T> = FigmaConnectMeta<T, T, unknown, string> & {
  variant?: FigmaConnectMeta['variant']
  links?: FigmaConnectMeta['links']
}
