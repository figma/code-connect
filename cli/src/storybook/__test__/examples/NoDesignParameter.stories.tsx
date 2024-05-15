import { ArrowComponent } from './ArrowComponent'

export default {
  title: 'ArrowComponent',
  component: ArrowComponent,
  parameters: {
    somethingElse: true,
  },
}

export function Default() {
  return <ArrowComponent disabled={false}>Hello</ArrowComponent>
}
