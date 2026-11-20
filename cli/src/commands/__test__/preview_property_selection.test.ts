jest.mock('../../common/logging', () => ({
  logger: { warn: jest.fn(), info: jest.fn() },
  exitWithError: jest.fn((message: string) => {
    throw new Error(message)
  }),
}))

import { PreviewPropertySelection } from '../preview_property_selection'
import { FigmaRestApi } from '../../connect/figma_rest_api'

const {
  Boolean: BOOLEAN,
  Variant: VARIANT,
  Text: TEXT,
  InstanceSwap: INSTANCE_SWAP,
} = FigmaRestApi.ComponentPropertyType
const defs = {
  Size: { type: VARIANT, defaultValue: 'M', variantOptions: ['S', 'M', 'L'] },
  'Has Icon#1:2': { type: BOOLEAN, defaultValue: true },
}

beforeEach(() => jest.clearAllMocks())

it('matches shared names across components', () => {
  const selection = new PreviewPropertySelection(['Size', 'Layout', 'Size'])
  expect(selection.forNode('Button.figma.ts', '1:2', defs).map((prop) => prop.name)).toEqual([
    'Size',
  ])
  expect(
    selection
      .forNode('Card.figma.ts', '1:3', {
        Layout: { type: VARIANT, defaultValue: 'Grid', variantOptions: ['Grid', 'List'] },
        'Has Icon#1:2': { type: BOOLEAN, defaultValue: false },
      })
      .map((prop) => prop.name),
  ).toEqual(['Layout'])
  expect(() => selection.validate()).not.toThrow()
})

it('matches normalized, case-insensitive names and treats colons and commas literally', () => {
  const selection = new PreviewPropertySelection([
    'has   ICON#1:2',
    'UI:Size',
    'boolean:Value',
    'x,y',
  ])
  expect(
    selection
      .forNode('Button.figma.ts', '1:2', {
        ...defs,
        'UI:Size': { type: BOOLEAN, defaultValue: false },
        'BOOLEAN:Value': { type: BOOLEAN, defaultValue: false },
        Value: { type: BOOLEAN, defaultValue: true },
        'x,y': { type: BOOLEAN, defaultValue: false },
      })
      .map((prop) => prop.name),
  ).toEqual(['Has Icon', 'UI:Size', 'BOOLEAN:Value', 'x,y'])
})

it.each([BOOLEAN, TEXT])('rejects duplicate names when the other property is %s', (type) => {
  const selection = new PreviewPropertySelection(['Value'])
  expect(() =>
    selection.forNode('Button.figma.ts', '1:2', {
      'Value#1:2': { type: BOOLEAN, defaultValue: true },
      'Value#1:3': { type, defaultValue: type === BOOLEAN ? false : 'text' },
    }),
  ).toThrow('Property "Value" in Button.figma.ts (node 1:2) matches multiple properties')
})

it.each([TEXT, INSTANCE_SWAP])('rejects a selected property that cannot vary (%s)', (type) => {
  const selection = new PreviewPropertySelection(['Label'])
  expect(() =>
    selection.forNode('Button.figma.ts', '1:2', {
      Label: { type, defaultValue: 'text' },
    }),
  ).toThrow('--all can vary only BOOLEAN and VARIANT properties')
})

it('rejects names absent from every component without falling back to selecting all', () => {
  const selection = new PreviewPropertySelection(['Size', 'BOOLEAN:Has Icon', 'Typo'])
  expect(selection.forNode('Empty.figma.ts', '1:2', {})).toEqual([])
  expect(selection.forNode('Button.figma.ts', '1:3', defs).map((prop) => prop.name)).toEqual([
    'Size',
  ])
  expect(() => selection.validate()).toThrow(
    'Properties selected with --all matched nothing across the selected components: BOOLEAN:Has Icon, Typo',
  )
})

it.each(['', '   '])('rejects empty property name %j', (name) => {
  expect(() => new PreviewPropertySelection([name])).toThrow('must not be empty')
})
