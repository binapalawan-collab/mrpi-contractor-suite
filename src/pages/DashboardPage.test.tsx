import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DashboardPage } from './DashboardPage'

describe('DashboardPage', () => {
  it('shows only the agreed starting actions', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Mula lawatan tapak')).toBeInTheDocument()
    expect(screen.getByText('Buat sebutharga')).toBeInTheDocument()
    expect(screen.getByText('Lengkapkan profil')).toBeInTheDocument()
  })
})

