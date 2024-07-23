package com.figma.code.connect

object CodeConnectExpectedOutputs {
    fun expectedParserResult(
        filePath: String,
        autoAddImports: Boolean,
    ): String {
        return """
            {
  "docs": [
    {
      "component": "ButtonComponent",
      "figmaNode": "http://figma.com/component1",
      "template":"            const figma = require('figma')\n            function __fcc_renderComposeChildren(children, prefix) {\n  return children.flatMap((child, index) => {\n    if (child.type === 'CODE') {\n      let code = child.code.split('\\n').map((line, lineIndex) => {\n        return line.trim() !== '' ? `${'$'}{prefix}${'$'}{line}` : line;\n      }).join('\\n')\n      if (index !== children.length - 1 && !code.replace(/^ +| +${'$'}/g, '').endsWith('\\n')) {\n        code = code + '\\n'\n      }\n      return {\n        ...child,\n        code: code,\n      }\n    } else {\n      let elements = []\n      const shouldAddNewline = index > 0 && children[index - 1].type === 'CODE' && !(children[index - 1].code.replace(/^ +| +${'$'}/g, '').endsWith('\\n'));\n      elements.push({ type: 'CODE', code: `${'$'}{shouldAddNewline ? '\\n' : ''}${'$'}{prefix}` })\n      elements.push(child)\n      if (index < children.length - 1 && !(children[index + 1].type === 'CODE' && children[index + 1].code.replace(/^ +| +${'$'}/g, '').startsWith('\\n'))) {\n        elements.push({ type: 'CODE', code: '\\n' })\n      }\n      return elements\n    }\n  })\n}\n            \n            const text = figma.properties.string('Label')\n            \n\n            const enabled =                 figma.properties.boolean('Enabled', {\n                    true: 'true',\nfalse: 'false'\n                })\n            \n\n            const borderStyle =                 figma.properties.boolean('HasBorder', {\n                    true: 'BorderStyle.bordered',\nfalse: 'BorderStyle.borderless'\n                })\n            \n\n            const icon = figma.properties.instance('Icon')\n            \n\n            const children = figma.properties.children(['Row 1', 'Row 2'])\n            \n\n            const type = figma.properties.enum('button_type', {\n    \"Primary\": 'ButtonType.Primary',\n\"Secondary\": 'ButtonType.Secondary'\n})\n            \n            export default figma.kotlin`ButtonComponent(\n    type = ${'$'}{type},\n    text = \"${'$'}{text.replace(/\\n/g, \"\\\\n\")}\",\n    borderStyle = ${'$'}{borderStyle},\n    enabled = ${'$'}{enabled},\n    icon = ${'$'}{__fcc_renderComposeChildren(icon, '')},\n    contents = {\n${'$'}{__fcc_renderComposeChildren(children, '        ')}\n    }\n)`",
      "templateData": {
        "props": {
          "text": {
            "kind": "string",
            "args": {
              "figmaPropName": "Label"
            }
          },
          "enabled": {
            "kind": "boolean",
            "args": {
              "figmaPropName": "Enabled",
              "valueMapping": {}
            }
          },
          "borderStyle": {
            "kind": "boolean",
            "args": {
              "figmaPropName": "HasBorder",
              "valueMapping": {
                "true": "BorderStyle.bordered",
                "false": "BorderStyle.borderless"
              }
            }
          },
          "icon": {
            "kind": "instance",
            "args": {
              "figmaPropName": "Icon"
            }
          },
          "children": {
            "kind": "children",
            "args": {
                "layers":[
                    "Row1",
                    "Row2"
                ]
            }
          },
          "type": {
            "kind": "enum",
            "args": {
              "figmaPropName": "button_type",
              "valueMapping": {
                "\"Primary\"": "ButtonType.Primary",
                "\"Secondary\"": "ButtonType.Secondary"
              }
            }
          }
        },
        "imports": ${if (autoAddImports) "[\"import com.example.ButtonComponent\"]" else "[]"},
        "nestable": true
      },
      "variant": {
        "some variant": "darkmode",
        "other variant": "blue"
      },
      "language": "kotlin",
      "label": "Compose",
      "sourceLocation": {
        "file": "$filePath",
        "line": 58
      },
      "source": ""
    }
  ],
  "messages": []
}
        """
    }
}
