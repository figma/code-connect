/* istanbul ignore file */
// This file needs to be ignored from code coverage, as Istanbul adds extra calls
// to `cov_*` functions which are used to track coverage, but these functions
// can't be resolved when executing the templates from the unit tests inside
// `new Function()`

declare const figma: { html: (template: TemplateStringsArray, ...args: any[]) => string }

export function _fcc_templateString($value: string) {
  return {
    $value,
    $type: 'template-string',
  } as const
}

export function _fcc_object($value: Record<string, any>) {
  return {
    $value,
    $type: 'object',
    ...$value,
  } as const
}

/**
 * Render a value to HTML, following sensible rules according to the type.
 *
 * @param value The value to render
 */
function _fcc_renderHtmlValue(value: any): string {
  // If the value is an array, then it's an array of objects representing React
  // children (either of type INSTANCE for pills, or CODE for inline code). The
  // template string handler in the template API handles extracting the instance
  // objects in a way the UI can handle.
  const isComponentArray = Array.isArray(value)
  if (isComponentArray) {
    return figma.html`${value}`
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  } else if (typeof value === 'undefined') {
    return ''
  } else {
    return value.toString()
  }
}

/**
 * Render a value as an HTML attribute. This renders as a string wrapped in
 * quotes, unless the value is a boolean, in which case we output just the
 * attribute name if the value is true, or nothing if the value is false or
 * undefined.
 *
 * @param name The name of the attribute
 * @param value The value of the attribute
 */
function _fcc_renderHtmlAttribute(name: string, value: any) {
  // figma.boolean returns undefined instead of false in some cases
  if (typeof value === 'undefined') {
    return ''
  } else if (typeof value === 'boolean') {
    if (value) {
      return name
    } else {
      return ''
    }
  } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return `${name}="${value.toString().replaceAll('\n', '\\n').replaceAll('"', '\\"')}"`
  } else {
    // TODO make this show a proper error in the UI
    return `${name}="Code Connect Error: Unsupported type '${typeof value}' for attribute"`
  }
}

export function getParsedTemplateHelpersString() {
  return [_fcc_templateString, _fcc_object, _fcc_renderHtmlValue, _fcc_renderHtmlAttribute]
    .map((fn) => fn.toString())
    .join('\n')
}
