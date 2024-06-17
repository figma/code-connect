# Code Connect v0.2.1 (17th June 2024)

## Fixed

### React
- Fixed a bug in v0.2.0 where source paths for components could be incorrect
- Fixed a bug in v0.2.0 where Code Connect files using the new prop types failed to validate

### SwiftUI
- Fixed parsing of Code Connect files using `@FigmaChildren` annotations

# Code Connect v0.2.0 (14th June 2024)

## Breaking changes

- Code Connect now uses a single CLI tool for all supported targets. This ensures consistency and feature parity, and provides the foundations for our upcoming Android Compose and extensibility support.

  For Code Connect Swift users, you should follow the updated [CLI installation instructions](README.md#cli-installation) to install the new CLI version, and update your Code Connect Swift package to `v0.2.0` by following the [Swift installation instructions](swiftui/README.md#installation).

  For Code Connect React users, no change to installation is necessary, and you can simply update the npm dependency to `v0.2.0`.

  If you have a Code Connect configuration file, you will need to ensure it is located in your React or SwiftUI project root (e.g. alongside your `package.json` or `.xcodeproj` file), and you will need to update it to remove the top level `react` or `swiftui` key. The Code Connect CLI will offer to update your config file for you, but in unusual cases a manual migration may be necessary. This allows us to simplify configuration going forward, as each target now has its own configuration file, situated in the project root.

  Please let us know via [GitHub Issues](https://github.com/figma/code-connect/issues) if you encounter any problems.

## Features

### General
- Added `--outDir` option to `connect create` to specify output directory for created files

### React

- Added support for [nested properties](cli/README.md#nested-properties), using `figma.nestedProps`
- Added support for [concatenating strings for CSS class names](cli/README.md#classname), using `figma.className`
- Added support for [text content from layers](cli/README.md#text-content), using `figma.textContent`
- Added support for [wildcards](cli/README.md#wildcard-match) with `figma.children`

### SwiftUI

- Added a new API for [prop mapping](swiftui/README.md#prop-mapping), using `@FigmaString`, `@FigmaBoolean` and `@FigmaEnum` instead of `@FigmaProp`. The old syntax is still supported, but we recommend using the new syntax going forward.
- Added support for [nested children](swiftui/README.md#instance-children), using the `@FigmaChildren` property wrapper
- Added support for rendering single-statement nested Code Connect inline

## Fixed

### General
- Fixed detection of default git branch name
- Nested components now honour variant restrictions (fixes https://github.com/figma/code-connect/issues/54)

### React
- Multiline JSX and strings are now supported in `figma.enum` values
- Added support for objects, JSX and functions in `figma.boolean` enums
- Imported values referenced from a `figma.enum` (e.g. values from an object or `enum`) now render correctly (fixes https://github.com/figma/code-connect/issues/55)
