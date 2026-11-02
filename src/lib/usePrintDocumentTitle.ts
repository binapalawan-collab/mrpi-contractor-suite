import { useEffect } from 'react'

/**
 * Browser "Save as PDF" commonly uses the page title as the suggested
 * filename. The device ultimately controls the print/save dialog.
 */
export function documentPrintFileStem(documentNumber: string): string {
  return documentNumber
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .slice(0, 120) || 'DOKUMEN'
}

export function usePrintDocumentTitle(documentNumber: string | null | undefined): void {
  useEffect(() => {
    if (!documentNumber?.trim()) return
    const previousTitle = document.title
    document.title = documentPrintFileStem(documentNumber)
    return () => {
      document.title = previousTitle
    }
  }, [documentNumber])
}
