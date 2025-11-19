// url=https://figma.com/design/test?node-id=2:2
const figma = require('figma')
const placeholder = figma.properties.string('Placeholder')

// Different component (TextField) - should not be affected by Button deduplication
export default figma.kotlin`
TextField(
    value = text,
    onValueChange = { text = it },
    placeholder = { Text("${placeholder}") }
)
`
