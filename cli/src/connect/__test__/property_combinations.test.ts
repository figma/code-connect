import {
  enumeratePropertyCombinations,
  buildPropertyCombinationFromProps,
} from '../property_combinations'
import { FigmaRestApi } from '../figma_rest_api'

const {
  Boolean: BOOLEAN,
  Variant: VARIANT,
  Text: TEXT,
  InstanceSwap: INSTANCE_SWAP,
} = FigmaRestApi.ComponentPropertyType

describe('enumeratePropertyCombinations', () => {
  it('enumerates a single VARIANT axis', () => {
    const { propertyCombinations, truncated } = enumeratePropertyCombinations({
      Size: { type: VARIANT, defaultValue: 'Medium', variantOptions: ['Small', 'Medium', 'Large'] },
    })

    expect(truncated).toBeNull()
    expect(propertyCombinations.map((c) => c.label)).toEqual([
      'Size=Small',
      'Size=Medium',
      'Size=Large',
    ])
    expect(propertyCombinations[0].properties).toEqual([
      { name: 'Size', type: VARIANT, value: 'Small' },
    ])
  })

  it('enumerates BOOLEAN axes as {false, true} and takes the cartesian product', () => {
    const { propertyCombinations } = enumeratePropertyCombinations({
      'Has Icon Start#4:64': { type: BOOLEAN, defaultValue: false },
      'Has Icon End#4:128': { type: BOOLEAN, defaultValue: false },
    })

    // 2 booleans -> 4 property combinations, names normalized (no #id suffix).
    expect(propertyCombinations).toHaveLength(4)
    expect(propertyCombinations.map((c) => c.label)).toEqual([
      'Has Icon Start=false, Has Icon End=false',
      'Has Icon Start=true, Has Icon End=false',
      'Has Icon Start=false, Has Icon End=true',
      'Has Icon Start=true, Has Icon End=true',
    ])
    expect(propertyCombinations[1].properties).toEqual([
      { name: 'Has Icon Start', type: BOOLEAN, value: true },
      { name: 'Has Icon End', type: BOOLEAN, value: false },
    ])
  })

  it('holds TEXT and INSTANCE_SWAP at their defaults and includes them in every combination', () => {
    const { propertyCombinations, availableProperties } = enumeratePropertyCombinations({
      Variant: { type: VARIANT, defaultValue: 'Primary', variantOptions: ['Primary', 'Secondary'] },
      'Label#2:0': { type: TEXT, defaultValue: 'Button' },
      'Icon#3:0': { type: INSTANCE_SWAP, defaultValue: '68:16113' },
    })

    expect(propertyCombinations).toHaveLength(2) // only the VARIANT axis varies
    // Each combination carries the varying variant + both fixed props.
    expect(propertyCombinations[0].properties).toEqual([
      { name: 'Variant', type: VARIANT, value: 'Primary' },
      { name: 'Label', type: TEXT, value: 'Button' },
      { name: 'Icon', type: INSTANCE_SWAP, value: '68:16113' },
    ])
    // Labels only mention the varying axis, not the constant props.
    expect(propertyCombinations.map((c) => c.label)).toEqual([
      'Variant=Primary',
      'Variant=Secondary',
    ])

    expect(availableProperties).toEqual([
      {
        name: 'Variant',
        type: VARIANT,
        variantOptions: ['Primary', 'Secondary'],
        default: 'Primary',
      },
      { name: 'Label', type: TEXT, default: 'Button' },
      { name: 'Icon', type: INSTANCE_SWAP, default: '68:16113' },
    ])
  })

  it('produces a single "default" combination when there are no varying axes', () => {
    const { propertyCombinations } = enumeratePropertyCombinations({
      'Label#2:0': { type: TEXT, defaultValue: 'Hello' },
    })

    expect(propertyCombinations).toHaveLength(1)
    expect(propertyCombinations[0].label).toBe('default')
    expect(propertyCombinations[0].properties).toEqual([
      { name: 'Label', type: TEXT, value: 'Hello' },
    ])
  })

  it('multiplies variant and boolean axes together', () => {
    const { propertyCombinations } = enumeratePropertyCombinations({
      Size: { type: VARIANT, defaultValue: 'S', variantOptions: ['S', 'M', 'L'] },
      Disabled: { type: BOOLEAN, defaultValue: false },
    })

    expect(propertyCombinations).toHaveLength(6) // 3 x 2
  })

  it('caps at maxCombinations and reports the true total', () => {
    const { propertyCombinations, truncated } = enumeratePropertyCombinations(
      {
        A: { type: BOOLEAN, defaultValue: false },
        B: { type: BOOLEAN, defaultValue: false },
        C: { type: BOOLEAN, defaultValue: false },
      },
      { maxCombinations: 4 },
    )

    expect(propertyCombinations).toHaveLength(4)
    expect(truncated).toEqual({ total: 8, cap: 4 })
  })

  it('renders all property combinations with no cap by default', () => {
    // 7 booleans = 128 combinations.
    const defs: Record<string, FigmaRestApi.ComponentPropertyDefinition> = {}
    for (let i = 0; i < 7; i++) {
      defs[`Bool${i}`] = { type: BOOLEAN, defaultValue: false }
    }
    const { propertyCombinations, truncated } = enumeratePropertyCombinations(defs)
    expect(propertyCombinations).toHaveLength(128)
    expect(truncated).toBeNull()
  })
})

describe('buildPropertyCombinationFromProps', () => {
  const defs: Record<string, FigmaRestApi.ComponentPropertyDefinition> = {
    Variant: { type: VARIANT, defaultValue: 'Primary', variantOptions: ['Primary', 'Secondary'] },
    'Has Icon Start#4:64': { type: BOOLEAN, defaultValue: false },
    'Label#2:0': { type: TEXT, defaultValue: 'Button' },
  }

  it('overrides supplied props and holds the rest at their defaults', () => {
    const { propertyCombination, unknown, invalid } = buildPropertyCombinationFromProps(defs, [
      { name: 'Variant', value: 'Secondary' },
      { name: 'Has Icon Start', value: 'true' },
    ])

    expect(unknown).toEqual([])
    expect(invalid).toEqual([])
    expect(propertyCombination.label).toBe('Variant=Secondary, Has Icon Start=true')
    expect(propertyCombination.properties).toEqual([
      { name: 'Variant', type: VARIANT, value: 'Secondary' },
      { name: 'Has Icon Start', type: BOOLEAN, value: true }, // coerced to boolean
      { name: 'Label', type: TEXT, value: 'Button' }, // untouched default
    ])
  })

  it('matches property names case-insensitively', () => {
    const { propertyCombination, unknown } = buildPropertyCombinationFromProps(defs, [
      { name: 'variant', value: 'Secondary' },
    ])
    expect(unknown).toEqual([])
    expect(propertyCombination.properties.find((p) => p.name === 'Variant')).toEqual({
      name: 'Variant',
      type: VARIANT,
      value: 'Secondary',
    })
  })

  it('matches variant values case-insensitively and canonicalizes them', () => {
    const { propertyCombination } = buildPropertyCombinationFromProps(defs, [
      { name: 'Variant', value: 'secondary' },
    ])
    // Applied as the canonical option "Secondary", not "secondary".
    expect(propertyCombination.properties.find((p) => p.name === 'Variant')?.value).toBe(
      'Secondary',
    )
    expect(propertyCombination.label).toBe('Variant=Secondary')
  })

  it('reports an invalid variant value with the valid options and does not apply it', () => {
    const { propertyCombination, invalid } = buildPropertyCombinationFromProps(defs, [
      { name: 'Variant', value: 'Danger' },
    ])
    expect(invalid).toEqual([
      { name: 'Variant', value: 'Danger', options: ['Primary', 'Secondary'] },
    ])
    // Left at its default since the value was rejected.
    expect(propertyCombination.properties.find((p) => p.name === 'Variant')?.value).toBe('Primary')
  })

  it('coerces boolean values case-insensitively', () => {
    const { propertyCombination } = buildPropertyCombinationFromProps(defs, [
      { name: 'Has Icon Start', value: 'FALSE' },
    ])
    const hasIcon = propertyCombination.properties.find((p) => p.name === 'Has Icon Start')
    expect(hasIcon).toEqual({ name: 'Has Icon Start', type: BOOLEAN, value: false })
  })

  it('reports unknown property names', () => {
    const { unknown } = buildPropertyCombinationFromProps(defs, [
      { name: 'Varient', value: 'Primary' },
    ])
    expect(unknown).toEqual(['Varient'])
  })

  describe('same-named properties of different types', () => {
    const sharedDefs: Record<string, FigmaRestApi.ComponentPropertyDefinition> = {
      'textMsg#1:0': { type: BOOLEAN, defaultValue: false },
      'textMsg#2:0': { type: TEXT, defaultValue: 'Hello' },
    }

    it('seeds one entry per def so both same-named props are present', () => {
      const { propertyCombination } = buildPropertyCombinationFromProps(sharedDefs, [])
      expect(propertyCombination.properties).toEqual([
        { name: 'textMsg', type: BOOLEAN, value: false },
        { name: 'textMsg', type: TEXT, value: 'Hello' },
      ])
    })

    it('applies typed pairs to the matching-type property only', () => {
      const { propertyCombination, unknown, invalid, ambiguous } =
        buildPropertyCombinationFromProps(sharedDefs, [
          { name: 'textMsg', value: 'true', type: BOOLEAN },
          { name: 'textMsg', value: 'World', type: TEXT },
        ])
      expect(unknown).toEqual([])
      expect(invalid).toEqual([])
      expect(ambiguous).toEqual([])
      expect(propertyCombination.properties).toEqual([
        { name: 'textMsg', type: BOOLEAN, value: true },
        { name: 'textMsg', type: TEXT, value: 'World' },
      ])
      // Label disambiguates by type since the name was applied for both types.
      expect(propertyCombination.label).toBe('BOOLEAN:textMsg=true, TEXT:textMsg=World')
    })

    it('reports ambiguous names when no type prefix is given', () => {
      const { propertyCombination, ambiguous } = buildPropertyCombinationFromProps(sharedDefs, [
        { name: 'textMsg', value: 'true' },
      ])
      expect(ambiguous).toEqual([{ name: 'textMsg', types: [BOOLEAN, TEXT] }])
      // Nothing applied — both held at their defaults.
      expect(propertyCombination.properties).toEqual([
        { name: 'textMsg', type: BOOLEAN, value: false },
        { name: 'textMsg', type: TEXT, value: 'Hello' },
      ])
    })

    it('reports a typed pair whose type does not exist under that name as unknown', () => {
      const { unknown } = buildPropertyCombinationFromProps(sharedDefs, [
        { name: 'textMsg', value: 'x', type: VARIANT },
      ])
      expect(unknown).toEqual(['VARIANT:textMsg'])
    })

    it('does not prefix the type in the label for a unique-name property', () => {
      const { propertyCombination } = buildPropertyCombinationFromProps(defs, [
        { name: 'Variant', value: 'Secondary', type: VARIANT },
      ])
      expect(propertyCombination.label).toBe('Variant=Secondary')
    })
  })
})
