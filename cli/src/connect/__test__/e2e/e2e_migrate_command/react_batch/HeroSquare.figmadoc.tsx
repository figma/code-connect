import figma from '../../../../../react/index_react'
import { HeroSquare } from './HeroSquare'

figma.connect(HeroSquare, 'https://figma.com/test/hero-btc', {
  example: () => <HeroSquare name="cbbtc" />,
})

figma.connect(HeroSquare, 'https://figma.com/test/hero-eth', {
  example: () => <HeroSquare name="eth" />,
})
