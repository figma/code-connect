import fs from 'fs'
import path from 'path'

/**
 * --- EDIT THESE CONSTANTS ---
 */

/** The name of the Code Connect file that will be generated */
const ICONS_CODE_CONNECT_FILE = 'src/components/icons.figma.tsx'

/** Where your Icon components should be imported from in your codebase */
const ICONS_IMPORT_PATH = './Icons'

/**
 * The ID/key of your figma file, for example in:
 * https://figma.com/file/ABc123IjkLmnOPq/
 *                        ^ this is the file key
 */
const FIGMA_FILE_KEY = 'ABc123IjkLmnOPq'

interface IconInfo {
  id: string
  name: string
  figmaName: string
  figmaUrl: string
  size?: string
}

/**
 * Entry point for the script
 * --- EDIT THIS FUNCTION ---
 */
async function generateCodeConnectIcons() {
  console.log('fetching published component info')

  const components = await fetchPublishedFileComponents()
  const icons: IconInfo[] = []

  // --- EDIT THIS ---
  // This is where you define what components are considered icons.
  // For example, this filters components that have 'icon' in their name.
  const isIcon = (name: string) => name.includes('icon')

  for (const icon of components) {
    const meta = getComponentMeta(icon, isIcon)
    if (!meta) continue

    const id = icon.node_id
    const figmaName = meta.name
    const figmaUrl = figmaUrlOfComponent(icon)

    // --- EDIT THIS ---
    // This is where you want to convert the Figma Component name to
    // a Component in your codebase. For example here icons are
    // renamed like this:
    // `icon.32.arrow.right` -> `Icon32ArrowRight`
    let name = figmaName
      .split(/[.-]/g)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')

    icons.push({
      id,
      name,
      figmaName,
      figmaUrl,
    })
  }

  console.log(`found ${icons.length} published icons`)

  await writeCodeConnectFile('.', icons)
}

/**
 * Writes the icons to a Code Connect file.
 * --- EDIT THIS FUNCTION ---
 *
 * @param dir directory to write the file to
 * @param icons icons to write to the file
 */
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

${icons.map((icon) => `figma.connect(${icon.name}, '${icon.figmaUrl}')`).join('\n')}
`,
  )
}

generateCodeConnectIcons()

/**
 * -------------------------
 * Typings and helper functions
 */

/**
 * Gets the id and name of a figma component, and filters out
 * components that are not icons.
 *
 * @param component a published figma component
 * @returns the id and name of the component
 */
function getComponentMeta(
  component: PublishedComponent,
  isIcon: (componentName: string) => boolean,
): { id: string; name: string } | null {
  let id = component.node_id
  let name = component.name

  const isIconComponent = isIcon(component.name)

  // This part handles icons that are variants in a component set
  // and can be removed if you're using separate components for icons.
  if (!isIconComponent) {
    const stateGroup = component.containing_frame.containingStateGroup
    const isIconVariant = stateGroup && isIcon(stateGroup.name)
    if (!isIconVariant) return null

    id = stateGroup.nodeId
    name = stateGroup.name
  }

  return { id, name }
}

/**
 * Fetch all published components from the figma file
 *
 * @returns a list of components
 */
async function fetchPublishedFileComponents() {
  const apiUrl = process.env.API_URL || `https://api.figma.com/v1/files/`
  if (!process.env.FIGMA_ACCESS_TOKEN) {
    throw new Error('FIGMA_ACCESS_TOKEN env variable is not set')
  }
  const url = `${apiUrl}${FIGMA_FILE_KEY}/components`
  const res = await fetch(url, {
    headers: { 'X-Figma-Token': process.env.FIGMA_ACCESS_TOKEN },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Failed to fetch ${url.toString()}: ${res.status}\n\n${txt}`)
  }
  const json = (await res.json()) as PublishedFileComponentsResponse
  return json.meta.components
}

/**
 * Gets the URL of a figma component
 *
 * @param icon a published figma component
 * @returns a URL to the figma component
 */
function figmaUrlOfComponent(icon: PublishedComponent) {
  const fileUrl = process.env.FILE_URL || `https://figma.com/file/`
  const nodeId = icon.containing_frame.containingStateGroup?.nodeId ?? icon.node_id
  const urlId = nodeId.replace(':', '-')
  return `${fileUrl}${icon.file_key}/?node-id=${urlId}`
}

interface PublishedComponent {
  key: string
  file_key: string
  node_id: string
  thumbnail_url: string
  name: string
  description: string
  description_rt: string
  created_at: string
  updated_at: string
  containing_frame: {
    name: string
    nodeId: string
    pageId: string
    pageName: string
    backgroundColor: string
    containingStateGroup?: {
      name: string
      nodeId: string
    }
  }
  user: {
    id: string
    handle: string
    img_url: string
  }
}

interface PublishedFileComponentsResponse {
  error: boolean
  status: number
  meta: {
    components: PublishedComponent[]
  }
}
