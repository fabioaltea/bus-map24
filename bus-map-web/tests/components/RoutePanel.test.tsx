import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RoutePanel from '../../src/components/Panels/RoutePanel.js'
import { useMapStore } from '../../src/stores/map.store.js'

beforeEach(() => {
  useMapStore.setState({
    viewState: { longitude: 0, latitude: 0, zoom: 10, pitch: 0, bearing: 0 },
    bbox: null,
    selectedAgencyId: null,
    selectedRouteId: null,
    selectedStopId: null,
  })
})

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('RoutePanel', () => {
  it('renders nothing when no agency is selected', () => {
    const { container } = render(<RoutePanel />, { wrapper })
    expect(container.firstChild).toBeNull()
  })

  it('renders the panel when an agency is selected', () => {
    useMapStore.setState({ selectedAgencyId: 'agency-tfl' })
    render(<RoutePanel />, { wrapper })
    expect(screen.getByText('Routes')).toBeInTheDocument()
  })

  it('shows loading state while fetching routes', () => {
    useMapStore.setState({ selectedAgencyId: 'agency-tfl' })
    render(<RoutePanel />, { wrapper })
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })
})
