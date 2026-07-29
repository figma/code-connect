import { FigmaRestApi } from './figma_rest_api'

// Inlined copy of `normalizePropKey` from @figma/code-connect-snippet
// (share/code-connect-snippet/src/figmadoc_utils.ts) — importing that unpublished
// workspace package breaks a locally built/linked CLI. MUST stay in sync so the
// property keys we send line up with the server's `.properties`.
const PROP_ID_PATTERN = /(#[0-9]+:[0-9]+)/g
function normalizePropKey(key: string): string {
  return key.replace(PROP_ID_PATTERN, '').replace(/\s+/g, ' ').trim()
}

/**
 * A single property value to overlay a node's `.properties`. `name` is normalized
 * (no `#id` suffix) so it matches template references, e.g. `figma.boolean('Has Icon Start')`.
 */
export interface PropertyCombinationValue {
  name: string
  type: FigmaRestApi.ComponentPropertyType
  value: string | boolean
}

/** One renderable property combination: a label plus the full set of property values to overlay. */
export interface PropertyCombination {
  label: string
  properties: PropertyCombinationValue[]
}

/** The typed vocabulary of a component's properties, attached to failed previews for repair hints. */
export interface AvailableProperty {
  name: string
  type: FigmaRestApi.ComponentPropertyType
  variantOptions?: string[]
  default?: string | boolean
}

/** The typed, normalized property vocabulary of a component. */
export function toAvailableProperties(
  defs: Record<string, FigmaRestApi.ComponentPropertyDefinition>,
): AvailableProperty[] {
  return Object.entries(defs).map(([rawName, def]) => ({
    name: normalizePropKey(rawName),
    type: def.type,
    ...(def.variantOptions ? { variantOptions: def.variantOptions } : {}),
    default: def.defaultValue,
  }))
}

export interface EnumeratePropertyCombinationsResult {
  propertyCombinations: PropertyCombination[]
  availableProperties: AvailableProperty[]
  /** Set only when an explicit `maxCombinations` cap truncated the full cartesian. */
  truncated: { total: number; cap: number } | null
}

/**
 * Enumerate a component's renderable property combinations from its
 * `componentPropertyDefinitions`: the cartesian product of VARIANT axes
 * (their `variantOptions`) and BOOLEAN axes ({false, true}).
 * TEXT/INSTANCE_SWAP props are held at `defaultValue` in every combination.
 * Uncapped by default; pass `maxCombinations` to bound it.
 */
export function enumeratePropertyCombinations(
  defs: Record<string, FigmaRestApi.ComponentPropertyDefinition>,
  opts: { maxCombinations?: number } = {},
): EnumeratePropertyCombinationsResult {
  const cap = opts.maxCombinations ?? Infinity
  const entries = Object.entries(defs)

  const availableProperties = toAvailableProperties(defs)

  // Axes we enumerate (VARIANT, BOOLEAN); everything else is held at its default.
  interface Axis {
    name: string
    type: FigmaRestApi.ComponentPropertyType
    values: (string | boolean)[]
  }
  const axes: Axis[] = []
  const fixed: PropertyCombinationValue[] = []

  for (const [rawName, def] of entries) {
    const name = normalizePropKey(rawName)
    if (def.type === FigmaRestApi.ComponentPropertyType.Variant) {
      const values =
        def.variantOptions && def.variantOptions.length > 0
          ? def.variantOptions
          : [String(def.defaultValue)]
      axes.push({ name, type: def.type, values })
    } else if (def.type === FigmaRestApi.ComponentPropertyType.Boolean) {
      axes.push({ name, type: def.type, values: [false, true] })
    } else {
      // TEXT, INSTANCE_SWAP — held at default, present in every combination.
      fixed.push({ name, type: def.type, value: def.defaultValue })
    }
  }

  const total = axes.reduce((n, axis) => n * axis.values.length, 1)
  const count = Math.min(total, cap)

  // Generate combinations by mixed-radix index decoding so we never materialize
  // more than `cap` combinations, even if the full product is enormous.
  const propertyCombinations: PropertyCombination[] = []
  for (let i = 0; i < count; i++) {
    let rem = i
    const varying: PropertyCombinationValue[] = []
    const labelParts: string[] = []
    for (const axis of axes) {
      const value = axis.values[rem % axis.values.length]
      rem = Math.floor(rem / axis.values.length)
      varying.push({ name: axis.name, type: axis.type, value })
      labelParts.push(`${axis.name}=${value}`)
    }
    propertyCombinations.push({
      label: labelParts.length > 0 ? labelParts.join(', ') : 'default',
      properties: [...varying, ...fixed],
    })
  }

  return {
    propertyCombinations,
    availableProperties,
    truncated: total > cap ? { total, cap } : null,
  }
}

export interface BuildPropertyCombinationResult {
  propertyCombination: PropertyCombination
  availableProperties: AvailableProperty[]
  /** Supplied property names that don't exist on the component. */
  unknown: string[]
  /** Supplied values that aren't valid for their VARIANT property. */
  invalid: Array<{ name: string; value: string; options: string[] }>
  /** Supplied names that match multiple types with no `TYPE:` prefix to disambiguate. */
  ambiguous: Array<{ name: string; types: FigmaRestApi.ComponentPropertyType[] }>
}

/**
 * Build a single property combination from an explicit set of `name=value` pairs
 */
export function buildPropertyCombinationFromProps(
  defs: Record<string, FigmaRestApi.ComponentPropertyDefinition>,
  pairs: Array<{ name: string; value: string; type?: FigmaRestApi.ComponentPropertyType }>,
): BuildPropertyCombinationResult {
  // lowercase normalized name -> all defs sharing that name (usually one, but a
  // name can be shared across types — those must stay distinct for `TYPE:` matching).
  const defsByLower = new Map<
    string,
    Array<{ canonical: string; def: FigmaRestApi.ComponentPropertyDefinition }>
  >()
  for (const [rawName, def] of Object.entries(defs)) {
    const canonical = normalizePropKey(rawName)
    const lower = canonical.toLowerCase()
    const list = defsByLower.get(lower) ?? []
    list.push({ canonical, def })
    defsByLower.set(lower, list)
  }

  const availableProperties = toAvailableProperties(defs)

  // Seed every property (one entry per def, so same-named/different-type props
  // both appear) at its default so the overlay is always complete.
  const properties: PropertyCombinationValue[] = Object.entries(defs).map(([rawName, def]) => ({
    name: normalizePropKey(rawName),
    type: def.type,
    value: def.defaultValue,
  }))
  const setValue = (
    name: string,
    type: FigmaRestApi.ComponentPropertyType,
    value: string | boolean,
  ) => {
    const entry = properties.find((p) => p.name === name && p.type === type)
    if (entry) {
      entry.value = value
    } else {
      properties.push({ name, type, value })
    }
  }

  const unknown: string[] = []
  const invalid: Array<{ name: string; value: string; options: string[] }> = []
  const ambiguous: Array<{ name: string; types: FigmaRestApi.ComponentPropertyType[] }> = []
  const applied: Array<{
    name: string
    type: FigmaRestApi.ComponentPropertyType
    value: string | boolean
  }> = []

  for (const { name: rawName, value, type } of pairs) {
    const candidates = defsByLower.get(normalizePropKey(rawName).toLowerCase())
    if (!candidates || candidates.length === 0) {
      unknown.push(type ? `${type}:${rawName}` : rawName)
      continue
    }

    let match: { canonical: string; def: FigmaRestApi.ComponentPropertyDefinition } | undefined
    if (type) {
      match = candidates.find((c) => c.def.type === type)
      if (!match) {
        // A type was given but no property of that type exists under this name.
        unknown.push(`${type}:${rawName}`)
        continue
      }
    } else if (candidates.length > 1) {
      ambiguous.push({ name: candidates[0].canonical, types: candidates.map((c) => c.def.type) })
      continue
    } else {
      match = candidates[0]
    }

    const { canonical, def } = match

    if (def.type === FigmaRestApi.ComponentPropertyType.Variant && def.variantOptions?.length) {
      // Case-insensitive match against the real options.
      const option = def.variantOptions.find((o) => o.toLowerCase() === value.toLowerCase())
      if (!option) {
        invalid.push({ name: canonical, value, options: def.variantOptions })
        continue
      }
      setValue(canonical, def.type, option)
      applied.push({ name: canonical, type: def.type, value: option })
      continue
    }

    const coerced: string | boolean =
      def.type === FigmaRestApi.ComponentPropertyType.Boolean
        ? /^(true|1|yes|on)$/i.test(value.trim())
        : value
    setValue(canonical, def.type, coerced)
    applied.push({ name: canonical, type: def.type, value: coerced })
  }

  // Prefix the type in the label only when a name was applied for more than one
  // type, so the render label stays unambiguous without noise in the common case.
  const nameCounts = new Map<string, number>()
  for (const a of applied) nameCounts.set(a.name, (nameCounts.get(a.name) ?? 0) + 1)
  const label =
    applied.length > 0
      ? applied
          .map(
            (a) => `${(nameCounts.get(a.name) ?? 0) > 1 ? `${a.type}:` : ''}${a.name}=${a.value}`,
          )
          .join(', ')
      : 'default'
  return {
    propertyCombination: { label, properties },
    availableProperties,
    unknown,
    invalid,
    ambiguous,
  }
}
