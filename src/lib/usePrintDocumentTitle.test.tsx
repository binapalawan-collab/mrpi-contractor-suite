import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { documentPrintFileStem, usePrintDocumentTitle } from './usePrintDocumentTitle'

function TestDocument({ number }: { number: string | null }) {
  usePrintDocumentTitle(number)
  return null
}

describe('document print file naming', () => {
  it('preserves invoice and receipt numbers', () => {
    expect(documentPrintFileStem('INV-2026-027')).toBe('INV-2026-027')
    expect(documentPrintFileStem('RCP-2026-018')).toBe('RCP-2026-018')
  })

  it('removes filename-invalid characters', () => {
    expect(documentPrintFileStem(' VO/001 : PRJ-2026-004 ')).toBe('VO-001_-_PRJ-2026-004')
  })

  it('sets the page title while the print page is open and restores it on exit', () => {
    const originalTitle = document.title
    const page = render(<TestDocument number="INV-2026-027" />)
    expect(document.title).toBe('INV-2026-027')
    page.rerender(<TestDocument number="RCP-2026-018" />)
    expect(document.title).toBe('RCP-2026-018')
    page.unmount()
    expect(document.title).toBe(originalTitle)
  })
})
