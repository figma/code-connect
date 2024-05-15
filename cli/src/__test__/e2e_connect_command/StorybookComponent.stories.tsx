import { StoryParameters } from '../..'
import { StorybookComponent } from './StorybookComponent'

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
