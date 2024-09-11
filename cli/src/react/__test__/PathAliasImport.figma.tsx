import React from 'react'
import figma from '../index_react'
// @ts-expect-error
import { Button } from '@components/TestComponents'

figma.connect(Button, 'ui2/button', {
  example: () => <Button>Click me</Button>,
})
