import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CatalogCategory, CatalogItem } from '../../lib/catalog'
import { QuotationItemDialog } from './QuotationItemDialog'

const category: CatalogCategory = {
  id: 1, company_id: 1, owner_user_id: 'owner', source_category_id: 1,
  name: 'Dapur', sort_order: 10, is_active: true,
  created_at: '2026-08-05T00:00:00Z', updated_at: '2026-08-05T00:00:00Z',
}

const catalogItem: CatalogItem = {
  id: 11, company_id: 1, owner_user_id: 'owner', category_id: 1,
  source_item_id: 1, imported_master_version: 1, code: 'KIT-001',
  name: 'Tabletop konkrit', description: 'Membina tabletop konkrit lengkap.',
  unit: 'kaki', rate: 180, price_note: null, guide_key: 'tabletop',
  sort_order: 10, is_active: true,
  created_at: '2026-08-05T00:00:00Z', updated_at: '2026-08-05T00:00:00Z',
}

describe('QuotationItemDialog', () => {
  it('keeps a site note as reference until the user chooses an item', () => {
    const onSave = vi.fn()
    render(<QuotationItemDialog categories={[category]} catalogItems={[catalogItem]} initialItem={null} initialDraft={null} sourceNote={{ note_text: 'Catatan ukuran dapur', measurement_text: '12 kaki' }} onClose={() => undefined} onDraftChange={() => undefined} onSave={onSave} />)
    expect(screen.getByText('Catatan ukuran dapur')).toBeInTheDocument()
    expect(screen.getByText(/tidak memilih item atau harga secara automatik/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simpan Item' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Tabletop konkrit/i }))
    expect(screen.getByDisplayValue('Tabletop konkrit')).toBeInTheDocument()
    expect(screen.getByDisplayValue('180.00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Item' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ catalog_item_id: 11, item_name: 'Tabletop konkrit', rate: '180.00' }))
  })

  it('supports a fully manual item', () => {
    const onSave = vi.fn()
    render(<QuotationItemDialog categories={[category]} catalogItems={[catalogItem]} initialItem={null} initialDraft={null} sourceNote={null} onClose={() => undefined} onDraftChange={() => undefined} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Isi / Edit Manual' }))
    fireEvent.change(screen.getByLabelText(/Nama item/), { target: { value: 'Kerja tambahan' } })
    fireEvent.change(screen.getByLabelText(/Keterangan/), { target: { value: 'Skop khas pelanggan' } })
    fireEvent.change(screen.getByLabelText(/Kadar/), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Item' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ catalog_item_id: null, item_name: 'Kerja tambahan', rate: '500.00' }))
  })

  it('restores a partially filled manual item after the app reloads', () => {
    render(<QuotationItemDialog
      categories={[category]}
      catalogItems={[catalogItem]}
      initialItem={null}
      initialDraft={{
        version: 1,
        updated_at: '2026-08-05T01:00:00Z',
        section_local_id: 'section-1',
        mode: 'manual',
        search: '',
        category_id: 'all',
        source_note: { note_text: 'Kabinet bawah sinki', measurement_text: '8 kaki' },
        item: {
          local_id: 'draft-item-1',
          id: null,
          catalog_item_id: null,
          source_site_visit_id: 21,
          source_site_visit_area_id: 22,
          source_site_visit_entry_id: 23,
          item_name: 'Kabinet dapur',
          description: 'Kabinet bawah tabletop',
          measurement_text: 'Kabinet bawah sinki · 8 kaki',
          calculation_method: 'length',
          unit: 'kaki',
          quantity: '8',
          rate: '230.00',
        },
      }}
      sourceNote={{ note_text: 'Kabinet bawah sinki', measurement_text: '8 kaki' }}
      onClose={() => undefined}
      onDraftChange={() => undefined}
      onSave={() => undefined}
    />)

    expect(screen.getByText(/Draf item terakhir dipulihkan/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Kabinet dapur')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Kabinet bawah tabletop')).toBeInTheDocument()
    expect(screen.getByText('Kabinet bawah sinki')).toBeInTheDocument()
    expect(screen.getByDisplayValue('8')).toBeInTheDocument()
    expect(screen.getByDisplayValue('230.00')).toBeInTheDocument()
  })
})
