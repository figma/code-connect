import React from 'react'
import figma from '../..'
import { MemoButton } from './components/TestComponents'

figma.connect(MemoButton, 'ui/button', {
  example: () => <MemoButton>Click me</MemoButton>,
})
