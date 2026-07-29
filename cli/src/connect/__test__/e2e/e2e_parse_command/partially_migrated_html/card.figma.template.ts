// url=https://figma.com/design/abc/Test?node-id=1:1
// component=AcmeCard
import figma from 'figma'

const instance = figma.selectedInstance

const title = instance.getString('Title')

export default {
  example: figma.code`<acme-card>${title}</acme-card>`,
  imports: ['import "acme/card"'],
  id: 'acme-card',
  metadata: { nestable: true },
}
