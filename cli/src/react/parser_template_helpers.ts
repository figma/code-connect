/* istanbul ignore file */
// This file needs to be ignored from code coverage, as Istanbul adds extra calls
// to `cov_*` functions which are used to track coverage, but these functions
// can't be resolved when executing the templates from the unit tests inside
// `new Function()`

declare const figma: { tsx: (template: TemplateStringsArray, ...args: any[]) => string }
declare type CodeSection = { type: 'CODE'; code: string }
declare type InstanceSection = { type: 'INSTANCE' }
declare type ErrorSection = { type: 'ERROR' }

// This file contains helper functions which hare included in the React template
// example - i.e. they are run on the client side, but are not part of the
// general template API as they are React specific.
//
// We write them in TS rather than as a string for maintainability, then call
// `.toString()` on the functions and return a string we can inject. Note that
// comments will be stripped, as this is run through the build step first.

// The parser serializes all enum values to strings when passing them to the
// template. To preserve type information, we wrap any complex types with a
// `type` field so we can determine how to render the prop value correctly in
// the template (when passed to e.g __fcc_renderReactProp), and also to
// differentiate between things like template strings and identifiers (e.g
// MyEnum.Something).
export type FCCValue =
  | string
  | number
  | boolean
  | undefined
  | ReturnType<
      | typeof _fcc_jsxElement
      | typeof _fcc_function
      | typeof _fcc_identifier
      | typeof _fcc_object
      | typeof _fcc_templateString
      | typeof _fcc_reactComponent
    >

export function _fcc_jsxElement($value: string) {
  return {
    $value,
    $type: 'jsx-element',
  } as const
}

export function _fcc_function($value: string) {
  return {
    $value,
    $type: 'function',
  } as const
}

export function _fcc_identifier($value: string) {
  return {
    $value,
    $type: 'identifier',
  } as const
}

export function _fcc_object($value: Record<string, any>) {
  return {
    $value,
    $type: 'object',
    ...$value,
  } as const
}

export function _fcc_templateString($value: string) {
  return {
    $value,
    $type: 'template-string',
  } as const
}

export function _fcc_reactComponent($value: string) {
  return {
    $value,
    $type: 'react-component',
  } as const
}

// Render a prop value passed to an object literal based on its type.
// for example: <Button sx={{ key: value }} />
function _fcc_renderPropValue(prop: FCCValue | (CodeSection | InstanceSection)[]) {
  if (Array.isArray(prop)) {
    return prop
  }

  if (prop === undefined) {
    return 'undefined'
  }

  // Replace any newlines or quotes in the string with escaped versions
  if (typeof prop === 'string') {
    const str = `"${prop.replaceAll('\n', '\\n').replaceAll('"', '\\"')}"`
    if (str === '') {
      return 'undefined'
    } else {
      return str
    }
  }

  if (typeof prop === 'boolean' || typeof prop === 'number') {
    return prop
  }

  if (
    prop.$type === 'function' ||
    prop.$type === 'identifier' ||
    prop.$type === 'jsx-element' ||
    prop.$type === 'react-component'
  ) {
    return prop.$value
  }

  if (prop.$type === 'object') {
    return _fcc_stringifyObject(prop.$value)
  }

  if (prop.$type === 'template-string') {
    return `\`${prop.$value}\``
  }

  return 'undefined'
}

// Render a React prop correctly, based on its type
function _fcc_renderReactProp(
  name: string,
  prop: FCCValue | (CodeSection | InstanceSection | ErrorSection)[],
) {
  // If the value is an array, then it's an array of objects representing React
  // children (either of type INSTANCE for pills, or CODE for inline code). The
  // template string handler in the template API handles extracting the instance
  // objects in a way the UI can handle.
  const isReactComponentArray = Array.isArray(prop)

  if (isReactComponentArray) {
    if (prop.length > 1) {
      // If the array has multiple children, render them wrapped in braces and a
      // fragment.
      //
      // We recursively call `figma.tsx` on the value as it itself is an array of
      // CODE/INSTANCE sections, so we need to run it through the template string
      // function otherwise this would just output `[object Object]` for the value.
      // The template string handler function handles flattening nested arrays.
      return figma.tsx` ${name}={<>${prop}</>}`
    } else {
      // Render a single child wrapped in braces, see above for why we use `figma.tsx`
      return figma.tsx` ${name}={${prop}}`
    }
  }

  // Render either the prop name or nothing for a boolean, we don't want to
  // render `prop={true/false}`
  if (typeof prop === 'boolean') {
    return prop ? ` ${name}` : ''
  }

  // Replace any newlines or quotes in the string with escaped versions
  if (typeof prop === 'string') {
    const str = prop.replaceAll('\n', '\\n').replaceAll('"', '\\"')
    if (str === '') {
      return ''
    }
    return ` ${name}="${str}"`
  }

  if (typeof prop === 'number') {
    return ` ${name}={${prop}}`
  }

  if (prop === undefined) {
    return ''
  }

  if (
    prop.$type === 'function' ||
    prop.$type === 'identifier' ||
    prop.$type === 'jsx-element' ||
    prop.$type === 'react-component'
  ) {
    return ` ${name}={${prop.$value}}`
  }

  if (prop.$type === 'object') {
    return ` ${name}={${_fcc_stringifyObject(prop.$value)}}`
  }

  if (prop.$type === 'template-string') {
    return ` ${name}={\`${prop.$value}\`}`
  }

  return ''
}

// Renders React children correctly, based on their type
function _fcc_renderReactChildren(prop: FCCValue | (CodeSection | InstanceSection)[]) {
  if (Array.isArray(prop)) {
    return prop
  }

  if (typeof prop === 'string' || typeof prop === 'number' || typeof prop === 'boolean') {
    return prop
  }

  if (prop === undefined) {
    return ''
  }

  if (prop.$type === 'template-string') {
    // If the value is a template string, wrap in braces
    return figma.tsx`{\`${prop.$value}\`}`
  }

  // If the value is a JSX element, return it directly
  if (prop.$type === 'jsx-element') {
    return prop.$value
  }

  // but for other values, wrap in braces
  if (prop.$type === 'function' || prop.$type === 'identifier') {
    return `{${prop.$value}}`
  }

  if (prop.$type === 'object') {
    return `{${_fcc_stringifyObject(prop.$value)}}`
  }

  if (prop.$type === 'react-component') {
    return `<${prop.$value} />`
  }
}

function _fcc_stringifyObject(obj: any): string {
  if (Array.isArray(obj)) {
    return `[${obj.map((element) => `${_fcc_stringifyObject(element)}`).join(',')}]`
  }

  if (typeof obj !== 'object' || obj instanceof Date || obj === null) {
    return JSON.stringify(obj)
  }

  return `{${Object.keys(obj)
    .map((key) => ` ${key}: ${_fcc_stringifyObject(obj[key])} `)
    .join(',')}}`
}

// Return the helpers as a string which can be injected into the template
export function getParsedTemplateHelpersString() {
  return [
    _fcc_renderReactProp,
    _fcc_renderReactChildren,
    _fcc_jsxElement,
    _fcc_function,
    _fcc_identifier,
    _fcc_object,
    _fcc_templateString,
    _fcc_renderPropValue,
    _fcc_stringifyObject,
    _fcc_reactComponent,
  ]
    .map((fn) => fn.toString())
    .join('\n')
}
