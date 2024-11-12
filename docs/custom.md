# Code Connect (Custom Parsers)

> [!IMPORTANT]
> Custom Parser support for Code Connect is in preview, and the API is liable to change during this period. Please let us know your feedback via [GitHub Issues](https://github.com/figma/code-connect/issues/new/choose).

## Overview

Custom parsers allow users to add support for languages which aren't natively supported by Code Connect.

### Commands

Please refer to the general [documentation](https://github.com/figma/code-connect/tree/main/docs) for more information on the available CLI commands. When using a custom parser, the CLI commands communicate with the supplied parser command to request the appropriate Code Connect docs (for `publish` and `parse`), or to create Code Connect files (for `create`).

#### Publish and Parse commands

When using a custom parser, the `publish` and `parse` commands operate on all the files specified in the `includes` field and excluding those in the `excludes` field of the `figma.config.json`. It then runs the `parserCommand` supplied in the config, passing an object of type `ParseRequestPayload` by stdin. The `parserCommand` then parses the files and generates Code Connect documents, including template code using the [Templates API](https://github.com/figma/code-connect/tree/main/docs/templates_api.md), then outputs a return object of type `ParseResponsePayload` via stdout. If the `publish` command was chosen, then these are published to Figma.
```
npx figma connect publish --config figma.config.json --token <auth token>
```

#### Create

The `create` command fetches the specified component's definition from Figma, then invokes the `parserCommand` in the `figma.config.json` with an object of type `CreateRequestPayload` passed by stdin, which contains details about the components. The parser then creates any relevant Code Connect file(s), and returns an object of type `CreateResponsePayload` to stdout.


```
npx figma connect create "<url_to_node>" -config figma.config.json --token <auth token>
```

### Config
Custom parsers must be configured in the `figma.config.json`. In addition to the [general configuration](https://github.com/figma/code-connect/blob/main/README.md#general-configuration), custom parsers require the following fields:
- `parser` - this should be set to `"custom"`
- `parserCommand` - this is the full path or command to invoke the parser, e.g. `./tools/parser` or `node parser.js`
- `includes` - this field is required for custom parsers, to specify what files are passed to the binary when running `parse` or `publish`

Example figma.config.json file

```typescript
{
  "codeConnect": {
    "parser": "custom",
    "parserCommand": "node ../parserDirectory/parser.js",
    "include": [
      "**/*.figma.test"
    ],
    "exclude": [
    ]
  }
}

```

### Input
The input type for a `parse` request has the following structure:

```typescript
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
```

The input type for a `create` request has the following structure:

```typescript
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

export type ComponentPropertyDefinition = {
  // The property type
  type: 'BOOLEAN' | 'INSTANCE_SWAP' | 'TEXT' | 'VARIANT'
  // The default value of this property
  defaultValue: boolean | string
  // All possible values for this property. Only exists on VARIANT properties
  variantOptions?: string[]
}
```

### Output
The expected type for the output of the `parse` command is below. The `template` field is the Javascript that is used to render the snippet in the Code Connect panel. The API documentation can be found [here](https://github.com/figma/code-connect/tree/main/docs/templates_api.md).

```typescript
export const ParseResponsePayload = {
  // Array of Code Connect docs parsed from the input files
  docs: {
    // The Figma node URL the doc links to e.g. https://www.figma.com/design/123/MyFile?node-id=1-1
    figmaNode: string,
    // Optional component name. This is only used for display purposes
    // so can be omitted if it's not relevant to the language/framework
    component?: string,
    // Variant restrictions keyed by Figma property name e.g. `{ 'With icon': true }`
    variant?: Record<string, string>,
    // Optional source path/URL, which can either be a path on disk, which
    // we'll show as a SCM link, or a URL (e.g. for a Storybook parser which
    // wants to link to the story in Storybook rather than the file in Github)
    source?: string,
    // Optional source location containing line number information.
    sourceLocation?: {
        // Optional line number to link to. This is only used if type === 'PATH',
        // to generate a link to the correct line
          line: number
        },
    // The JS template function to use for this doc
    template: string,
    templateData: {
      // Map of information describing the props used by the template. This is
      // used by the CLI to validate props before publishing.
      props: PropMapping,

      // Optional array of imports for this component. These are prepended
      // to the example code.
      imports?: string[],

      // Whether the example should be rendered inline if it's a nested instance
      nestable?: boolean,
    }),
    // The language to use for syntax highlighting
    language: string,
    // Label to be used for the example in the UI
    label: string,
  }[],
  // Any info, warning or error messages generated during parsing.
  messages: ParserExecutableMessages,
}

export const ParserExecutableMessages = {
  // DEBUG and INFO messages should be output to console by the CLI for the
  // user to read, according to the current log level setting.
  //
  // If any WARNING or ERROR messages are returned, the CLI can determine
  // whether it should proceed with publishing or not based on configuration
  // and the return code should be zero or non-zero as appropriate.
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  // Optional type of message which can be displayed highlighted in the output
  type?: string,
  message: string,
  // Optional source location which can be displayed in a standardised form
  sourceLocation?: {
      file: string,
      line?: number,
    },
}[]

export type PropMapping = Record<string, Intrinsic>
```

The expected type for the output of the `create` command has the following structure:

```typescript
export const CreateResponsePayload = {
  // A list of files created, which can be output to the console
  createdFiles: {
      // The absolute path of the created file
      filePath: string,
    }[],
  // Any info, warning or error messages generated during creation.
  messages: ParserExecutableMessages,
}
```
