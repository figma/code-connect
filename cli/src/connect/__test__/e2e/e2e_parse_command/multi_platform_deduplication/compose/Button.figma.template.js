// url=https://figma.com/design/test?node-id=1:1
const figma = require('figma')
const label = figma.properties.string('Label')
const disabled = figma.properties.boolean('Disabled')

export default figma.kotlin`
Button(
    text = "${label}",
    enabled = ${disabled}.not()
)
`
