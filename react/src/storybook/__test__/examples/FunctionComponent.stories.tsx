import { StoryParameters } from '../../..'
import { FunctionComponent } from './FunctionComponent'

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
