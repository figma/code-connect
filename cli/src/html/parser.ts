import ts, { isTemplateExpression, SyntaxKind } from 'typescript'
import {
  stripQuotesFromNode,
  parsePropertyOfType,
  parseFunctionArgument,
} from '../typescript/compiler'
import { FIGMA_CONNECT_CALL, PropMappings, parsePropsObject } from '../connect/intrinsics'
import { CodeConnectJSON } from '../connect/figma_connect'
import { getParsedTemplateHelpersString } from './parser_template_helpers'
import { JSDOM } from 'jsdom'
import { parse } from 'parse5'
import {
  makeCreatePropPlaceholder,
  ParserContext,
  visitPropReferencingNode,
  getReferencedPropsForTemplate,
  ParserError,
  parseLinks,
  parseVariant,
  parseImports,
  ParseOptions,
} from '../connect/parser_common'
import { format } from 'prettier'

function getHtmlTaggedTemplateNode(node: ts.Node): ts.TaggedTemplateExpression | undefined {
  if (ts.isTaggedTemplateExpression(node)) {
    const tag = node.tag
    if (ts.isIdentifier(tag) && tag.text === 'html') {
      return node
    }
  } else if (
    ts.isBlock(node) &&
    node.statements.length === 1 &&
    ts.isReturnStatement(node.statements[0]) &&
    node.statements[0].expression &&
    ts.isTaggedTemplateExpression(node.statements[0].expression) &&
    ts.isIdentifier(node.statements[0].expression.tag) &&
    node.statements[0].expression.tag.text === 'html'
  ) {
    return node.statements[0].expression
  }

  return undefined
}

/**
 * This function converts the HTML template literal into a DOM (using JSDOM) to
 * extract information which is used in generating the template:
 * 1. A dictionary of template placeholders which correspond to HTML attribute
 *    values. The key is the placeholder index, and the value is the attribute
 *    name. The attribute name is unused (it used to be used in the output, but
 *    we need to preserve case to support Angular, which JSDOM can't do unless
 *    you use XHTML mode, and that doesn't support attributes without a value).
 * 2. Whether the template is "nestable" or not. A template is considered
 *    nestable if it has only one top level element.
 *
 * For finding the attribute placeholders, the algorithm is as follows:
 * 1. Build up a full string from the template literal, replacing any value
 *    ${placeholders} with `__FIGMA_PLACEHOLDER_0`, where 0 is the placeholder
 *    index. This results in a valid HTML string, with placeholders we can later
 *    detect.
 * 2. Use JSDOM to turn this into a DOM.
 * 3. Iterate over every node in the DOM, and if the node has any attributes
 *    starting `__FIGMA_PLACEHOLDER`, store the info of these attributes. This
 *    allows us to know which template literal placeholders correspond to HTML
 *    attributes when we construct the template.
 */
function getInfoFromDom(
  templateExp: ts.TemplateExpression | ts.TaggedTemplateExpression,
  parserContext: ParserContext,
): {
  attributePlaceholders: Record<number, string>
  nestable: boolean
} {
  let htmlString: string

  if (ts.isTemplateExpression(templateExp)) {
    // If this is a template expression, build up the HTML string with
    // identifiable placeholders as described above
    htmlString = templateExp.head.text
    templateExp.templateSpans.forEach((part, index) => {
      htmlString += `__FIGMA_PLACEHOLDER_${index}` + part.literal.text
    })
  } else if (templateExp.template.kind === ts.SyntaxKind.FirstTemplateToken) {
    // This is just a template literal with no placeholders
    htmlString = templateExp.template.text
  } else {
    // This should never happen as we check the type in the calling function
    throw new Error(`Unsupported template type: ${SyntaxKind[templateExp.template.kind]}`)
  }

  // First, check for HTML which we cannot handle. JSDOM is quite forgiving,
  // like a browser, but we need to be stricter
  //
  // Duplicate attribute names are handled gracefully by JSDOM (it just keeps
  // one of the attributes), but this breaks our algorithm because some of the
  // placeholders are no longer in the DOM. JSDOM has no way to detect this, but
  // parse5 (which is a library JSDOM uses under the hood) can detect this. We
  // just thrown an error in this case as there's no use case for doing this.
  parse(htmlString, {
    onParseError: (error) => {
      if (error.code === 'duplicate-attribute') {
        throw new ParserError(`Duplicate attribute name in example HTML`, {
          node: templateExp,
          sourceFile: parserContext.sourceFile,
        })
      }
    },
  })

  // Try to format the HTML with prettier, to catch any errors due to invalid
  // HTML which would otherwise result in broken formatting in the UI as
  // prettier is less forgiving
  try {
    // pluginSearchDirs: false is needed as otherwise prettier picks up other
    // prettier plugins in our monorepo and fails on CI
    format(htmlString, { parser: 'html', pluginSearchDirs: false })
  } catch (e) {
    throw new ParserError(`Error parsing example HTML. Check the HTML is valid.`, {
      node: templateExp,
      sourceFile: parserContext.sourceFile,
    })
  }

  // Create a DOM with JSDOM.
  //
  // JSDOM doesn't work properly in all cases if we parse a DOM without a full
  // document, e.g. Vue templates - when traversing with NodeIterator, it
  // doesn't find all elements. We create a Fragment then append it to a full
  // DOM to work around this. The extra wrapping elements don't matter, as we're
  // only interested in the attributes.
  const fragment = JSDOM.fragment(htmlString)
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
  dom.window.document.body.appendChild(fragment)

  const document = dom.window.document
  const NodeFilter = dom.window.NodeFilter

  const attributePlaceholders: Record<number, string> = {}

  function iterateNodeIterator(nodeIterator: NodeIterator) {
    let currentNode: Node | null

    while ((currentNode = nodeIterator.nextNode())) {
      // I couldn't work out how to do this in a way which satisfies TypeScript,
      // so using a check and a cast
      if (currentNode.nodeType === dom.window.Node.ELEMENT_NODE) {
        // Check for any attributes which correspond to placeholders in the
        // template literal, and store their index and name
        for (let attr of (currentNode as Element).attributes) {
          if (attr.value.startsWith('__FIGMA_PLACEHOLDER_')) {
            attributePlaceholders[parseInt(attr.value.split('__FIGMA_PLACEHOLDER_')[1])] = attr.name
          }
        }
      }

      // <TEMPLATE> nodes are not iterated over by default, as they are a way to
      // store a fragment which is not rendered immediately. These are used in
      // e.g. Vue templates, so we need to  iterate over them explicitly.
      if (currentNode.nodeName === 'TEMPLATE') {
        const templateContent = (currentNode as HTMLTemplateElement).content
        const templateNodeIterator = document.createNodeIterator(
          templateContent,
          NodeFilter.SHOW_ELEMENT,
          null,
        )
        iterateNodeIterator(templateNodeIterator)
      }
    }
  }

  // Iterate over all the nodes in the DOM
  const nodeIterator = document.createNodeIterator(document.body, NodeFilter.SHOW_ELEMENT, null)
  iterateNodeIterator(nodeIterator)

  // We check if there is more than one top level child, as we use this as a
  // signal that the template is not "nestable" (and so we render an instance
  // pill rather than render the child's code inline in the UI)
  const topLevelChildrenCount = document.body.children.length

  return {
    attributePlaceholders,
    nestable: topLevelChildrenCount === 1,
  }
}

function escapeTemplateString(code: string) {
  return code.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

/**
 * Parses the example template string passed to `figma.connect()`.
 *
 * @param exp A function or arrow function expression
 * @param parserContext Parser context
 * @param propMappings Prop mappings object as returned by parseProps
 *
 * @returns The code of the render function and a list of imports
 */
export function parseExampleTemplate(
  exp: ts.ArrowFunction,
  parserContext: ParserContext,
  propMappings?: PropMappings,
) {
  const { sourceFile } = parserContext

  if (exp.parameters.length > 1) {
    throw new ParserError(
      `Expected a single props parameter for the render function, got ${exp.parameters.length} parameters`,
      { sourceFile, node: exp },
    )
  }

  const propsParameter = exp.parameters[0]

  if (!exp.body) {
    throw new ParserError(`Expected a body for the render function`, { sourceFile, node: exp })
  }

  const templateNode = getHtmlTaggedTemplateNode(exp.body)

  if (!templateNode) {
    throw new ParserError(
      `Expected only a tagged template literal as the body of the render function`,
      { sourceFile, node: templateNode },
    )
  }

  // Keep track of any props which are referenced in the example so that we can
  // insert the appropriate `figma.properties` call in the JS template
  const referencedProps = new Set<string>()
  let exampleCode = ''
  let nestable = true

  if (isTemplateExpression(templateNode.template)) {
    // This is a template expression with placeholders

    const createPropPlaceholder = makeCreatePropPlaceholder({
      propMappings,
      referencedProps,
      sourceFile,
    })

    // Transform the template to replace any props references with placeholder
    // function calls, normalising the different types of props references
    const transformedTemplate = ts.transform(templateNode.template, [
      (context) => (rootNode) => {
        function visit(node: ts.Node): ts.Node {
          if (ts.isTemplateSpan(node)) {
            const visitResult = visitPropReferencingNode({
              propsParameter,
              node: node.expression,
              createPropPlaceholder,
              useJsx: false,
            })

            if (visitResult) {
              return ts.factory.createTemplateSpan(visitResult, node.literal)
            }
          }

          return ts.visitEachChild(node, visit, context)
        }
        return ts.visitNode(rootNode, visit) as typeof templateNode.template
      },
    ]).transformed[0] as typeof templateNode.template

    // Iterate over the template string spans (i.e. the interleaved strings and
    // placeholders) to build up our example code.
    //
    // Each time we encounter a placeholder (which by this point has been
    // normalised to a __PROP__ placeholder function call), we check if it
    // corresponds to a HTML attribute based on our previous DOM analysis (see
    // getInfoFromDom).
    //
    // If it does, we replace it with a call to
    // `_fcc_renderHtmlAttribute("attributeName", propVariableName), otherwise
    // we replace it with a call to `_fcc_renderHtmlValue(propVariableName)`.
    //
    // We have some additional logic to handle cases where the user accidentally
    // writes `attribute="${props.prop}"` rather than `attribute=${props.prop}`
    // (which is what we show in the docs), as it's easy to make this mistake
    // when copy/pasting.

    // Keep track of whether we're inside an attribute value that is wrapped in quotes,
    // so that we can strip the trailing quote if we are
    let insideAttributeWithQuotes = false

    const infoFromDom = getInfoFromDom(transformedTemplate, parserContext)
    const { attributePlaceholders } = infoFromDom
    nestable = infoFromDom.nestable

    // Handle a chunk of HTML, i.e. a text section of the template string. If
    // the next placeholder is an attribute and this chunk ends with a HTML
    // attribute (i.e. matches a regex like ` text=` or ` text="`), we remove the
    // attribute name so that it's not present in the low level template before the
    // call to _fcc_renderHtmlAttribute.
    function handleHtmlChunk(html: string, nextPlaceholderIsAttribute: boolean) {
      // If we were previously inside an attribute value placeholder with quotes
      // surrounding it, remove the leading quote. We do it like this rather
      // than always removing the leading quote to avoid situations where we
      // mistakenly remove a quote that is part of the actual content.
      if (insideAttributeWithQuotes) {
        html = html.replace(/^"/g, '')
      }

      // If the next placeholder is an attribute, then match the start of the
      // attribute (`attribute=`) at the end of this chunk, so that we can
      // remove it from the example code and store the attribute name
      const attributeMatches = html.match(/(.*\s)([^\s]+)="?$/s)
      if (nextPlaceholderIsAttribute && attributeMatches) {
        // attributeMatches should always have matched here, but we check it
        // anyway so we can fail gracefully if not

        // Add the code up to the attribute, not including the ` attribute=`
        // part, as _fcc_renderHtmlAttribute is responsible for (maybe)
        // rendering that
        exampleCode += escapeTemplateString(attributeMatches[1])

        // If we are in this block, we know that we've matched an attribute, so
        // store whether it ends with a quote
        insideAttributeWithQuotes = html.endsWith('"')

        // Return the attribute name so we can use it to construct the attribute
        // in the output. We do this rather than extract it from the HTML with
        // JSDOM because we want to preserve case, but do not want to parse the
        // doc as XHTML, so there's no way to do it otherwise.
        return attributeMatches[2]
      } else {
        // No attribute to remove, just add the code
        exampleCode += escapeTemplateString(html)
        insideAttributeWithQuotes = false
      }
    }

    // Process the first chunk, which is a special case as it is not in templateSpans
    let maybeAttributeName = handleHtmlChunk(
      transformedTemplate.head.text,
      attributePlaceholders[0] !== undefined,
    )

    // For each section of the template string, check that the expression is a
    // prop placeholder, then add the appropriate template function call
    transformedTemplate.templateSpans.forEach((part, index) => {
      if (!ts.isCallExpression(part.expression)) {
        throw new ParserError(
          `Expected a call expression as a placeholder in the template, got ${SyntaxKind[part.expression.kind]}`,
          { sourceFile, node: part.expression },
        )
      }

      const propNameArg = part.expression.arguments[0]
      if (!ts.isStringLiteral(propNameArg)) {
        throw new ParserError(
          `Expected a string literal as the argument to the placeholder call, got ${SyntaxKind[propNameArg.kind]}`,
          { sourceFile, node: propNameArg },
        )
      }

      const propVariableName = propNameArg.text

      if (attributePlaceholders[index]) {
        exampleCode += `\${_fcc_renderHtmlAttribute('${maybeAttributeName}', ${propVariableName})}`
      } else {
        exampleCode += `\${_fcc_renderHtmlValue(${propVariableName})}`
      }

      // Process the next chunk
      maybeAttributeName = handleHtmlChunk(
        part.literal.text,
        attributePlaceholders[index + 1] !== undefined,
      )
    })
  } else if (templateNode.template.kind === ts.SyntaxKind.FirstTemplateToken) {
    // Template string with no placeholders
    nestable = getInfoFromDom(templateNode, parserContext).nestable
    exampleCode = escapeTemplateString(templateNode.template.text)
  } else {
    throw new ParserError(
      `Expected a template expression as the body of the render function, got ${SyntaxKind[(templateNode.template as any).kind]}`,
      { sourceFile, node: templateNode.template },
    )
  }

  let templateCode = getParsedTemplateHelpersString() + '\n\n'

  templateCode += `const figma = require('figma')\n\n`

  templateCode += getReferencedPropsForTemplate({
    propMappings,
    referencedProps,
    exp,
    sourceFile,
  })

  templateCode += `export default figma.html\`${exampleCode}\`\n`

  return {
    code: templateCode,
    nestable,
  }
}

function parseFigmaConnectArgs(node: ts.CallExpression, parserContext: ParserContext) {
  const required = true

  const figmaNodeUrlArg = parseFunctionArgument(
    node,
    parserContext,
    0,
    ts.isStringLiteral,
    required,
    `\`${FIGMA_CONNECT_CALL}\` must be called with a Figma Component URL as the first argument. Example usage:
\`${FIGMA_CONNECT_CALL}('https://www.figma.com/file/123?node-id=1-1', {
  example: () => html\`<button />\`
})\``,
  )!

  const configObjArg = parseFunctionArgument(
    node,
    parserContext,
    1,
    ts.isObjectLiteralExpression,
    true,
    `The second argument to ${FIGMA_CONNECT_CALL}() must be an object literal. Example usage:
\`${FIGMA_CONNECT_CALL}('https://www.figma.com/file/123?node-id=1-1', {
  example: () => html\`<button />\`
})\``,
  )

  return {
    figmaNodeUrlArg,
    configObjArg,
  }
}

function parseConfigObjectArg(
  configArg: ts.ObjectLiteralExpression | undefined,
  parserContext: ParserContext,
) {
  if (!configArg) {
    return {
      propsArg: undefined,
      exampleArg: undefined,
      variantArg: undefined,
      importsArg: undefined,
      linksArg: undefined,
    }
  }

  const propsArg = parsePropertyOfType({
    objectLiteralNode: configArg,
    propertyName: 'props',
    predicate: ts.isObjectLiteralExpression,
    parserContext,
    required: false,
    errorMessage: `The 'props' property must be an object literal. Example usage:
\`${FIGMA_CONNECT_CALL}('https://www.figma.com/file/123?node-id=1-1', {
  props: {
    disabled: figma.boolean('Disabled'),
    text: figma.string('TextContent'),
  },
  example: (props) => html\`<my-button disabled=\${props.disabled} label=\${props.text} />\`
})\``,
  })

  const exampleArg = parsePropertyOfType({
    objectLiteralNode: configArg,
    propertyName: 'example',
    predicate: ts.isArrowFunction,
    parserContext,
    required: true,
    errorMessage: `The 'example' property must be an arrow function which returns a html tagged template string. Example usage:
\`${FIGMA_CONNECT_CALL}('https://www.figma.com/file/123?node-id=1-1', {
  example: (props) => html\`<my-button />\`
})\``,
  })

  const variantArg = parsePropertyOfType({
    objectLiteralNode: configArg,
    propertyName: 'variant',
    predicate: ts.isObjectLiteralExpression,
    parserContext,
    required: false,
    errorMessage: `The 'variant' property must be an object literal. Example usage:
\`${FIGMA_CONNECT_CALL}('https://www.figma.com/file/123?node-id=1-1', {
  variant: {
    "Has Icon": true
  },
  example: (props) => html\`<my-button />\`
})\``,
  })

  const linksArg = parsePropertyOfType({
    objectLiteralNode: configArg,
    propertyName: 'links',
    predicate: ts.isArrayLiteralExpression,
    parserContext,
    required: false,
    errorMessage: `The 'links' property must be an array literal. Example usage:
\`${FIGMA_CONNECT_CALL}('https://www.figma.com/file/123?node-id=1-1', {
  links: [
    { name: 'Storybook', url: 'https://storybook.com' }
  ],
  example: (props) => html\`<my-button />\`
})\``,
  })

  const importsArg = parsePropertyOfType({
    objectLiteralNode: configArg,
    propertyName: 'imports',
    predicate: ts.isArrayLiteralExpression,
    parserContext,
    required: false,
    errorMessage: `The 'imports' property must be an array literal. Example usage:
\`${FIGMA_CONNECT_CALL}('https://www.figma.com/file/123?node-id=1-1', {
  imports: ['import { Button } from "./Button"']
  example: (props) => html\`<my-button />\`,
})\``,
  })

  return {
    propsArg,
    exampleArg,
    variantArg,
    linksArg,
    importsArg,
  }
}

export async function parseHtmlDoc(
  node: ts.CallExpression,
  parserContext: ParserContext,
  _: ParseOptions,
): Promise<CodeConnectJSON> {
  const { checker, sourceFile, config } = parserContext

  // Parse the arguments to the `figma.connect()` call
  const { figmaNodeUrlArg, configObjArg } = parseFigmaConnectArgs(node, parserContext)

  const { propsArg, exampleArg, variantArg, linksArg, importsArg } = parseConfigObjectArg(
    configObjArg,
    parserContext,
  )

  let figmaNode = stripQuotesFromNode(figmaNodeUrlArg)
  // TODO This logic is duplicated in connect.ts transformDocFromParser due to some type issues
  if (config.documentUrlSubstitutions) {
    Object.entries(config.documentUrlSubstitutions).forEach(([from, to]) => {
      // @ts-expect-error
      figmaNode = figmaNode.replace(from, to)
    })
  }

  const metadata: any = undefined

  const props = propsArg ? parsePropsObject(propsArg, parserContext) : undefined
  const render = exampleArg ? parseExampleTemplate(exampleArg, parserContext, props) : undefined
  const variant = variantArg ? parseVariant(variantArg, sourceFile, checker) : undefined
  const links = linksArg ? parseLinks(linksArg, parserContext) : undefined

  let imports = importsArg ? parseImports(importsArg, parserContext) : undefined

  let template
  if (render?.code) {
    template = render.code
  } else {
    throw new ParserError(`${FIGMA_CONNECT_CALL}() requires an example function`, {
      sourceFile,
      node,
    })
  }

  return {
    figmaNode,
    label: 'Web Components',
    language: 'html',
    component: metadata?.component,
    source: '',
    sourceLocation: { line: -1 },
    variant,
    template,
    templateData: {
      // TODO: `props` here is currently only used for validation purposes,
      // we should eventually remove it from the JSON payload
      props,
      imports,
      // If there's no render function, the default example is always nestable
      nestable: render ? render.nestable : true,
    },
    links,
    metadata: {
      cliVersion: require('../../package.json').version,
    },
  }
}
