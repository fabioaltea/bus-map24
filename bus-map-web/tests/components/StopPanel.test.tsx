import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StopPanel from '../../src/components/Panels/StopPanel.js'
import { useMapStore } from '../../src/stores/map.store.js'

beforeEach(() => {
  useMapStore.setState({
    viewState: { longitude: 0, latitude: 0, zoom: 14, pitch: 0, bearing: 0 },
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

describe('StopPanel', () => {
  it('renders nothing when no stop is selected', () => {
    const { container } = render(<StopPanel />, { wrapper })
    expect(container.firstChild).toBeNull()
  })

  it('renders the panel when a stop is selected', () => {
    useMapStore.setState({ selectedStopId: 'stop-tfl-1' })
    render(<StopPanel />, { wrapper })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Stop')).toBeInTheDocument()
  })

  it('closes the panel when × is clicked', () => {
    useMapStore.setState({ selectedStopId: 'stop-tfl-1' })
    render(<StopPanel />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: /close stop panel/i }))
    expect(useMapStore.getState().selectedStopId).toBeNull()
  })
})
