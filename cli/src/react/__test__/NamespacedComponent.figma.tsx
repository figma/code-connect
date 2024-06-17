import * as React from 'react'
import figma from '../..'
import { NamespacedComponents } from './components/TestComponents'

figma.connect(NamespacedComponents.Button, 'ui/button', {
  example: () => <NamespacedComponents.Button />,
})
