import path from 'path'
import fs from 'fs'
import { findComponentsInDocument } from '../helpers'

const ONE_PAGE_RESPONSE = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, './e2e/e2e_parse_command/dummy_api_response_for_wizard.json'),
    'utf8',
  ),
)
const MANY_PAGES_RESPONSE = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      './e2e/e2e_parse_command/dummy_api_response_for_wizard_many_components.json',
    ),
    'utf8',
  ),
)

const uniquePageIds = (result: any) => {
  return Array.from(new Set(result.map((c: any) => c.pageId)))
}
describe('findComponentsInDocument', () => {
  it('all the component have the pageId if there is one page in the document', () => {
    const result = findComponentsInDocument(ONE_PAGE_RESPONSE.document)

    expect(result).toHaveLength(7)

    expect(uniquePageIds(result)).toEqual(['0:1'])
  })

  it('all the component have the pageId if there are multiple pages in the document', () => {
    const result = findComponentsInDocument(MANY_PAGES_RESPONSE.document)

    expect(result).toHaveLength(98)

    expect(uniquePageIds(result)).toEqual(['0:1', '1:247'])
  })
})
