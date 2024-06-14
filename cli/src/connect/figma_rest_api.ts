export function getApiUrl(figmaNode: string) {
  return 'https://api.figma.com/v1'
}

// These typings are a subset of the Figma REST API
export namespace FigmaRestApi {
  export enum ComponentPropertyType {
    Boolean = 'BOOLEAN',
    InstanceSwap = 'INSTANCE_SWAP',
    Text = 'TEXT',
    Variant = 'VARIANT',
  }

  export interface ComponentPropertyDefinition {
    defaultValue: boolean | string
    type: ComponentPropertyType
    /**
     * All possible values for this property. Only exists on VARIANT properties
     */
    variantOptions?: string[]
  }

  export interface Node {
    // we don't care about other node types
    type: 'COMPONENT' | 'COMPONENT_SET' | 'OTHER'
    name: string
    id: string
    children: Node[]
  }

  export interface Component extends Node {
    type: 'COMPONENT' | 'COMPONENT_SET'
    componentPropertyDefinitions: Record<string, ComponentPropertyDefinition>
  }
}
