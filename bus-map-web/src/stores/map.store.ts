import { create } from 'zustand'

export interface ViewState {
  longitude: number
  latitude: number
  zoom: number
  pitch: number
  bearing: number
}

export interface BBox {
  swLat: number
  swLng: number
  neLat: number
  neLng: number
}

export function bboxToString(bbox: BBox): string {
  return `${bbox.swLat},${bbox.swLng},${bbox.neLat},${bbox.neLng}`
}

interface MapState {
  viewState: ViewState
  bbox: BBox | null
  selectedAgencyId: string | null
  selectedRouteId: string | null
  selectedStopId: string | null
  selectedTripId: string | null
  checkedRouteIds: string[]

  // Timeline
  isLive: boolean
  timelineDate: string   // YYYY-MM-DD
  timelineSec: number    // seconds since midnight (0-86399)
  isPlaying: boolean
  playbackSpeed: number  // 1 | 2 | 4 | 8

  setViewState: (vs: ViewState) => void
  setBBox: (bbox: BBox) => void
  selectAgency: (id: string | null) => void
  selectRoute: (id: string | null) => void
  selectStop: (id: string | null) => void
  selectTrip: (id: string | null) => void
  toggleRouteVisibility: (id: string) => void
  clearSelection: () => void
  setTimeline: (date: string, sec: number) => void
  setLive: () => void
  setPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
}

export const useMapStore = create<MapState>((set) => ({
  viewState: {
    longitude: 12.4964,
    latitude: 41.9028,
    zoom: 3,
    pitch: 0,
    bearing: 0,
  },
  bbox: null,
  selectedAgencyId: null,
  selectedRouteId: null,
  selectedStopId: null,
  selectedTripId: null,
  checkedRouteIds: [],

  isLive: true,
  timelineDate: new Date().toISOString().slice(0, 10),
  timelineSec: 0,
  isPlaying: false,
  playbackSpeed: 1,

  setViewState: (viewState) => set({ viewState }),
  setBBox: (bbox) => set({ bbox }),
  selectAgency: (selectedAgencyId) => set({ selectedAgencyId, selectedRouteId: null, selectedStopId: null, selectedTripId: null, checkedRouteIds: [] }),
  selectRoute: (selectedRouteId) => set({ selectedRouteId, selectedStopId: null }),
  selectStop: (selectedStopId) => set({ selectedStopId }),
  selectTrip: (selectedTripId) => set({ selectedTripId }),
  toggleRouteVisibility: (id) =>
    set((s) =>
      s.checkedRouteIds.includes(id)
        ? { checkedRouteIds: s.checkedRouteIds.filter((x) => x !== id) }
        : { checkedRouteIds: [...s.checkedRouteIds, id] },
    ),
  clearSelection: () => set({ selectedAgencyId: null, selectedRouteId: null, selectedStopId: null, selectedTripId: null, checkedRouteIds: [] }),
  setTimeline: (timelineDate, timelineSec) => set({ isLive: false, timelineDate, timelineSec }),
  setLive: () => set({ isLive: true, isPlaying: false }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
}))
