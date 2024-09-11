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
      examples: ['Default', 'Disabled', 'WithArgs'],
      props: {
        disabled: figma.boolean('Disabled'),
      },
    },
  } satisfies StoryParameters,
}

export const Default = () => {
  return <FunctionComponent disabled={false}>Hello</FunctionComponent>
}

export const Disabled = () => {
  const someExtraCode = 'test'

  return <FunctionComponent disabled={true}>Hello</FunctionComponent>
}

export const WithArgs = (args: { disabled: boolean }) => {
  return (
    <FunctionComponent disabled={args.disabled}>
      Hello this line is long to cause it to wrap in brackets
    </FunctionComponent>
  )
}
