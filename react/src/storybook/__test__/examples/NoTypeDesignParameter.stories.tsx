import { ArrowComponent } from './ArrowComponent'

export default {
  title: 'ArrowComponent',
  component: ArrowComponent,
  parameters: {
    design: {
      url: 'xxx',
    },
  },
}

export function Default() {
  return <ArrowComponent disabled={false}>Hello</ArrowComponent>
}
