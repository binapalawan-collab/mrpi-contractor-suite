import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: null }),
}))

describe('DashboardPage', () => {
  it('shows only the agreed starting actions', () => {
    render(<DashboardPage />)

    expect(screen.getByText('Mula lawatan tapak')).toBeInTheDocument()
    expect(screen.getByText('Buat sebutharga')).toBeInTheDocument()
    expect(screen.getByText('Semak kewangan')).toBeInTheDocument()
    expect(screen.getByText('Lengkapkan profil')).toBeInTheDocument()
  })
})
