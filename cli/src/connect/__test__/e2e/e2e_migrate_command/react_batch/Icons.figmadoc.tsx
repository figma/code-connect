import figma from '../../../../../react/index_react'
import { IconAdd, IconRemove, IconSearch } from './Icons'

figma.connect(IconAdd, 'https://figma.com/test/icon-add', {
  example: () => <IconAdd />,
})

figma.connect(IconRemove, 'https://figma.com/test/icon-remove', {
  example: () => <IconRemove />,
})

figma.connect(IconSearch, 'https://figma.com/test/icon-search', {
  example: () => <IconSearch />,
})
