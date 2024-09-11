import * as React from 'react'
import figma from '../index_react'
import { NamespacedComponents } from './components/TestComponents'

figma.connect(NamespacedComponents.Button, 'ui/button', {
  example: () => <NamespacedComponents.Button />,
})
