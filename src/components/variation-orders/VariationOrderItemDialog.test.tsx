import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CatalogCategory, CatalogItem } from '../../lib/catalog'
import type { ProjectItem } from '../../lib/project'
import { blankVariationOrderItem } from '../../lib/variationOrder'
import { VariationOrderItemDialog } from './VariationOrderItemDialog'

const category: CatalogCategory = {
  id: 1, company_id: 1, owner_user_id: 'owner', source_category_id: 1,
  name: 'Lantai', sort_order: 10, is_active: true,
  created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z',
}

const catalogItem: CatalogItem = {
  id: 11, company_id: 1, owner_user_id: 'owner', category_id: 1,
  source_item_id: 1, imported_master_version: 1, code: 'FLR-001',
  name: 'Mozek baharu', description: 'Membekal dan memasang mozek baharu.',
  unit: 'kps', rate: 12, price_note: null, guide_key: 'floor',
  sort_order: 10, is_active: true,
  created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z',
}

const projectItem: ProjectItem = {
  id: 21, project_id: 3, section_id: 4, company_id: 1, owner_user_id: 'owner',
  source_quotation_item_id: 9, item_name: 'Mozek kontrak asal',
  description: 'Membekal dan memasang mozek seperti sebutharga.', measurement_text: '100 kps',
  calculation_method: 'area', unit: 'kps', quantity: 100, rate: 10, amount: 1000,
  sort_order: 10, created_at: '2026-08-06T00:00:00Z',
}

describe('VariationOrderItemDialog', () => {
  it('uses an original project item as a deduction by default', () => {
    const onSave = vi.fn()
    render(<VariationOrderItemDialog categories={[category]} catalogItems={[catalogItem]} projectItems={[projectItem]} initialItem={null} initialDraft={null} onClose={() => undefined} onDraftChange={() => undefined} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skop Asal' }))
    fireEvent.click(screen.getByRole('button', { name: /Mozek kontrak asal/i }))
    expect(screen.getByDisplayValue('Mozek kontrak asal')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Pengurangan')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Tolak (−)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ source_project_item_id: 21, change_type: 'omission', direction: 'deduct' }))
  })

  it('uses a catalog item as an addition', () => {
    const onSave = vi.fn()
    render(<VariationOrderItemDialog categories={[category]} catalogItems={[catalogItem]} projectItems={[projectItem]} initialItem={null} initialDraft={null} onClose={() => undefined} onDraftChange={() => undefined} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /Mozek baharu/i }))
    expect(screen.getByDisplayValue('Mozek baharu')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Tambahan')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Tambah (+)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ catalog_item_id: 11, change_type: 'addition', direction: 'add', rate: '12.00' }))
  })

  it('restores an unfinished item after returning from another app', () => {
    const restored = {
      ...blankVariationOrderItem(),
      item_name: 'Kerja porch belum siap diisi',
      description: 'Maklumat ini mesti kekal.',
      quantity: '8',
      rate: '25.00',
    }
    render(<VariationOrderItemDialog categories={[category]} catalogItems={[catalogItem]} projectItems={[projectItem]} initialItem={null} initialDraft={{ version: 1, updated_at: '2026-08-06T01:00:00Z', section_local_id: 'section-1', mode: 'manual', search: '', category_id: 'all', item: restored }} onClose={() => undefined} onDraftChange={() => undefined} onSave={() => undefined} />)
    expect(screen.getByText(/Draf item terakhir dipulihkan/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Kerja porch belum siap diisi')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Maklumat ini mesti kekal.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('25.00')).toBeInTheDocument()
  })
})
