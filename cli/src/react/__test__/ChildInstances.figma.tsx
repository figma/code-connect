import * as React from 'react'
import { figma } from '../index_react'
import { Button } from './components/TestComponents'

figma.connect(Button, 'instanceSwap', {
  props: {
    icon: figma.instance('Icon Prop'),
  },
  example: ({ icon }) => <Button>{icon}</Button>,
})

figma.connect(Button, 'children', {
  props: {
    icon: figma.children('Icon Layer'),
  },
  example: ({ icon }) => <Button>{icon}</Button>,
})

figma.connect(Button, 'children array', {
  props: {
    icons: figma.children(['Icon 1', 'Icon 2', 'Icon 3']),
  },
  example: ({ icons }) => <Button>{icons}</Button>,
})
