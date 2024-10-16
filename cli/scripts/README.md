# Code Connect for icons

This folder includes example scripts for generating Code Connect files for your components. This is the recommended way of connecting icons, where you might have tons of icons that you don't want to manually connect one by one.

## Usage

To run the scripts, you'll need to set the `FIGMA_ACCESS_TOKEN` env variable. [See here](https://www.figma.com/developers/api#access-tokens) for how to get this token.

Run the scripts with e.g `npx tsx`:
```
FIGMA_ACCESS_TOKEN=<my token> npx tsx import-icons.ts
```

or, if you have the access token in an `.env` file, Code Connect will pick that up:
```
npx tsx import-icons.ts
```

## Code Connect Client

`client` includes helper functions for interacting with Figma files and generating Code Connect files. It uses the [Figma REST API](https://www.figma.com/developers/api) under the hood. This folder includes a few example scripts that can be modified to fit your needs.

`getComponents` will fetch any components in a file, or if a node-id query parameter is provided, any nodes within that frame. The result can then be used to dynamically connect components with `figma.connect()` and write this to a file that can be published with `figma connect publish`.

```
import { client } from '@figma/code-connect'

async function getIcons() {
  const components = await client.getComponents('https://figma.com/file/ABc123IjkLmnOPq?node-id=41-41')
  const icons = components.filter(({ name }) => name.startsWith('icon'))
  // ... write code connect file
}
```

`getComponents` returns an array of `Component` objects with the following type:

```
interface Component {
  // the type of component (only COMPONENT_SET nodes can have variant properties)
  type: 'COMPONENT' | 'COMPONENT_SET'
  // the name of the component in Figma
  name: string
  // a unique ID for this node
  id: string
  // file key for the file containing this node
  fileKey: string
  // URL to this node
  figmaUrl: string
  // Properties for this component, keyed by the name of the property
  // *** Only available for Component Sets ***
  componentPropertyDefinitions: Record<string, {
    defaultValue: boolean | string
    type: 'BOOLEAN' | 'INSTANCE_SWAP' | 'TEXT' | 'VARIANT'

    // All possible values for this property. Only exists on VARIANT properties
    variantOptions?: string[]
  }>
}
```

