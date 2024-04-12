import { FigmaConnectAPI } from './common/api'
import * as figma from './common/external'
import * as StorybookTypes from './storybook/external'

const _figma: FigmaConnectAPI = figma

export { _figma as figma }
export default _figma

export type StoryParameters<T = {}> = StorybookTypes.StoryParameters<T>
