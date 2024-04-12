import * as React from 'react'
import figma from '../..'
import { NamespacedComponents } from './TestComponents'

figma.connect(NamespacedComponents.Button, 'ui/button', {
  example: () => <NamespacedComponents.Button />,
})
