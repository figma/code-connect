import { FigmaConnectLink } from './api'
import { Intrinsic } from './intrinsics'

export interface CodeConnectJSON {
  figmaNode: string
  component?: string
  variant?: Record<string, any>
  source: string
  sourceLocation: { line: number }
  template: string
  templateData: {
    props: Record<string, Intrinsic> | undefined
    imports?: string[]
    nestable?: boolean
  }
  language: 'typescript'
  label: string
  links?: FigmaConnectLink[]
  metadata: {
    cliVersion: string
  }
}
