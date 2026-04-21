import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AgencyPanel from '../../src/components/Panels/AgencyPanel.js'
import { useMapStore } from '../../src/stores/map.store.js'

// Reset store between tests
beforeEach(() => {
  useMapStore.setState({
    viewState: { longitude: 0, latitude: 0, zoom: 7, pitch: 0, bearing: 0 },
    bbox: { swLat: 51.4, swLng: -0.5, neLat: 51.7, neLng: 0.1 },
    selectedAgencyId: null,
    selectedRouteId: null,
    selectedStopId: null,
  })
})

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('AgencyPanel', () => {
  it('renders the panel heading', () => {
    render(<AgencyPanel />, { wrapper })
    expect(screen.getByText('Agencies')).toBeInTheDocument()
  })

  it('shows loading spinner initially', () => {
    render(<AgencyPanel />, { wrapper })
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('shows Clear button when an agency is selected', () => {
    useMapStore.setState({ selectedAgencyId: 'agency-tfl' })
    render(<AgencyPanel />, { wrapper })
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument()
  })

  it('calls clearSelection when Clear is clicked', () => {
    useMapStore.setState({ selectedAgencyId: 'agency-tfl', selectedRouteId: 'route-1' })
    render(<AgencyPanel />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }))
    expect(useMapStore.getState().selectedAgencyId).toBeNull()
    expect(useMapStore.getState().selectedRouteId).toBeNull()
  })
})
