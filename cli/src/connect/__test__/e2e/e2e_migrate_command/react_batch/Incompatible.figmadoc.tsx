import figma from '../../../../../react/index_react'
import { OddExample } from './Incompatible'

figma.connect(OddExample, 'https://figma.com/test/odd-alpha', {
  example: () => <OddExample>alpha</OddExample>,
})

figma.connect(OddExample, 'https://figma.com/test/odd-beta', {
  example: () => <OddExample>beta</OddExample>,
})
