# Code Connect v1.3.4 (26th June 2025)

### Fixed

# React

- Support getProps inside nestedProps

# Code Connect v1.3.3 (22nd May 2025)

## Features

### Compose
- Enhanced `--verbose` command to output detailed stacktrace.

## Fixed

### General
- Bumped Undici version to address security issue

# Code Connect v1.3.2 (4th April 2025)

## Fixed

### General
- Added support for GitHub Enterprise source links (fixes https://github.com/figma/code-connect/issues/259)

### React
- Fixed incompatibility issue with React 19 (fixes https://github.com/figma/code-connect/issues/265)
- Fixed issue with numeric characters in property names

### HTML
- Allow examples to return strings to support icon IDs (fixes https://github.com/figma/code-connect/issues/252)

# Code Connect v1.3.1 (14th February 2025)

## Fixed

- Allow .gradle files to be detected as Android/Compose projects. Thanks to @sebastienrouif for the [PR](https://github.com/figma/code-connect/pull/237)
- Remove prompts patching (fixes https://github.com/figma/code-connect/issues/241)

## Features

- Added `interactiveSetupFigmaFileUrl` to the interactive setup, allowing you to specify the Figma file to use for connecting components in your `figma.config.json` file.
- Rename `--include-raw-templates` flag to `--include-template-files`. Further details of this feature can be found in the [documentation](https://www.figma.com/code-connect-docs/no-parser/).

### SwiftUI
- Updated `swift-syntax` to point to the new URL. Thanks to @pontusJPaf for the [PR](https://github.com/figma/code-connect/pull/239).

# Code Connect v1.3.0 (28th January 2025)

## Features
- Add support for JSX Figma connection files.
- Added an option to automatically create or append the access token to the project's .env file
- Add better handling of many figma components in the wizard (grouping per page)
- Allow variant restrictions to use boolean-like properties

### General
- Added support for Bitbucket, Gitlab and Azure DevOps for generated source file URLs

## Fixed
- Don't show a red-cross when the file-matching prompt is finished in the wizard
- Add default values for `@FigmaEnum` declarations in SwiftUI

### SwiftUI
- Fixed a formatting error when running the CLI

### React
- Fix nested objects and arrays in props not rendering properly in code snippets
- Fixed a type issue when passing functions as values to `figma.boolean`
- Add support for multiple exports per file in the wizard

### Storybook
- Add support for different props per example (fixes https://github.com/figma/code-connect/issues/143)
- Add support for `links` and `imports` (fixes https://github.com/figma/code-connect/issues/142)

# Code Connect v1.2.4 (5th December 2024)

## Fixed
- Fix issue with CLI not working on some cases in 1.2.3

# Code Connect v1.2.3

## Features

## Fixed
- In the interactive setup, the automatic file linking now matches components exported from index files

### React
- Fix issue where React component references in `props` would serialize to strings when accessed with `getProps()`
- Fix issue with nesting `figma.boolean` and `getProps`

# Code Connect v1.2.2 (5th November 2024)

## Features

### General
- Added support to create Custom parsers. Those allow users to add support for languages which aren't natively supported by Code Connect. Check the [documentation](https://github.com/figma/code-connect/blob/main/docs/custom.md) for more details.

## Fixed

### React
- Only show AI question for React
- Fix error in autolinking in reduce function

# Code Connect v1.2.1 (23rd October 2024)

### General
- Added a `--exit-on-unreadable-files` flag to all commands to exit if any Code Connect files cannot be parsed. We recommend using this option for CI/CD.

## Fixed

### React
- Fixed a bug introduced in 1.2.0 where `nestedProps` referencing a hidden layer would result in an error rendering Code Connect

### SwiftUI
- Fixed potential "index is out of bounds" error.

### General
- Changed how the extension makes HTTP requests to resolve issues when connecting through a proxy. Please [submit a support ticket](https://help.figma.com/hc/en-us/requests/new?ticket_form_id=360001744374) if you continue to have connection issues after this update.

### Compose

- Fixed some parsing errors when running the `create` and `publish` commands

# Code Connect v1.2.0

## Features

### General
- The interactive setup now offers AI support for accurate prop mapping between Figma and code components. Users will now be given the option to use AI during the setup process, which if chosen will assist in creating Code Connect files and attempting to accurately map your code to Figma properties.

  Data is used only for mapping and is not stored or used for training. To learn more, visit https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect

### React
- Added support for returning strings or React components from the `example` function, in addition to JSX
- Added `getProps` on `figma.instance()` which can be used to access props of a nested connected component
- Added `render` on `figma.instance()` which can be used to render a nested connected component dynamically
- Added support for including any custom props in the `props` object, that can be accessed with `getProps` in a parent component

## Fixed

### HTML
- Case of attribute names is now preserved to support Angular (fixes https://github.com/figma/code-connect/issues/172)
- Fixed a bug with `nestedProps` (fixes https://github.com/figma/code-connect/issues/176)

## Fixed

# Code Connect v1.1.4 (26th September 2024)

## Fixed

### React
- Fixed a Prettier bug with the interactive setup
- Removed empty enum mappings from generated Code Connect in interactive setup
- Fixed an issue with props not rendering correctly in the Figma UI if used in the body of a component (e.g. as a hook argument). Any Code Connect with this issue will need republishing to be fixed. (fixes https://github.com/figma/code-connect/issues/167)
- Support mapping from an enum value to a boolean prop in CLI Assistant

## Features

### Compose
- The dependencies required to author Code Connect files now live in a separate module from the plugin and are hosted on Maven Central. Refer to the [documentation](docs/compose.md) for updated instructions on adding Code Connect to your project.

### SwiftUI
- Updated the swift-syntax dependency to include 600.0.0 (Swift 6)

# Code Connect v1.1.3 (11th September 2024)

## Fixed

### HTML
- Fixed an issue where `imports` was incorrectly not included in the TypeScript interface
- Added a note in the [documentation](docs/html.md) that HTML support requires `moduleResolution: "NodeNext"`

### React
- Fixed an issue where `imports` was incorrectly not included in the TypeScript interface (fixes https://github.com/figma/code-connect/issues/159)

## Features

### React
- Code Connect files created in the CLI assistant will now start try to use auto-generated prop mappings in the component props. This is an early feature and support for different types is limited.

# Code Connect v1.1.2 (10th September 2024)

## Fixed

### React
- Fixed an issue with `client` export used by the icon script (fixes https://github.com/figma/code-connect/issues/156)

# Code Connect v1.1.1 (10th September 2024)

## Fixed

### General
- Fixed an issue where the `@figma/code-connect@1.1.0` npm package had an incorrect README

# Code Connect v1.1.0 (10th September 2024)

## Features

### HTML
- Added support for documenting HTML-based frameworks (including Web Components, Angular and Vue), using the new `html` parser. See the [documentation](docs/html.md) for more information.

  HTML support for Code Connect is in preview, and the API is liable to change during this period. Please let us know your feedback via [GitHub Issues](https://github.com/figma/code-connect/issues/new/choose).

### SwiftUI
- Added a `swiftPackagePath` configuration option to specify a custom path to a `Package.swift` file to run Code Connect from.

### React
- Code Connect files created in the CLI assistant will now start including some auto-generated prop mappings between Figma properties and linked code props. This is an early feature and support for different prop types is limited.

### General

- Restructured the Code Connect documentation. All documentation can now be found in the [docs](docs) directory.

## Fixed

### React
- `figma.nestedProps` can now be used in conjunction with `figma.boolean` for conditionally hidden nested instances (fixes https://github.com/figma/code-connect/issues/118, https://github.com/figma/code-connect/issues/89)
- Fixed an issue where backticks could not be used in the example code (fixes https://github.com/figma/code-connect/issues/139)
- Fixed an issue with wildcard paths in import mappings
- Fixed an error when trying to use the icon script with component sets

# Code Connect v1.0.6 (21st August 2024)

## Fixed

### React
- Fixed issue where props with special characters such as hyphens would not render properly. (https://github.com/figma/code-connect/issues/116)

## Features

### React
- figma.enum now supports floating point numbers

### Compose
- Update the dependency for Code Connect to use Kotlin 2.0 libraries


# Code Connect v1.0.5 (13th August 2024)

## Fixed

### React
- Fixed an issue around creation of Code Connect files from the CLI assistant (fixes https://github.com/figma/code-connect/issues/125)

# Code Connect v1.0.4 (7th August 2024)

## Fixed

### React
- Fixed rendering of identifiers, functions and objects when used as children

### SwiftUI
- Updated the `component` definition in FigmaConnect protocol to be optional and have a default implementation.

### Compose
- Added a more helpful error message when the JDK version is too low.

## Features

### General
- Added error message to suggest splitting publish when request too large
- CLI assistant support for selecting file exports to use in Code Connect template
- New --batch-size argument for publish command in order to split uploading into smaller "batches". This will allow for large uploads without having to split running the publish command with different directories.

# Code Connect v1.0.3 (23th July 2024)

## Fixed

### General

### React
- Add support for hyphens in prop names (fixes https://github.com/figma/code-connect/issues/97)

### SwiftUI
- Fixed `checkouts` folder resolution edge case

### Compose
- Fixed issue with `create` command creating invalid code
- Added import resolution for components

## Features

### General
- Added support for SwiftUI and Compose in the CLI Assistant
- Added `--skip-update-check` flag
- Added `--label` flag to the `publish` and `unpublish` commands to publish or unpublish to a custom label
- We now print the label used when running the `publish` command
- Improved autolinking algorithm


# Code Connect v1.0.2 (10th July 2024)

## Fixed

### General
- Improvements to CLI Assistant

### React
- Prevent rendering empty strings as prop values (Fixes: https://github.com/figma/code-connect/issues/67)
- Fix output when there are multiple return statements
- Fix wildcard importPaths mappings with nested folders
- Fix boolean mappings for lowercase boolean-like strings (Fixes: https://github.com/figma/code-connect/issues/70)
- Fix boolean-like keys in enums (Fixes: https://github.com/figma/code-connect/issues/74)

### SwiftUI
- Fix spaces in Xcode file path

# Code Connect v1.0.1 (20th June 2024)

## Fixed

### General
- The automatic update check introduced in v1.0.0 did not show the correct update command for React users with the `@figma/code-connect` package installed locally – it always showed the command for globally updating the package.

  We now show both `npm install @figma/code-connect@latest` and `npm install -g @figma/code-connect@latest` as options. React users with the package installed locally should use `npm install @figma/code-connect@latest`, and users of other targets (or with the package installed globally) should use `npm install -g @figma/code-connect@latest`.

  We have temporarily removed the `update` command added in v1.0.0.

# Code Connect v1.0.0 (19th June 2024)

## Features

### General
- Added [documentUrlSubstitutions](README.md#documenturlsubstitutions) config option

### Jetpack Compose
- Added support for Android Jetpack Compose. See the [README](compose/README.md) to get started

### React
- Interactive setup flow, launched by running `figma connect`, which guides you through the setup process and auto-connects your components

## Fixed

### General
- Automatic config migration (added in v0.2.0) now correctly preserves `include`/`exclude` config options
- Icon script helpers moved to a named export so they can be imported correctly (see [README](cli/scripts/README.md))

### React
- Nested helpers within `figma.nestedProps` now work as expected
- Props can now be rendered in nested object props

### SwiftUI
- `create` now outputs Swift files with the correct syntax

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

- Added support for [nested properties](docs/react.md#nested-properties), using `figma.nestedProps`
- Added support for [concatenating strings for CSS class names](docs/react.md#classname), using `figma.className`
- Added support for [text content from layers](docs/react.md#text-content), using `figma.textContent`
- Added support for [wildcards](docs/react.md#wildcard-match) with `figma.children`

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
