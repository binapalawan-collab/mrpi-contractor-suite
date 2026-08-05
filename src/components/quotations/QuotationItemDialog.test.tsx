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
    render(<QuotationItemDialog categories={[category]} catalogItems={[catalogItem]} initialItem={null} sourceNote={{ note_text: 'Catatan ukuran dapur', measurement_text: '12 kaki' }} onClose={() => undefined} onSave={onSave} />)
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
    render(<QuotationItemDialog categories={[category]} catalogItems={[catalogItem]} initialItem={null} sourceNote={null} onClose={() => undefined} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Isi / Edit Manual' }))
    fireEvent.change(screen.getByLabelText(/Nama item/), { target: { value: 'Kerja tambahan' } })
    fireEvent.change(screen.getByLabelText(/Keterangan/), { target: { value: 'Skop khas pelanggan' } })
    fireEvent.change(screen.getByLabelText(/Kadar/), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Item' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ catalog_item_id: null, item_name: 'Kerja tambahan', rate: '500.00' }))
  })
})
