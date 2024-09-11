import { ArrowComponent } from './ArrowComponent'
import React from 'react'

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
