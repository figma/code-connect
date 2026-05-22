/**
 * Type overrides for just-* packages.
 *
 * just-* ships CJS entry points (exports.require), but its types use export default
 * and "type": "module", so, in this repository (where `compilerOptions.module` is `node16`), 
 * TS1479 error happens.
 * 
 * In this file, we add `export =` for these packages to fill the gap.
 */

declare module 'just-camel-case' {
  function camelCase(value: string): string
  export = camelCase
}

declare module 'just-kebab-case' {
  function kebabCase(value: string): string
  export = kebabCase
}

declare module 'just-split' {
  function split<T>(arr: T[], n?: number): T[][]
  export = split
}
