// url=https://figma.com/design/abc?node=1:1
const figma = require('figma')
const text = figma.currentLayer.__properties__.string('Text')

export default figma.code`def python_code():
  return ${text}`
