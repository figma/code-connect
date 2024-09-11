import { StoryParameters, figma } from '../../../react/index_react'
import { FunctionComponent } from './FunctionComponent'
import React from 'react'

export default {
  title: 'FunctionComponent',
  component: FunctionComponent,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/test',
      examples: [Default, WithLogic, WithArgs],
      props: {
        disabled: figma.boolean('Disabled'),
      },
    },
  } satisfies StoryParameters<{ disabled: boolean }>,
}

export function Default() {
  return <FunctionComponent disabled={false}>Hello</FunctionComponent>
}

export function WithLogic() {
  const someExtraCode = 'test'

  return <FunctionComponent disabled={true}>Hello</FunctionComponent>
}

export function WithArgs(args: { disabled: boolean }) {
  return (
    <FunctionComponent disabled={args.disabled}>
      Hello this line is long to cause it to wrap in brackets
    </FunctionComponent>
  )
}
