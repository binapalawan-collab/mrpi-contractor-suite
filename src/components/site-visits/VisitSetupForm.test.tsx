import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyVisitForm } from '../../lib/siteVisit'
import { VisitSetupForm } from './VisitSetupForm'

describe('VisitSetupForm', () => {
  it('suggests a Johor city but keeps it editable', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<VisitSetupForm initialValue={emptyVisitForm()} clients={[]} editing={false} onCancel={() => undefined} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/Nama pelanggan/), { target: { value: 'Encik Ali' } })
    fireEvent.change(screen.getByLabelText(/No. telefon/), { target: { value: '012-3456789' } })
    fireEvent.change(screen.getByLabelText(/Alamat baris 1/), { target: { value: 'No. 1, Jalan Damai' } })
    fireEvent.change(screen.getByLabelText('Poskod'), { target: { value: '85200' } })

    expect(screen.getByLabelText(/Bandar/)).toHaveValue('Jementah')
    expect(screen.getByText(/Masih boleh diubah/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mula Lawatan' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ city: 'Jementah', postcode: '85200' })))
  })
})
