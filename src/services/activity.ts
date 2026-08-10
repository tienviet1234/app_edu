import { api } from '@/utils/api'

export function logActivity(
  action: string,
  metadata?: Record<string, unknown>,
  resource = 'App',
) {
  api.post('/audit-logs', { action, resource, metadata }).catch(() => {})
}
