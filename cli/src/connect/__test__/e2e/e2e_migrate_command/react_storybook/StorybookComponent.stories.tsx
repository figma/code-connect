import { StoryParameters } from '../../../../../react/index_react'
import { StorybookComponent } from './StorybookComponent'
import React from 'react'

export default {
  title: 'StorybookComponent',
  component: StorybookComponent,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/test',
      examples: ['Default'],
    },
  } satisfies StoryParameters,
}

export function Default() {
  return <StorybookComponent disabled={false}>Hello</StorybookComponent>
}
