import type { BlockNode } from '@/ui-runtime/blocks'

export type TemplateStatus = 'draft' | 'published'
export type TemplateType = 'tree' | 'code'

export interface UITemplate {
  id: string
  name: string
  description: string | null
  status: TemplateStatus
  template_type: TemplateType
  feed_config: Record<string, Record<string, string | number>>
  watch_config: Record<string, Record<string, string | number>>
  feed_css: string
  watch_css: string
  code_text: string | null
  /**
   * Phase 4 block-tree shape. Non-null when the template was authored
   * via the block-tree editor; null for legacy CSS-themed templates.
   * Renderer prefers `*_tree` over `*_config` when both are set.
   */
  feed_tree: BlockNode | null
  watch_tree: BlockNode | null
  created_at: string
  updated_at: string
}

export interface UITemplateListItem {
  id: string
  name: string
  description: string | null
  status: TemplateStatus
  template_type: TemplateType
  created_at: string
  updated_at: string
}

export interface UITemplateCreateRequest {
  name: string
  description?: string
  template_type?: TemplateType
}

export interface UITemplateUpdateRequest {
  name?: string
  description?: string
  status?: TemplateStatus
  template_type?: TemplateType
  feed_config?: Record<string, Record<string, string | number>>
  watch_config?: Record<string, Record<string, string | number>>
  feed_css?: string
  watch_css?: string
  code_text?: string
  feed_tree?: BlockNode | null
  watch_tree?: BlockNode | null
}
