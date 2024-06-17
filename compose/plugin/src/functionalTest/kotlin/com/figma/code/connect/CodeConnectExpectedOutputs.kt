package com.figma.code.connect

object CodeConnectExpectedOutputs {
    fun expectedParserResult(filePath: String): String {
        return """
            {
  "docs": [
    {
      "component": "ButtonComponent",
      "figmaNode": "http://figma.com/component1",
      "template": "constfigma=require('figma')\nfunction__fcc_renderComposeChildren(children,prefix){\nreturnchildren.flatMap((child,index)=>{\nif(child.type==='CODE'){\nletcode=child.code.split('\\n').map((line,lineIndex)=>{\nreturnline.trim()!==''?`${'$'}{prefix}${'$'}{line}`:line;\n}).join('\\n')\nif(index!==children.length-1){\ncode=code+'\\n'\n}\nreturn{\n...child,\ncode:code,\n}\n}else{\nletelements=[]\nconstshouldAddNewline=index>0&&children[index-1].type==='CODE'&&!children[index-1].code.endsWith('\\n')\nelements.push({type:'CODE',code:`${'$'}{shouldAddNewline?'\\n':''}${'$'}{prefix}`})\nelements.push(child)\nif(index!==children.length-1){\nelements.push({type:'CODE',code:'\\n'})\n}\nreturnelements\n}\n})\n}\n\nconsttext=figma.properties.string('Label')\n\n\nconstenabled=figma.properties.boolean('Enabled',{\ntrue:'true',\nfalse:'false'\n})\n\n\nconstborderStyle=figma.properties.boolean('HasBorder',{\ntrue:'BorderStyle.bordered',\nfalse:'BorderStyle.borderless'\n})\n\n\nconsticon=figma.properties.instance('Icon')\n\n\nconstchildren=figma.properties.children(['Row1','Row2'])\n\n\nconsttype=figma.properties.enum('button_type',{\n\"Primary\":'ButtonType.Primary',\n\"Secondary\":'ButtonType.Secondary'\n})\n\nexportdefaultfigma.kotlin`ButtonComponent(\ntype=${'$'}{type},\ntext=\"${'$'}{text}\",\nborderStyle=${'$'}{borderStyle},\nenabled=${'$'}{enabled},\nicon=${'$'}{__fcc_renderComposeChildren(icon,'')},\ncontents={\n${'$'}{__fcc_renderComposeChildren(children,'')}\n}\n)`",
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
                "layers":["Row1","Row2"]
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
        "imports": [],
        "nestable": true
      },
      "variant": {
        "\"some variant\"": "\"darkmode\""
      },
      "language": "kotlin",
      "label": "Compose",
      "sourceLocation": {
        "file": "$filePath",
        "line": 57
      },
      "source": ""
    }
  ],
  "messages": []
}
        """
    }
}
