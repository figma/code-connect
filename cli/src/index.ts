// IMPORTANT: be careful to ensure you don't accidentally add code which has a
// dependency on Node.js-only modules here, as it will break co=located
// components. We don't have a test for this yet. Any such code should be
// conditionally required - see `client` for an example. Reach out in
// #feat-code-connect if you're unsure.

import { FigmaConnectAPI } from './common/api'
import * as figma from './common/external'
import * as StorybookTypes from './storybook/external'
import { FigmaConnectClient } from './client/figma_client'

// `client/external`'s dependency chain ends up including code which is not safe
// in a browser context, e.g. `child_process`. This would mean that if you
// co-locate your Code Connect with React components, your app will be broken in
// a browser, because of this import chain.
//
// To get around this, we only import `client/external` if you are in a Node
// context – it is only used for the icon script, so none of the code which runs
// in the browser should touch it.
//
// Note that you may still see messages from the JS bundler about Node modules,
// but these won't be included at runtime.
let client: FigmaConnectClient = {} as any
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  client = require('./client/external')
}

const _client: FigmaConnectClient = client
const _figma: FigmaConnectAPI = figma

export { _figma as figma, _client as client }
export default _figma

export type StoryParameters<T = {}> = StorybookTypes.StoryParameters<T>
