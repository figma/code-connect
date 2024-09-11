import { FunctionComponent } from './FunctionComponent'
import figma, { StoryParameters } from '../../../react/index_react'
import React from 'react'

export default {
  title: 'FunctionComponent',
  component: FunctionComponent,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/test',
      examples: ['Default', 'WithArgs'],
      props: {
        disabled: figma.boolean('Disabled'),
      },
    },
  } satisfies StoryParameters,
}

export const Default = () => <FunctionComponent disabled={false}>Hello</FunctionComponent>

export const WithArgs = (args: { disabled: boolean }) => (
  <FunctionComponent disabled={args.disabled}>
    Hello this line is long to cause it to wrap in brackets
  </FunctionComponent>
)
