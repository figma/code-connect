import { StoryParameters } from '../../../react/index_react'
import { FunctionComponent } from './FunctionComponent'
import React from 'react'

export default {
  title: 'FunctionComponent',
  component: FunctionComponent,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/test',
      examples: [Default],
    },
  } satisfies StoryParameters,
}

export function Default() {
  return <FunctionComponent disabled={false}>Hello</FunctionComponent>
}
