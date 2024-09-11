import React from 'react'
import figma from '../index_react'
import { Button } from './components/TestComponents'

figma.connect(Button, 'ui/button', {
  example: () => <Button>Click me</Button>,
})
figma.connect(Button, 'ui/button', {
  variant: { HasIcon: true },
  example: () => <Button icon="some-icon-32">Click me</Button>,
})
