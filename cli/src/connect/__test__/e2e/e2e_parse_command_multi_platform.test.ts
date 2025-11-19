import { promisify } from 'util'
import { exec } from 'child_process'

describe('e2e test for multi-platform deduplication', () => {
  const cliVersion = require('../../../../package.json').version

  it('should deduplicate across React, iOS, and Compose with labels', async () => {
    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/multi_platform_deduplication --include-template-files --label React`,
      {
        cwd: __dirname,
      },
    )

    const json = JSON.parse(result.stdout)

    // Verify we got docs back
    expect(json.length).toBeGreaterThan(0)

    // Button docs for node-id=1:1
    const buttonDocs = json.filter((doc: any) => doc.figmaNode.includes('node-id=1:1'))

    // Should have exactly 4 Button docs:
    // 1. React Button (first occurrence kept, duplicate removed)
    // 2. React Button variant (different template, kept)
    // 3. iOS Button (different template, kept - duplicate removed)
    // 4. Compose Button (different template, kept)
    // The duplicate React and duplicate iOS should be removed
    expect(buttonDocs).toHaveLength(4)

    // Verify labels - all should have label="React" since we passed --label
    buttonDocs.forEach((doc: any) => {
      expect(doc.label).toBe('React')
    })

    // Verify all have the correct node
    buttonDocs.forEach((doc: any) => {
      expect(doc.figmaNode).toContain('node-id=1:1')
    })

    // Verify we have docs from different parsers/sources
    const languages = buttonDocs.map((doc: any) => doc.language)
    expect(languages).toContain('typescript') // React
    expect(languages).toContain('raw') // iOS and Compose templates

    // Verify we have the TextField doc (different component, node-id=2:2)
    const textFieldDocs = json.filter((doc: any) => doc.figmaNode.includes('node-id=2:2'))
    expect(textFieldDocs).toHaveLength(1)
    expect(textFieldDocs[0].language).toBe('raw')
    expect(textFieldDocs[0].label).toBe('React')

    // Verify all docs have metadata
    json.forEach((doc: any) => {
      expect(doc.metadata).toBeDefined()
      expect(doc.metadata.cliVersion).toBe(cliVersion)
    })

    // Verify specific templates are present
    // React templates contain the Button component
    const reactButtonTemplates = buttonDocs.filter((doc: any) =>
      doc.language === 'typescript' && doc.template.includes('<Button')
    )
    expect(reactButtonTemplates).toHaveLength(2) // Two different React implementations

    const iosButtonTemplate = buttonDocs.find((doc: any) =>
      doc.language === 'raw' && doc.template.includes('figma.swift')
    )
    expect(iosButtonTemplate).toBeDefined()

    const composeButtonTemplate = buttonDocs.find((doc: any) =>
      doc.language === 'raw' && doc.template.includes('figma.kotlin') && doc.template.includes('Button(')
    )
    expect(composeButtonTemplate).toBeDefined()
  })

  it('should deduplicate with platform-specific labels', async () => {
    // Test iOS label
    const iosResult = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/multi_platform_deduplication --include-template-files --label iOS`,
      {
        cwd: __dirname,
      },
    )

    const iosJson = JSON.parse(iosResult.stdout)
    const iosButtonDocs = iosJson.filter((doc: any) => doc.figmaNode.includes('node-id=1:1'))

    // Should still have 4 Button docs (deduplication works the same)
    expect(iosButtonDocs).toHaveLength(4)

    // But all should have iOS label
    iosButtonDocs.forEach((doc: any) => {
      expect(doc.label).toBe('iOS')
    })

    // Test Compose label
    const composeResult = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/multi_platform_deduplication --include-template-files --label Compose`,
      {
        cwd: __dirname,
      },
    )

    const composeJson = JSON.parse(composeResult.stdout)
    const composeButtonDocs = composeJson.filter((doc: any) => doc.figmaNode.includes('node-id=1:1'))

    // Should still have 4 Button docs
    expect(composeButtonDocs).toHaveLength(4)

    // But all should have Compose label
    composeButtonDocs.forEach((doc: any) => {
      expect(doc.label).toBe('Compose')
    })
  })

  it('should not deduplicate different implementations of the same component', async () => {
    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/multi_platform_deduplication`,
      {
        cwd: __dirname,
      },
    )

    const json = JSON.parse(result.stdout)
    const buttonDocs = json.filter((doc: any) => doc.figmaNode.includes('node-id=1:1'))

    // Find the two different React implementations
    const reactDocs = buttonDocs.filter((doc: any) => doc.language === 'typescript')

    // Should have 2 React docs (variant has different template)
    expect(reactDocs).toHaveLength(2)

    // They should have different templates
    const templates = reactDocs.map((doc: any) => doc.template)
    expect(templates[0]).not.toEqual(templates[1])

    // One should have 'disabled' prop, the other 'disabledClass' prop
    const hasDisabledProp = reactDocs.some((doc: any) =>
      doc.templateData.props.disabled !== undefined
    )
    const hasDisabledClassProp = reactDocs.some((doc: any) =>
      doc.templateData.props.disabledClass !== undefined
    )

    expect(hasDisabledProp).toBe(true)
    expect(hasDisabledClassProp).toBe(true)
  })

  it('should preserve source information after deduplication', async () => {
    const result = await promisify(exec)(
      `npx tsx ../../../cli connect parse --skip-update-check --dir ./e2e_parse_command/multi_platform_deduplication --include-template-files`,
      {
        cwd: __dirname,
      },
    )

    const json = JSON.parse(result.stdout)

    // All docs should have source field (even if empty for test fixtures)
    json.forEach((doc: any) => {
      expect(doc.source).toBeDefined()
    })

    // All docs should have sourceLocation
    json.forEach((doc: any) => {
      expect(doc.sourceLocation).toBeDefined()
    })
  })
})
