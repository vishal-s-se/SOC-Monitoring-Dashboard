import { render, screen } from '@testing-library/react'
import Page from '../app/page'

describe('Home Page', () => {
  it('renders the dashboard heading', () => {
    render(<Page />)
    const heading = screen.getByText(/SOC Monitor Dashboard/i)
    expect(heading).toBeInTheDocument()
  })
})
