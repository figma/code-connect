// url=https://figma.com/design/abc?node-id=1:1
const figma = require('figma')
import { saySomething } from './helper'
import { add } from './helper2'

export default {
  example: figma.code`<Button>${saySomething()} ${add(2, 3)}</Button>`,
  id: 'Button',
  metadata: { nestable: true },
}
