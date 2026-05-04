import { useQuery } from '@tanstack/react-query'
import { getPublicUITemplate } from '@/api/admin'
import type { UITemplate } from '@/types'

export function useCustomTemplate(templateId?: string) {
  return useQuery<UITemplate>({
    queryKey: ['ui-template-public', templateId],
    queryFn: () => getPublicUITemplate(templateId!),
    enabled: !!templateId,
    staleTime: Infinity,
  })
}
