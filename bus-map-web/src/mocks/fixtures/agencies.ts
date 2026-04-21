import type { AgencyFeature } from '../../types/api.js'

// GeoJSON Polygon helper
function bboxPolygon(swLat: number, swLng: number, neLat: number, neLng: number) {
  return {
    type: 'Polygon' as const,
    coordinates: [
      [
        [swLng, swLat],
        [neLng, swLat],
        [neLng, neLat],
        [swLng, neLat],
        [swLng, swLat],
      ],
    ],
  }
}

export const MOCK_AGENCIES: AgencyFeature[] = [
  {
    id: 'agency-tfl',
    name: 'Transport for London (TfL)',
    countryCode: 'GB',
    routeCount: 3,
    stopCount: 20,
    boundingBox: JSON.stringify(bboxPolygon(51.4, -0.5, 51.7, 0.1)),
  },
  {
    id: 'agency-atac',
    name: 'ATAC Roma',
    countryCode: 'IT',
    routeCount: 2,
    stopCount: 14,
    boundingBox: JSON.stringify(bboxPolygon(41.8, 12.3, 42.0, 12.6)),
  },
  {
    id: 'agency-mta',
    name: 'MTA New York City Transit',
    countryCode: 'US',
    routeCount: 2,
    stopCount: 16,
    boundingBox: JSON.stringify(bboxPolygon(40.6, -74.1, 40.9, -73.8)),
  },
  {
    id: 'agency-bvg',
    name: 'Berliner Verkehrsbetriebe (BVG)',
    countryCode: 'DE',
    routeCount: 2,
    stopCount: 12,
    boundingBox: JSON.stringify(bboxPolygon(52.4, 13.3, 52.6, 13.6)),
  },
  {
    id: 'agency-tokyometro',
    name: 'Tokyo Metro',
    countryCode: 'JP',
    routeCount: 1,
    stopCount: 10,
    boundingBox: JSON.stringify(bboxPolygon(35.6, 139.6, 35.8, 139.8)),
  },
]
