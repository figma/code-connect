// change to: "import { client } from '@figma/code-connect'"
import { client } from '../src/react/index_react'
import fs from 'fs'

async function generateIcons() {
  // fetch components from a figma file. If the `node-id` query parameter is used,
  // only components within those frames will be included. This is useful if your
  // file is very large, as this will speed up the query by a lot
  let components = await client.getComponents(
    'https://figma.com/file/ABc123IjkLmnOPq?node-id=41-41',
  )

  // Converts icon names from e.g `icon-32-list` to `Icon32List`
  components = components
    .filter(({ name }) => {
      return name.includes('icon')
    })
    .map((component) => ({
      ...component,
      name: component.name
        .split(/[.-]/g)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(''),
    }))

  const uniqueNames = new Set([...components.map((c) => c.name)])

  fs.writeFileSync(
    'icons.figma.tsx',
    `\
  import figma from '@figma/code-connect'

  import {
  ${Array.from(uniqueNames)
    .map((iconName) => `  ${iconName},`)
    .join('\n')}
  } from './Icons'

  ${components.map((c) => `figma.connect(${c.name}, '${c.figmaUrl}')`).join('\n')}
  `,
  )
}

generateIcons()
