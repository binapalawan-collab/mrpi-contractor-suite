export function errorMessage(caught: unknown, fallback = 'Tindakan tidak berjaya.') {
  if (caught instanceof Error && caught.message) return caught.message
  if (caught && typeof caught === 'object' && 'message' in caught && typeof caught.message === 'string') return caught.message
  return fallback
}
