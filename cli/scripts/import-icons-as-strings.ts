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

  // Finds all components starting with 'icon' (this assumes icons are named e.g: 'icon-list')
  components = components.filter(({ name }) => {
    return name.includes('icon')
  })

  // map each icon to a figma.connect call that looks like this:
  // figma.connect('https://figma.com/file/ABc123IjkLmnOPq?node-id=41-41', {
  //   example: () => "icon-list"
  // })
  fs.writeFileSync(
    'icons.figma.tsx',
    `\
  import figma from '@figma/code-connect'

  ${components
    .map(
      (c) => `figma.connect('${c.figmaUrl}', {
    example: () => "${c.name}"
  })`,
    )
    .join('\n')}
  `,
  )
}

generateIcons()
