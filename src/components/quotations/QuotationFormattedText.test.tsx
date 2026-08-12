import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuotationFormattedText } from './QuotationFormattedText'

describe('QuotationFormattedText', () => {
  it('retains bullets, new lines and blank paragraphs for the quotation PDF', () => {
    const text = 'PAKEJ MEMBINA RUANGAN BARU\n• Struktur lengkap\n- Dinding bata\n\nNota:\n1. Tingkap disediakan'
    const { container } = render(<QuotationFormattedText text={text} />)

    const output = container.querySelector('p')
    expect(output).not.toBeNull()
    if (!output) return
    expect(output.textContent).toBe(text)
    expect(output).toHaveClass('whitespace-pre-wrap')
    expect(output).toHaveClass('break-words')
    expect(output).toHaveClass('[overflow-wrap:anywhere]')
  })
})
