import React from 'react'
import figma from '../..'
import { Button } from './TestTopLevelComponent'

figma.connect(Button, 'ui/button', {
  example: () => <Button>Click me</Button>,
})
