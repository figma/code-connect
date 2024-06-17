import { FigmaConnectLink } from './api'
import { Intrinsic } from './intrinsics'

export type BaseCodeConnectObject = {
  figmaNode: string
  component?: string
  variant?: Record<string, any>
  template: string
  templateData: {
    props?: Record<string, Intrinsic>
    imports?: string[]
    nestable?: boolean
  }
  language: string
  label: string
  links?: FigmaConnectLink[]
  source?: string
  sourceLocation?: { line: number }
}

export type CodeConnectJSON = BaseCodeConnectObject & {
  metadata: {
    cliVersion: string
  }
}
