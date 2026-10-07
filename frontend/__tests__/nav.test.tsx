import { render, screen } from '@testing-library/react'
import Nav from '@/components/nav'

jest.mock('next/navigation', () => ({
  usePathname: () => '/alerts'
}))

describe('Dashboard navigation', () => {
  it('renders the primary SOC routes', () => {
    render(<Nav />)
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Live Events' })).toHaveAttribute('href', '/live-events')
    expect(screen.getByRole('link', { name: 'Alerts' })).toHaveAttribute('href', '/alerts')
    expect(screen.getByRole('link', { name: 'Investigations' })).toHaveAttribute('href', '/investigations')
    expect(screen.getByRole('link', { name: 'MITRE ATT&CK' })).toHaveAttribute('href', '/mitre')
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute('href', '/agents')
  })
})