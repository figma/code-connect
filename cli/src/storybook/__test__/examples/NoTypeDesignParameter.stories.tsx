import { ArrowComponent } from './ArrowComponent'
import React from 'react'

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
