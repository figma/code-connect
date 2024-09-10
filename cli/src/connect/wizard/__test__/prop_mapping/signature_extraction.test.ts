import path from 'path'
import { ReactProjectInfo, getProjectInfo, getReactProjectInfo } from '../../../project'
import { extractSignature } from '../../signature_extraction'

describe('extractSignature', () => {
  let projectInfo: ReactProjectInfo
  let componentsFilepath: string

  beforeEach(async () => {
    projectInfo = await getProjectInfo(path.join(__dirname, 'tsProgram', 'react'), '').then((res) =>
      getReactProjectInfo(res as ReactProjectInfo),
    )
    componentsFilepath = path.join(__dirname, 'tsProgram', 'react', 'Components.tsx')
  })

  it('Extracts signature containing a broad set of types', async () => {
    const result = await extractSignature({
      nameToFind: 'LotsOfProps',
      sourceFilePath: componentsFilepath,
      projectInfo,
    })
    expect(result).toEqual({
      children: 'React.ReactNode',
      onClick: 'React.MouseEventHandler<HTMLDivElement>',
      title: 'string',
      hasIcon: 'false | true',
      count: 'number',
      anOptionalString: '?string',
      fuzzyMatchingString: 'string',
    })
  })

  it('Extracts signature from a call expression', async () => {
    const result = await extractSignature({
      nameToFind: 'MemoizedComponent',
      sourceFilePath: componentsFilepath,
      projectInfo,
    })
    expect(result).toEqual({
      unmemoized: 'true',
    })
  })

  it('Extracts signature from a variable alias', async () => {
    const result = await extractSignature({
      nameToFind: 'AliasForComponent',
      sourceFilePath: componentsFilepath,
      projectInfo,
    })
    expect(result).toEqual({
      aliased: 'true',
    })
  })

  it('Extracts signature from an alias for variable defined in different file', async () => {
    const result = await extractSignature({
      nameToFind: 'AliasForComponentInDifferentFile',
      sourceFilePath: componentsFilepath,
      projectInfo,
    })
    expect(result).toEqual({
      definedInDifferentFile: 'true',
    })
  })

  it('Extracts signature from a forwardRef wrapped component', async () => {
    const result = await extractSignature({
      nameToFind: 'WithForwardRef',
      sourceFilePath: componentsFilepath,
      projectInfo,
    })
    expect(result).toEqual({
      forwarded: 'true',
    })
  })

  it('Extracts signature from default export', async () => {
    const result = await extractSignature({
      nameToFind: 'default',
      sourceFilePath: componentsFilepath,
      projectInfo,
    })
    expect(result).toEqual({
      isDefault: 'true',
    })
  })

  // TODO support this
  // it('Extracts signature from a re-exported component', async () => {
  //   const result = await extractSignature({
  //     nameToFind: 'ReExportedComponent',
  //     sourceFilePath: componentsFilepath,
  //     projectInfo,
  //   })
  //   expect(result).toEqual({
  //     reExportedComponent: 'true',
  //   })
  // })
})
