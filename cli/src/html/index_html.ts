// IMPORTANT: be careful to ensure you don't accidentally add code which has a
// dependency on Node.js-only modules here, as it will break co-located
// components. We don't have a test for this yet. Any such code should be
// conditionally required - see `client` for an example. Reach out in
// #feat-code-connect if you're unsure.

import { EnumValue, FigmaConnectAPI, FigmaConnectMeta, ValueOf } from '../connect/api'
import * as figma from './external'
import { FigmaConnectClient } from '../client/figma_client'
import { html, HtmlTemplateString } from './template_literal'
import { getClient } from '../connect/index_common'
import { HtmlMeta } from './types'

const _client: FigmaConnectClient = getClient()
const _figma: FigmaConnectAPI<HtmlTemplateString, HtmlTemplateString> & {
  /**
   * Defines a code snippet that displays in Figma when a component is selected.
   *
   * @param figmaNodeUrl A link to the node in Figma, for example:`https://www.figma.com/file/123abc/My-Component?node-id=123:456`
   * @param meta {@link FigmaConnectMeta}
   */
  connect<P = {}>(figmaNodeUrl: string, meta: HtmlMeta<P>): void

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
   * Maps a Figma boolean property to a set of values for the connected
   * component, providing a value mapping for `true` and `false`. This prop is
   * replaced with values from the Figma instance when viewed in Dev Mode.
   * Example:
   * ```ts
   * props: {
   *  label: figma.boolean('Disabled', {
   *    true: <my-label></my-label>,
   *    false: <my-disabled-label></my-disabled-label>,
   *  }),
   * }
   * ```
   * Would replace `label` with `<my-label></my-label>` if the Figma property
   * "Disabled" is true.
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
   * ```
   *
   * Which would then allow you to access the nested properties in the `example` function like so:
   * ```ts
   * (props) => html`<my-button label=${props.nested.label}>${props.nested.icon}</my-button>`
   * ```
   */
  nestedProps<V>(layer: string, input: V): V

  /**
   * A list of import statements that will render in the Code Snippet in Figma.
   */
  imports?: string[]
} = figma
const _html = html

export { _figma as figma, _client as client, _html as html }
export default _figma
