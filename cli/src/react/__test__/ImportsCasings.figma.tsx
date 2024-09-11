import React from 'react'
import figma from '../index_react'

import { TestComponentKebab } from './components/test-component-kebab'
import { TestComponentUnderscore } from './components/test_component_underscore'

figma.connect(TestComponentKebab, 'kebab-case', {
  example: () => <TestComponentKebab />,
})
figma.connect(TestComponentUnderscore, 'underscore', {
  example: () => <TestComponentUnderscore />,
})
