import { FigmaConnectMeta } from '../connect/api'
import { HtmlTemplateString } from './template_literal'

export type HtmlMeta<P> = Required<Pick<FigmaConnectMeta<P, HtmlTemplateString>, 'example'>> &
  FigmaConnectMeta<P, HtmlTemplateString> & {
    /**
     * A list of import statements that will render in the Code Snippet in Figma.
     */
    imports?: string[]
  }
