import { FigmaConnectAPI } from './common/api'
import * as figma from './common/external'
import * as StorybookTypes from './storybook/external'
import { FigmaConnectClient } from './client/figma_client'
import * as client from './client/external'

const _client: FigmaConnectClient = client
const _figma: FigmaConnectAPI = figma

export { _figma as figma, _client as client }
export default _figma

export type StoryParameters<T = {}> = StorybookTypes.StoryParameters<T>
