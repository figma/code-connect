# Code Connect for icons

`import-icons.ts` is a node script that uses the [Figma API](https://www.figma.com/developers/api) to pull icons from a Figma file and generate a Code Connect file for your icons. This template is meant to be used as a starting point - some parts will need to be edited to work with your design system and code base. These areas are marked with "EDIT THIS" in the file.

## Usage

Run the script with e.g `npx tsx`:
```
FIGMA_ACCESS_TOKEN=<my token> npx tsx import-icons.ts
```

## Modifying the script

There are many ways your icons can be setup in Figma and in code. This base template assumes that:
* Your icons in Figma include the string "icon" in the name
* Your icon components in code are named similarly and include the size, e.g `Icon32Search`

Here are some examples of how you can modify the script to work with your setup.

### Icons with size as a prop

If your icons in Figma has properties/variants for size, you can modify the script to handle this.

Change the `generateCodeConnectIcons` function:

```ts
// ...

let name = figmaName
  .split(/[.-]/g)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join('')

// added line: remove the size from the component name
name = name.replace(/[0-9]+/g, '')

// added line: extract the size from the figma name.
// default to 16 if no size specified in the Figma name
const [_match, size] = figmaName.match(/([0-9]+)/) ?? [null, '16']

const info: IconInfo = {
  id,
  name,
  figmaName,
  figmaUrl,
  size,
}
icons.push(info)

// ...
```

Change the `writeCodeConnectFile` function to include an `example` that passes the size to your icon component:

```ts
async function writeCodeConnectFile(dir: string, icons: IconInfo[]) {
  const uniqueNames = new Set([...icons.map((icon) => icon.name)])
  fs.writeFileSync(
    path.join(dir, ICONS_CODE_CONNECT_FILE),
    `\
import figma from '@figma/code-connect'
import {
${Array.from(uniqueNames)
  .map((iconName) => `  ${iconName},`)
  .join('\n')}
} from '${ICONS_IMPORT_PATH}'
${icons
  .map(
    (icon) => `figma.connect(${icon.name}, '${icon.figmaUrl}', {
  example: () => <${icon.name} size={${icon.size}} />,
})`,
  )
  .join('\n')}
`,
  )
}
```
