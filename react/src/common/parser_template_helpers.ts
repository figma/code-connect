/* istanbul ignore file */
// This file needs to be ignored from code coverage, as Istanbul adds extra calls
// to `cov_*` functions which are used to track coverage, but these functions
// can't be resolved when executing the templates from the unit tests inside
// `new Function()`

declare const figma: { tsx: (template: TemplateStringsArray, ...args: any[]) => string }

// This file contains helper functions which hare included in the React template
// example - i.e. they are run on the client side, but are not part of the
// general template API as they are React specific.
//
// We write them in TS rather than as a string for maintainability, then call
// `.toString()` on the functions and return a string we can inject. Note that
// comments will be stripped, as this is run through the build step first.

// Render a React prop correctly, based on its type.
function _fcc_renderReactProp(
  name: string,
  value: string | boolean | { type: 'CODE' | 'INSTANCE' }[],
) {
  // If the value is an array, then it's an array of objects representing React
  // children (either of type INSTANCE for pills, or CODE for inline code). The
  // template string handler in the template API handles extracting the instance
  // objects in a way the UI can handle.
  const isReactComponentArray = Array.isArray(value)

  if (isReactComponentArray && value.length > 1) {
    // If the array has multiple children, render them wrapped in braces and a
    // fragment.
    //
    // We recursively call `figma.tsx` on the value as it itself is an array of
    // CODE/INSTANCE sections, so we need to run it through the template string
    // function otherwise this would just output `[object Object]` for the value.
    // The template string handler function handles flattening nested arrays.
    return figma.tsx` ${name}={<>${value}</>}`
  } else if (
    isReactComponentArray ||
    // This is a hack to allow React components to be passed in as enum mapping
    // values - we should switch to using a more robust solution
    (typeof value === 'string' && value.startsWith('<'))
  ) {
    // Render a single child wrapped in braces, see above for why we use `figma.tsx`
    return figma.tsx` ${name}={${value}}`
  } else if (typeof value === 'string') {
    // Strings are wrapped in quotes
    return ` ${name}="${value}"`
  } else if (typeof value === 'boolean') {
    // Render either the prop name or nothing for a boolean, we don't want to
    // render `prop={true/false}`
    return value ? ` ${name}` : ''
  } else if (typeof value === 'undefined') {
    return ''
  }
}

// Return the helpers as a string which can be injected into the template
export function getParsedTemplateHelpersString() {
  return _fcc_renderReactProp.toString()
}
