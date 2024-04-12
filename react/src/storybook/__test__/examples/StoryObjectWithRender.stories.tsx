import { StoryParameters, figma } from '../../../'
import { FunctionComponent } from './FunctionComponent'

export default {
  title: 'StoryObjectWithRender',
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

export const Default = {
  render: () => <FunctionComponent disabled={false}>Hello</FunctionComponent>,
}

export const Disabled = {
  render: () => {
    const someExtraCode = 'test'

    return <FunctionComponent disabled={true}>Hello</FunctionComponent>
  },
}

export const WithArgs = {
  render: (args) => {
    return (
      <FunctionComponent disabled={args.disabled}>
        Hello this line is long to cause it to wrap in brackets
      </FunctionComponent>
    )
  },
}
