// This script makes links in README.md absolute, so that we can publish that
// README to npm and the relative links will work e.g. when clicked from the npm
// package page.

import { promises as fs } from 'fs'
import path from 'path'

async function go() {
  const readmePath = path.resolve(__dirname, '../cli/README.md')
  const readmeContent = await fs.readFile(readmePath, 'utf-8')

  const linksNotStartingWithHttpRegex = /\[([^\]]+)\]\((?!https?:\/\/)([^)]+)\)/g
  const updatedReadmeContent = readmeContent.replace(
    linksNotStartingWithHttpRegex,
    `[$1](https://github.com/figma/code-connect/blob/main/$2)`,
  )

  await fs.writeFile(readmePath, updatedReadmeContent)
}

go()
