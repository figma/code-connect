// url=https://figma.com/design/abc/Test?node-id=1:1
// source=src/button.component.ts
// component=AcmeButton
import figma from 'figma'

const instance = figma.selectedInstance

const label = instance.getString('Label')
const disabled = instance.getBoolean('Disabled')

export default {
  example: figma.code`<acme-button disabled="${disabled}">${label}</acme-button>`,
  imports: ['import "acme/button"'],
  id: 'acme-button',
  metadata: { nestable: true },
}
