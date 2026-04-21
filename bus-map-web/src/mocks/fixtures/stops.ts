import type { StopFeature } from '../../types/api.js'

function point(lng: number, lat: number) {
  return `POINT(${lng} ${lat})`
}

export const MOCK_STOPS: StopFeature[] = [
  // ── London TfL ────────────────────────────────────────────────────────────
  { id: 'stop-tfl-1', stopId: 'tfl-westminster', name: 'Westminster Bridge', location: point(-0.1246, 51.5014), locationType: 0 },
  { id: 'stop-tfl-2', stopId: 'tfl-aldwych', name: 'Aldwych', location: point(-0.1134, 51.5058), locationType: 0 },
  { id: 'stop-tfl-3', stopId: 'tfl-strand', name: 'Strand', location: point(-0.1128, 51.5074), locationType: 0 },
  { id: 'stop-tfl-4', stopId: 'tfl-fleetst', name: 'Fleet Street', location: point(-0.1018, 51.5134), locationType: 0 },
  { id: 'stop-tfl-5', stopId: 'tfl-stpauls', name: "St Paul's Cathedral", location: point(-0.0982, 51.5143), locationType: 0 },
  { id: 'stop-tfl-6', stopId: 'tfl-cannonst', name: 'Cannon Street', location: point(-0.0910, 51.5126), locationType: 0 },
  { id: 'stop-tfl-7', stopId: 'tfl-monument', name: 'Monument', location: point(-0.0861, 51.5102), locationType: 0 },
  { id: 'stop-tfl-8', stopId: 'tfl-londonbridge', name: 'London Bridge', location: point(-0.0875, 51.5054), locationType: 0 },
  { id: 'stop-tfl-9', stopId: 'tfl-towerhill', name: 'Tower Hill', location: point(-0.0779, 51.5079), locationType: 0 },
  { id: 'stop-tfl-10', stopId: 'tfl-oxfordcircus', name: 'Oxford Circus', location: point(-0.1410, 51.5152), locationType: 0 },
  { id: 'stop-tfl-11', stopId: 'tfl-holborn', name: 'Holborn', location: point(-0.1200, 51.5174), locationType: 0 },
  { id: 'stop-tfl-12', stopId: 'tfl-trafalgar', name: 'Trafalgar Square', location: point(-0.1278, 51.5080), locationType: 0 },

  // ── Rome ATAC ─────────────────────────────────────────────────────────────
  { id: 'stop-atac-1', stopId: 'atac-termini', name: 'Roma Termini', location: point(12.5020, 41.9015), locationType: 0 },
  { id: 'stop-atac-2', stopId: 'atac-nazionale', name: 'Via Nazionale', location: point(12.4918, 41.8984), locationType: 0 },
  { id: 'stop-atac-3', stopId: 'atac-venezia', name: 'Piazza Venezia', location: point(12.4822, 41.8958), locationType: 0 },
  { id: 'stop-atac-4', stopId: 'atac-argentina', name: 'Largo Argentina', location: point(12.4768, 41.8948), locationType: 0 },
  { id: 'stop-atac-5', stopId: 'atac-campodeffiori', name: "Campo de' Fiori", location: point(12.4694, 41.8952), locationType: 0 },
  { id: 'stop-atac-6', stopId: 'atac-garibaldi', name: 'Ponte Garibaldi', location: point(12.4665, 41.8907), locationType: 0 },
  { id: 'stop-atac-7', stopId: 'atac-trastevere', name: 'Trastevere', location: point(12.4619, 41.8879), locationType: 0 },
  { id: 'stop-atac-8', stopId: 'atac-repubblica', name: 'Repubblica', location: point(12.4929, 41.9012), locationType: 0 },
  { id: 'stop-atac-9', stopId: 'atac-borghese', name: 'Villa Borghese', location: point(12.4808, 41.9043), locationType: 0 },
  { id: 'stop-atac-10', stopId: 'atac-pincio', name: 'Pincio', location: point(12.4748, 41.9120), locationType: 0 },

  // ── New York MTA ───────────────────────────────────────────────────────────
  { id: 'stop-mta-1', stopId: 'mta-125st', name: '125 St / 1st Ave', location: point(-73.9773, 40.7944), locationType: 0 },
  { id: 'stop-mta-2', stopId: 'mta-96st', name: '96 St / 1st Ave', location: point(-73.9759, 40.7845), locationType: 0 },
  { id: 'stop-mta-3', stopId: 'mta-72st', name: '72 St / 1st Ave', location: point(-73.9762, 40.7746), locationType: 0 },
  { id: 'stop-mta-4', stopId: 'mta-42st', name: '42 St / Grand Central', location: point(-73.9743, 40.7519), locationType: 0 },
  { id: 'stop-mta-5', stopId: 'mta-34st', name: '34 St / 1st Ave', location: point(-73.9741, 40.7479), locationType: 0 },
  { id: 'stop-mta-6', stopId: 'mta-14st', name: '14 St / 1st Ave', location: point(-73.9742, 40.7352), locationType: 0 },
  { id: 'stop-mta-7', stopId: 'mta-houston', name: 'Houston St / 1st Ave', location: point(-73.9874, 40.7255), locationType: 0 },
  { id: 'stop-mta-8', stopId: 'mta-pelham-bx12', name: 'Pelham Pkwy / Fordham Rd', location: point(-73.9248, 40.8521), locationType: 0 },
  { id: 'stop-mta-9', stopId: 'mta-morrispark', name: 'Morris Park Ave', location: point(-73.8987, 40.8547), locationType: 0 },

  // ── Berlin BVG ────────────────────────────────────────────────────────────
  { id: 'stop-bvg-1', stopId: 'bvg-zoo', name: 'Zoologischer Garten', location: point(13.3326, 52.5070), locationType: 0 },
  { id: 'stop-bvg-2', stopId: 'bvg-tiergarten', name: 'Tiergarten S', location: point(13.3532, 52.5138), locationType: 0 },
  { id: 'stop-bvg-3', stopId: 'bvg-brandenburger', name: 'Brandenburger Tor', location: point(13.3793, 52.5163), locationType: 0 },
  { id: 'stop-bvg-4', stopId: 'bvg-unterdenlinden', name: 'Unter den Linden', location: point(13.3930, 52.5174), locationType: 0 },
  { id: 'stop-bvg-5', stopId: 'bvg-museumsinsel', name: 'Museumsinsel', location: point(13.4124, 52.5219), locationType: 0 },
  { id: 'stop-bvg-6', stopId: 'bvg-alexanderplatz', name: 'Alexanderplatz', location: point(13.4138, 52.5234), locationType: 0 },
  { id: 'stop-bvg-7', stopId: 'bvg-wittenbergplatz', name: 'Wittenbergplatz', location: point(13.3280, 52.5010), locationType: 0 },
  { id: 'stop-bvg-8', stopId: 'bvg-potsdamerplatz', name: 'Potsdamer Platz', location: point(13.3500, 52.5065), locationType: 0 },

  // ── Tokyo Metro ───────────────────────────────────────────────────────────
  { id: 'stop-tokyo-1', stopId: 'tokyo-shinjuku', name: 'Shinjuku', location: point(139.7003, 35.6938), locationType: 0 },
  { id: 'stop-tokyo-2', stopId: 'tokyo-shibuya', name: 'Shibuya', location: point(139.7024, 35.6581), locationType: 0 },
  { id: 'stop-tokyo-3', stopId: 'tokyo-harajuku', name: 'Harajuku', location: point(139.7022, 35.6702), locationType: 0 },
  { id: 'stop-tokyo-4', stopId: 'tokyo-yoyogi', name: 'Yoyogi', location: point(139.6992, 35.6830), locationType: 0 },
  { id: 'stop-tokyo-5', stopId: 'tokyo-ebisu', name: 'Ebisu', location: point(139.7198, 35.6464), locationType: 0 },
  { id: 'stop-tokyo-6', stopId: 'tokyo-osaki', name: 'Osaki', location: point(139.7299, 35.6197), locationType: 0 },
]

/** Parse WKT point back to [lng, lat] */
export function stopCoords(stop: StopFeature): [number, number] {
  const m = stop.location.match(/POINT\(([^ ]+) ([^ )]+)\)/)
  if (!m) return [0, 0]
  return [parseFloat(m[1]), parseFloat(m[2])]
}
