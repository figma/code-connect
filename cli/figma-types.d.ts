/**
 * Type definitions for the `figma` module available in Code Connect template files
 * (.figma.ts).
 * Usage: add to your tsconfig.json:
 *   { "compilerOptions": { "types": ["@figma/code-connect/figma-types"] } }
 */
// Declare require() for the 'figma' module so that template files can use
// `const figma = require('figma')` without needing @types/node installed.
declare function require(module: 'figma'): typeof import('figma')
declare function require(module: string): any
declare module 'figma' {
  export type CodeSection = { type: 'CODE'; code: string; nestedImports?: string[] }
  export type InstanceSection = {
    type: 'INSTANCE'
    guid: string
    symbolId: string
    resultSections?: ResultSection[]
    nestedImports?: string[]
  }
  export type SlotSection = { type: 'SLOT'; guid?: string; propertyName: string }
  export type ErrorSection = { type: 'ERROR'; message: string; errorObject?: unknown }
  export type ResultSection = CodeSection | InstanceSection | SlotSection | ErrorSection

  export interface TemplateStringResult {
    sections: ResultSection[]
    language: string
    type: 'SECTIONS'
  }

  export interface SelectorOptions {
    path?: string[]
    traverseInstances?: boolean
  }

  type ObjectValue = Record<string, FCCValue>

  export type FCCValue =
    | string
    | number
    | boolean
    | undefined
    | { $value: string; $type: 'jsx-element' }
    | { $value: string; $type: 'function' }
    | { $value: string; $type: 'identifier' }
    | { $value: ObjectValue; $type: 'object' }
    | { $value: string; $type: 'template-string' }
    | { $value: string; $type: 'react-component' }
    | { $value: FCCValue[]; $type: 'array' }

  export interface TextHandle {
    readonly type: 'TEXT'
    readonly name: string
    readonly textContent: string
    __render__(): string
  }

  export interface TemplateMetadata {
    nestable?: boolean
    props?: Record<string, unknown>
    __props: Record<string, unknown>
    [key: string]: unknown
  }

  export interface ErrorHandle {
    readonly type: 'ERROR'
    __render__(): ResultSection[]
    executeTemplate(): {
      example: ResultSection[]
      metadata?: TemplateMetadata
    }
  }

  export interface InstanceHandle {
    readonly type: 'INSTANCE'
    readonly symbolId: string
    readonly name: string
    readonly children: (InstanceHandle | TextHandle | ErrorHandle)[]
    readonly properties: Record<string, { value: string | boolean }>
    readonly path?: string[]
    readonly slots?: Record<string, { guid: string }>

    codeConnectId(): string | null

    __find__(name: string): InstanceHandle | ErrorHandle | null
    __findChildWithCriteria__(criteria: {
      type: 'INSTANCE' | 'TEXT'
      name: string
    }): InstanceHandle | TextHandle | ErrorHandle | null
    __getPropertyValue__(name: string): string | boolean | ErrorHandle
    __render__(): ResultSection[]
    __getProps__(): ResultSection[] | Record<string, unknown> | undefined
    __renderWithFn__(
      renderFn: (props: Record<string, unknown>) => TemplateStringResult,
    ): ResultSection[] | ErrorHandle | undefined

    getString(propName: string): string
    getBoolean(propName: string): boolean
    getBoolean<O extends Record<string, unknown>>(
      propName: string,
      options: O,
    ): EnumOptionsValues<O>
    getEnum<O extends Record<string, unknown>>(
      propName: string,
      options: O,
    ): EnumOptionsValues<O> | undefined
    getInstanceSwap(propName: string): InstanceHandle | undefined
    getSlot(propName: string): ResultSection[] | undefined
    hasCodeConnect(): boolean
    getPropertyValue(name: string): string | boolean | ErrorHandle
    findInstance(layerName: string, opts?: SelectorOptions): InstanceHandle | ErrorHandle
    findText(layerName: string, opts?: SelectorOptions): TextHandle | ErrorHandle
    findConnectedInstance(
      codeConnectId: string,
      opts?: SelectorOptions,
    ): InstanceHandle | ErrorHandle | null
    findConnectedInstances(
      selectorFn: (node: InstanceHandle) => boolean,
      opts?: SelectorOptions,
    ): (InstanceHandle | ErrorHandle)[]
    findLayers(
      selectorFn: (node: InstanceHandle | TextHandle) => boolean,
      opts?: SelectorOptions,
    ): (InstanceHandle | TextHandle | ErrorHandle)[]
    executeTemplate(): {
      example: ResultSection[]
      metadata?: TemplateMetadata
    }
  }

  export type LayerHandle = InstanceHandle | TextHandle | ErrorHandle

  export type EnumOptionsValues<O extends Record<string, unknown>> = O[keyof O]

  export interface FigmaProperties {
    string(propName: string): string
    boolean(propName: string): boolean
    boolean<O extends Record<string, unknown>>(propName: string, options: O): EnumOptionsValues<O>
    enum<O extends Record<string, unknown>>(
      propName: string,
      options: O,
    ): EnumOptionsValues<O> | undefined
    // In error cases the implementation may return string (from TextHandle.__render__)
    instance(propName: string): ResultSection[] | string | undefined
    __instance__(
      propName: string,
    ): InstanceHandle | TextHandle | ErrorHandle | ResultSection[] | undefined
    slot(propName: string): ResultSection[] | undefined
    children(layerNames: string[]): ResultSection[]
  }

  export type TemplateLiteral = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => TemplateStringResult

  export interface Figma {
    /** The currently selected component instance */
    readonly selectedInstance: InstanceHandle & { readonly __properties__: FigmaProperties }
    /** Alias for selectedInstance */
    readonly currentLayer: InstanceHandle & { readonly __properties__: FigmaProperties }
    /** Access component properties via the properties API */
    readonly properties: FigmaProperties

    /** Template literal tag for custom/plaintext code */
    code: TemplateLiteral
    /** Template literal tag for JSX/TSX code */
    tsx: TemplateLiteral
    /** Template literal tag for HTML code */
    html: TemplateLiteral
    /** Template literal tag for Swift code */
    swift: TemplateLiteral
    /** Template literal tag for Kotlin/Compose code */
    kotlin: TemplateLiteral

    /** Return a raw value (not rendered as a template string) */
    value(raw: unknown, preview?: unknown): { type: string; value: unknown; preview: unknown }

    helpers: {
      react: {
        renderProp(name: string, prop: FCCValue | ResultSection[]): TemplateStringResult | string
        renderChildren(
          prop: FCCValue | ResultSection[],
        ): ResultSection[] | string | number | boolean | TemplateStringResult
        renderPropValue(
          prop: FCCValue | ResultSection[],
        ): string | number | boolean | ResultSection[]
        stringifyObject(obj: unknown): string
        jsxElement(value: string): { $value: string; $type: 'jsx-element' }
        function(value: string): { $value: string; $type: 'function' }
        identifier(value: string): { $value: string; $type: 'identifier' }
        object(value: ObjectValue): { $value: ObjectValue; $type: 'object' }
        templateString(value: string): { $value: string; $type: 'template-string' }
        reactComponent(value: string): { $value: string; $type: 'react-component' }
        array(value: FCCValue[]): { $value: FCCValue[]; $type: 'array' }
        isReactComponentArray(prop: unknown): boolean
      }
      swift: {
        renderChildren(
          children: ResultSection[] | string | undefined,
          prefix: string,
        ): ResultSection[]
      }
      kotlin: {
        renderChildren(
          children: ResultSection[] | string | undefined,
          prefix: string,
        ): ResultSection[]
      }
    }
  }

  const figma: Figma
  export = figma
}
