import { z } from 'zod'
import { ComponentTypeSignature } from '../react/parser'
import { BaseCodeConnectObject } from './figma_connect'
import { Intrinsic } from './intrinsics'

export type ParseRequestPayload = {
  mode: 'PARSE'
  // An array of absolute paths for the parser to process, representing all
  // files matched by the include/exclude globs for this parser.
  paths: string[]
  // Config options passed into this parser (not all parsers) from the config.
  // Each parser's configuration is separate and can take any shape, though we
  // will recommend using the same naming for common concepts like "importPaths".
  config: Record<string, any>
}

const FigmaConnectLink = z.object({
  name: z.string(),
  url: z.string(),
})

export const ParserExecutableMessages = z.array(
  z.object({
    // DEBUG and INFO messages should be output to console by the CLI for the
    // user to read, according to the current log level setting.
    //
    // If any WARNING or ERROR messages are returned, the CLI can determine
    // whether it should proceed with publishing or not based on configuration
    // and the return code should be zero or non-zero as appropriate.
    //
    // There's no need for a "result" field as we can infer this from the
    // messages.
    level: z.union([z.literal('DEBUG'), z.literal('INFO'), z.literal('WARN'), z.literal('ERROR')]),
    // Optional type of message which can be displayed highlighted in the output
    type: z.string().optional(),
    message: z.string(),
    // Optional source location which can be displayed in a standardised form
    sourceLocation: z
      .object({
        file: z.string(),
        line: z.number().optional(),
      })
      .optional(),
  }),
)

// Zod type modelling the response from a Code Connect parser. Zod allows us to
// easily validate the response.
//
// This type somewhat duplicates the `CodeConnectJSON` type from
// `figma_connect.ts`, but as Zod doesn't allow us to fully express recursive
// types such as Intrinsic, we keep this explicit type as well. The `satisfies`
// should ensure the two types stay in sync.
export const ParseResponsePayload = z.object({
  // Array of Code Connect docs parsed from the input files
  docs: z.array(
    z.object({
      // The Figma node URL the doc links to
      figmaNode: z.string(),
      // Optional component name. This is only used for display purposes
      // so can be omitted if it's not relevant to the language/framework
      component: z.string().optional(),
      // Variant restrictions keyed by Figma property name e.g. `{ 'With icon': true }`
      variant: z.record(z.any()).optional(),
      // Optional source path/URL, which can either be a path on disk, which
      // we'll show as a SCM link, or a URL (e.g. for a Storybook parser which
      // wants to link to the story in Storybook rather than the file in Github)
      source: z.string().optional(),
      // Optional source location containing line number information.
      sourceLocation: z
        .object({
          // Optional line number to link to. This is only used if type === 'PATH',
          // to generate a link to the correct line
          line: z.number(),
        })
        .optional(),
      // The JS template function to use for this doc
      template: z.string(),
      templateData: z.object({
        // Map of information describing the props used by the template. This is
        // used by the CLI to validate props before publishing.
        //
        // TODO this Zod type is a bit loose - couldn't work out how to model it exactly
        //
        // TODO We could look to extract this from the template somehow instead,
        // (e.g. run it with figma.properties.* stubbed to record accesses) to
        // avoid needing this duplication.
        props: z.record(z.object({ kind: z.string(), args: z.any() }) as any),
        // Optional array of imports for this component. These are prepended
        // to the example code, but it's useful to keep them separate e.g. if
        // we ever want to auto-insert imports in VS Code. If more control
        // over imports is required, they can be output directly by the template
        // function. Currently they'd have to be output in the code directly, but
        // the original spec does propose templates being able to return import
        // sections separately (not implemented as there's no UI for this)
        //
        // Right now, there's no way to handle gathering imports from children and
        // post-processing them (e.g. combining multiple imports from the same file
        // into a single import). We could consider some way for templates to do this
        // in future.
        imports: z.array(z.string()).optional(),
        // Whether the example should be rendered inline if it's a nested instance
        nestable: z.boolean().optional(),
      }),
      // The language to use for syntax highlighting
      language: z.string(),
      // Label to be used for the example in the UI
      label: z.string(),
      // Optional array of links to be displayed in the UI.
      // TODO Not implemented in UI yet
      links: z.array(FigmaConnectLink).optional(),
    }) satisfies z.ZodType<BaseCodeConnectObject>,
  ),
  // Any info, warning or error messages generated during parsing.
  messages: ParserExecutableMessages,
})

export type PropMapping = Record<string, Intrinsic>

export type ComponentPropertyDefinition = {
  // The property type
  type: 'BOOLEAN' | 'INSTANCE_SWAP' | 'TEXT' | 'VARIANT'
  // The default value of this property
  defaultValue: boolean | string
  // All possible values for this property. Only exists on VARIANT properties
  variantOptions?: string[]
}

export type CreateRequestPayload = {
  mode: 'CREATE'
  // Absolute destination directory for the created file. The parser is free to
  // write to a different directory if appropriate (e.g. it analyses your codebase
  // to identify where this component should go), but usually it should respect this.
  destinationDir: string
  // Optional destination file name. If omitted, the parser can determine the
  // file name itself.
  destinationFile?: string
  // The filepath of the code to be connected. If present, this is used instead of
  // component.normalizedName
  sourceFilepath?: string
  // The export to use from sourceFilepath (TypeScript only)
  sourceExport?: string
  // A mapping of how Figma props should map to code properties
  propMapping?: PropMapping
  // The type signature for the component (React only)
  reactTypeSignature?: ComponentTypeSignature
  // Information about the Figma component. This matches the REST API (except the
  // figmaNodeUrl and normalizedName fields), which should make it easier to
  // implement and maintain as we can just pass it through
  component: {
    // The URL of the Figma component. This field is not in the REST API but
    // is added for convenience.
    figmaNodeUrl: string
    // The ID of the Figma component
    id: string
    // The name of the Figma component
    name: string
    // The name of the Figma component, nomalized for use in code.
    // This field is not in the REST API but is added for convenience.
    normalizedName: string
    // The type of the Figma component
    type: 'COMPONENT' | 'COMPONENT_SET'
    // Map of the Figma component's properties, keyed by property name
    componentPropertyDefinitions: Record<string, ComponentPropertyDefinition>
  }
  // The configuration object for this parser.
  // Each parser's configuration is separate and can take any shape, though we
  // will recommend using the same naming for common concepts like "importPaths".
  config: Record<string, any>
}

export const CreateResponsePayload = z.object({
  // A list of files created, which can be output to the console
  createdFiles: z.array(
    z.object({
      // The absolute path of the created file
      filePath: z.string(),
    }),
  ),
  // Any info, warning or error messages generated during creation.
  messages: ParserExecutableMessages,
})

export type ParserRequestPayload = ParseRequestPayload | CreateRequestPayload
