package com.figma.code.connect

object JSTemplateHelpers {
    val renderComposeChildrenFunctionDefinition: String =
        """
        function __fcc_renderComposeChildren(children, prefix) {
          return children.flatMap((child, index) => {
            if (child.type === 'CODE') {
              let code = child.code.split('\n').map((line, lineIndex) => {
                return line.trim() !== '' ? `${'$'}{prefix}${'$'}{line}` : line;
              }).join('\n')
              if (index !== children.length - 1) {
                code = code + '\n'
              }
              return {
                ...child,
                code: code,
              }
            } else {
              let elements = []
              const shouldAddNewline = index > 0 && children[index - 1].type === 'CODE' && !children[index - 1].code.endsWith('\n')
              elements.push({ type: 'CODE', code: `${'$'}{shouldAddNewline ? '\n' : ''}${'$'}{prefix}` })
              elements.push(child)
              if (index !== children.length - 1) {
                elements.push({ type: 'CODE', code: '\n' })
              }
              return elements
            }
          })
        }
        """.trimIndent()

    fun renderComposeChildrenFunctionCall(
        variableName: String,
        prefix: String,
    ): String {
        return "\${__fcc_renderComposeChildren($variableName, '$prefix')}"
    }
}
