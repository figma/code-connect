import { ArrowComponent } from './ArrowComponent'
import { StoryParameters } from '../../../'

const meta = {
  title: 'ArrowComponent',
  component: ArrowComponent,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/test',
      examples: [Default],
    },
  } satisfies StoryParameters,
}

export default meta

export function Default() {
  return <ArrowComponent disabled={false}>Hello</ArrowComponent>
}
