import figma from '../../../../../react/index_react'
import {
  GlyphAlphaIcon,
  GlyphBetaIcon,
  GlyphDeltaIcon,
  GlyphEpsilonIcon,
  GlyphEtaIcon,
  GlyphGammaIcon,
  GlyphIotaIcon,
  GlyphKappaIcon,
  GlyphThetaIcon,
  GlyphZetaIcon,
} from './PropIcons'

figma.connect(GlyphAlphaIcon, 'https://figma.com/test/glyph-alpha', {
  props: {
    name: 'GlyphAlphaIcon',
    fn: GlyphAlphaIcon,
  },
  example: () => <GlyphAlphaIcon size={12} />,
})

figma.connect(GlyphBetaIcon, 'https://figma.com/test/glyph-beta', {
  props: {
    name: 'GlyphBetaIcon',
    fn: GlyphBetaIcon,
  },
  example: () => <GlyphBetaIcon size={16} />,
})

figma.connect(GlyphGammaIcon, 'https://figma.com/test/glyph-gamma', {
  props: {
    name: 'GlyphGammaIcon',
    fn: GlyphGammaIcon,
  },
  example: () => <GlyphGammaIcon size={24} />,
})

figma.connect(GlyphDeltaIcon, 'https://figma.com/test/glyph-delta', {
  props: {
    name: 'GlyphDeltaIcon',
    fn: GlyphDeltaIcon,
  },
  example: () => <GlyphDeltaIcon size={12} />,
})

figma.connect(GlyphEpsilonIcon, 'https://figma.com/test/glyph-epsilon', {
  props: {
    name: 'GlyphEpsilonIcon',
    fn: GlyphEpsilonIcon,
  },
  example: () => <GlyphEpsilonIcon size={16} />,
})

figma.connect(GlyphZetaIcon, 'https://figma.com/test/glyph-zeta', {
  props: {
    name: 'GlyphZetaIcon',
    fn: GlyphZetaIcon,
  },
  example: () => <GlyphZetaIcon size={24} />,
})

figma.connect(GlyphEtaIcon, 'https://figma.com/test/glyph-eta', {
  props: {
    name: 'GlyphEtaIcon',
    fn: GlyphEtaIcon,
  },
  example: () => <GlyphEtaIcon size={12} />,
})

figma.connect(GlyphThetaIcon, 'https://figma.com/test/glyph-theta', {
  props: {
    name: 'GlyphThetaIcon',
    fn: GlyphThetaIcon,
  },
  example: () => <GlyphThetaIcon size={16} />,
})

figma.connect(GlyphIotaIcon, 'https://figma.com/test/glyph-iota', {
  props: {
    name: 'GlyphIotaIcon',
    fn: GlyphIotaIcon,
  },
  example: () => <GlyphIotaIcon size={24} />,
})

figma.connect(GlyphKappaIcon, 'https://figma.com/test/glyph-kappa', {
  props: {
    name: 'GlyphKappaIcon',
    fn: GlyphKappaIcon,
  },
  example: () => <GlyphKappaIcon size={12} />,
})
