import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Client, SiteVisit, SiteVisitArea, SiteVisitGuide } from '../../lib/siteVisit'
import { VisitWorkspace } from './VisitWorkspace'

const visit: SiteVisit = {
  id: 1,
  company_id: 1,
  owner_user_id: 'user-1',
  client_id: 1,
  project_title: 'Cadangan Kerja Ubah Suai Rumah',
  visit_date: '2026-08-05',
  address_line_1: 'No. 1, Jalan Damai',
  address_line_2: null,
  postcode: '85000',
  city: 'Segamat',
  state: 'Johor',
  country_code: 'MY',
  status: 'draft',
  created_at: '2026-08-05T00:00:00Z',
  updated_at: '2026-08-05T00:00:00Z',
}

const client: Client = {
  id: 1,
  company_id: 1,
  owner_user_id: 'user-1',
  name: 'Encik Ali',
  phone: '012-3456789',
  phone_normalized: '0123456789',
  email: null,
  is_active: true,
  created_at: '2026-08-05T00:00:00Z',
  updated_at: '2026-08-05T00:00:00Z',
}

const area: SiteVisitArea = {
  id: 1,
  company_id: 1,
  owner_user_id: 'user-1',
  site_visit_id: 1,
  name: 'Porch',
  sort_order: 10,
  is_active: true,
  created_at: '2026-08-05T00:00:00Z',
  updated_at: '2026-08-05T00:00:00Z',
}

const guide: SiteVisitGuide = {
  guide_key: 'porch',
  name_ms: 'Porch',
  description_ms: 'Semak lantai dan saliran.',
  prompts_ms: ['Panjang dan lebar', 'Arah cerun'],
  sort_order: 10,
  is_active: true,
  created_at: '2026-08-05T00:00:00Z',
  updated_at: '2026-08-05T00:00:00Z',
}

describe('VisitWorkspace', () => {
  it('keeps the site workflow free-text, optional and price-free', () => {
    render(<VisitWorkspace visit={visit} client={client} areas={[area]} entries={[]} photos={[]} guides={[guide]} photoUrls={new Map()} busy={false} onBack={() => undefined} onEditVisit={() => undefined} onAddArea={vi.fn()} onRenameArea={vi.fn()} onSaveEntry={vi.fn()} onSetEntryArchived={vi.fn()} onRemovePhoto={vi.fn()} onSetReady={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Catatan/ }))
    expect(screen.getByPlaceholderText('Contoh: Porch nak buat lantai imprint 10 x 10')).toBeInTheDocument()
    expect(screen.getByText(/Tidak perlu pilih unit atau masukkan harga/)).toBeInTheDocument()
    expect(screen.queryByText(/suara/i)).not.toBeInTheDocument()

    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: /Panduan butiran kerja/ }))
    fireEvent.click(dialog.getByRole('button', { name: 'Porch' }))
    expect(dialog.getByText('Panjang dan lebar')).toBeInTheDocument()
    expect(dialog.getByText(/tidak menambah item atau harga/)).toBeInTheDocument()
  })
})
