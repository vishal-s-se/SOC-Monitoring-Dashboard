import { render, screen } from '@testing-library/react'
import Page from '../app/page'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn() }
}))

jest.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ lastMessage: null })
}))

const mockedGet = api.get as jest.Mock

const getOverviewResponses = () => [
  { items: [{ agent_id: 'agent-1', status: 'ONLINE' }] },
  { items: [{ alert_id: 'alert-1', title: 'Test alert', severity: 'HIGH', status: 'OPEN' }], total: 1 },
  { items: [{ event_id: 'event-1', event_type: 'login', hostname: 'test-host', timestamp: new Date().toISOString() }], total: 1 },
  { items: [{ alert_id: 'alert-1' }], total: 1 }
]

describe('Home Page', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    const responses = getOverviewResponses()
    mockedGet.mockImplementation(() => Promise.resolve(responses.shift() || { items: [], total: 0 }))
  })

  it('loads the dashboard overview and metrics', async () => {
    render(<Page />)
    expect(await screen.findByText('SOC Overview')).toBeInTheDocument()
    expect(screen.getByText('Total Agents')).toBeInTheDocument()
    expect(screen.getByText('Open Alerts')).toBeInTheDocument()
  })

  it('shows the API error state', async () => {
    mockedGet.mockRejectedValueOnce(new Error('API unavailable'))
    render(<Page />)
    expect(await screen.findByText('API unavailable')).toBeInTheDocument()
  })
})
