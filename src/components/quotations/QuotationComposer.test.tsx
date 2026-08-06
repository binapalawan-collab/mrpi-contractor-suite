import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyQuotationDraft, type QuotationDraftItem } from '../../lib/quotation'
import { readQuotationItemDraft, saveQuotationItemDraft } from '../../lib/quotationDrafts'
import { QuotationComposer } from './QuotationComposer'

const pendingItem: QuotationDraftItem = {
  local_id: 'pending-item-1',
  id: null,
  catalog_item_id: null,
  source_site_visit_id: 8,
  source_site_visit_area_id: 9,
  source_site_visit_entry_id: 10,
  item_name: 'Tabletop konkrit',
  description: 'Tabletop konkrit siap kemasan mozek',
  measurement_text: 'Bahagian sinki · 12 kaki',
  calculation_method: 'length',
  unit: 'kaki',
  quantity: '12',
  rate: '230.00',
}

describe('QuotationComposer item recovery', () => {
  beforeEach(() => localStorage.clear())

  it('reopens an unfinished item and keeps its site visit note', () => {
    const draft = createEmptyQuotationDraft()
    draft.source_site_visit_id = 8
    draft.sections = [{
      local_id: 'section-kitchen',
      id: null,
      source_site_visit_id: 8,
      source_site_visit_area_id: 9,
      name: 'Dapur',
      items: [],
    }]
    saveQuotationItemDraft('owner-1', 'visit:8', {
      section_local_id: 'section-kitchen',
      item: pendingItem,
      mode: 'manual',
      search: '',
      category_id: 'all',
      source_note: { note_text: 'Bahagian sinki', measurement_text: '12 kaki' },
    })

    render(<QuotationComposer
      draft={draft}
      clients={[]}
      categories={[]}
      catalogItems={[]}
      sourceAreas={[]}
      sourceEntries={[]}
      draftOwnerUserId="owner-1"
      draftStorageId="visit:8"
      editable
      busy={false}
      autosaveNotice="Draf disimpan"
      onChange={vi.fn()}
      onBack={vi.fn()}
      onSave={vi.fn(async () => undefined)}
      onSend={vi.fn(async () => undefined)}
      onStartRevision={vi.fn(async () => undefined)}
      onAccept={vi.fn(async () => undefined)}
      onContinueAsProject={vi.fn(async () => undefined)}
      onPrint={vi.fn()}
      onWhatsApp={vi.fn()}
    />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Draf item terakhir dipulihkan/i)).toBeInTheDocument()
    expect(screen.getByText('Bahagian sinki')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Tabletop konkrit')).toBeInTheDocument()
    expect(screen.getByText(/Sebutharga ini dipautkan kepada lawatan tapak/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
    expect(readQuotationItemDraft('owner-1', 'visit:8')).toBeNull()
  })

  it('offers project conversion only after the quotation is accepted', () => {
    const draft = createEmptyQuotationDraft()
    draft.quotation_id = 23
    draft.header.quotation_no = 'SH050826-01'
    draft.status = 'accepted'
    const onContinueAsProject = vi.fn(async () => undefined)

    render(<QuotationComposer
      draft={draft}
      clients={[]}
      categories={[]}
      catalogItems={[]}
      sourceAreas={[]}
      sourceEntries={[]}
      draftOwnerUserId="owner-1"
      draftStorageId="quote:23"
      editable={false}
      busy={false}
      autosaveNotice="Draf disimpan"
      onChange={vi.fn()}
      onBack={vi.fn()}
      onSave={vi.fn(async () => undefined)}
      onSend={vi.fn(async () => undefined)}
      onStartRevision={vi.fn(async () => undefined)}
      onAccept={vi.fn(async () => undefined)}
      onContinueAsProject={onContinueAsProject}
      onPrint={vi.fn()}
      onWhatsApp={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Teruskan Sebagai Projek' }))
    expect(onContinueAsProject).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Tanda Diterima' })).not.toBeInTheDocument()
  })

  it('keeps customer and project details collapsed by default', () => {
    const draft = createEmptyQuotationDraft()
    draft.header.client_name = 'Encik Azman'
    draft.header.client_phone = '0196547635'
    draft.header.address_line_1 = '12, Jalan Mawar'
    draft.header.postcode = '85000'
    draft.header.city = 'Segamat'

    render(<QuotationComposer
      draft={draft}
      clients={[]}
      categories={[]}
      catalogItems={[]}
      sourceAreas={[]}
      sourceEntries={[]}
      draftOwnerUserId="owner-1"
      draftStorageId="manual"
      editable
      busy={false}
      autosaveNotice="Draf disimpan"
      onChange={vi.fn()}
      onBack={vi.fn()}
      onSave={vi.fn(async () => undefined)}
      onSend={vi.fn(async () => undefined)}
      onStartRevision={vi.fn(async () => undefined)}
      onAccept={vi.fn(async () => undefined)}
      onContinueAsProject={vi.fn(async () => undefined)}
      onPrint={vi.fn()}
      onWhatsApp={vi.fn()}
    />)

    const toggle = screen.getByRole('button', { name: /Pelanggan & projek/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('0196547635')).toBeInTheDocument()
    expect(screen.getByText(/12, Jalan Mawar, 85000 Segamat/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Nama pelanggan/i)).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText(/Nama pelanggan/i)).toHaveValue('Encik Azman')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText(/Nama pelanggan/i)).not.toBeInTheDocument()
  })
})
