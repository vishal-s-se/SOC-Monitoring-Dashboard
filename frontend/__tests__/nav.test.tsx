import { render, screen } from '@testing-library/react'
import Nav from '@/components/nav'

jest.mock('next/navigation', () => ({
  usePathname: () => '/alerts',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  jest.clearAllMocks();
});

describe('Dashboard navigation', () => {
  it('renders the primary SOC routes', () => {
    render(<Nav />)
    const overviewLinks = screen.getAllByRole('link', { name: 'Overview' });
    const rootLink = overviewLinks.find(link => link.getAttribute('href') === '/');
    expect(rootLink).toBeInTheDocument();
    const liveLinks = screen.getAllByRole('link', { name: 'Live Events' });
    const liveRoot = liveLinks.find(link => link.getAttribute('href')?.startsWith('/live-events'));
    expect(liveRoot).toBeInTheDocument();
    const alertsLinks = screen.getAllByRole('link', { name: 'Alerts' });
    const alertsRoot = alertsLinks.find(link => link.getAttribute('href')?.startsWith('/alerts'));
    expect(alertsRoot).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Investigations' })).toHaveAttribute('href', '/investigations');
    expect(screen.getByRole('link', { name: 'MITRE ATT&CK' })).toHaveAttribute('href', '/mitre');
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute('href', '/agents');
  });
});