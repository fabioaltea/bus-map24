import type { RouteFeature } from '../../types/api.js'

// Coordinate sequence helpers — real road-following sequences approximated
const TFL_BUS_1_COORDS = [
  [-0.1246, 51.5014], // Westminster Bridge
  [-0.1134, 51.5058], // Aldwych
  [-0.1128, 51.5074], // Strand
  [-0.1018, 51.5134], // Fleet St
  [-0.0993, 51.5138], // Ludgate Hill
  [-0.0982, 51.5143], // St Paul's
  [-0.0910, 51.5126], // Cannon St
  [-0.0861, 51.5102], // Monument
  [-0.0875, 51.5054], // London Bridge
  [-0.0779, 51.5079], // Tower Hill
]

const TFL_BUS_25_COORDS = [
  [-0.1768, 51.5096], // Oxford Circus
  [-0.1490, 51.5130], // Holborn
  [-0.1124, 51.5140], // Chancery Lane
  [-0.0920, 51.5153], // St Paul's
  [-0.0825, 51.5138], // Bank
  [-0.0779, 51.5079], // Tower Hill
]

const TFL_BUS_15_COORDS = [
  [-0.1357, 51.5138], // Trafalgar Square
  [-0.1246, 51.5014], // Westminster
  [-0.1076, 51.5083], // Blackfriars
  [-0.0915, 51.5115], // Cannon St
  [-0.0861, 51.5102], // Monument
  [-0.0779, 51.5079], // Tower Hill
]

const ATAC_40_COORDS = [
  [12.5020, 41.9015], // Roma Termini
  [12.4918, 41.8984], // Via Nazionale
  [12.4822, 41.8958], // Piazza Venezia
  [12.4768, 41.8948], // Largo Argentina
  [12.4694, 41.8952], // Campo de' Fiori
  [12.4665, 41.8907], // Ponte Garibaldi
  [12.4619, 41.8879], // Trastevere
]

const ATAC_23_COORDS = [
  [12.5020, 41.9015], // Roma Termini
  [12.4929, 41.9012], // Repubblica
  [12.4808, 41.9043], // Villa Borghese
  [12.4748, 41.9120], // Pincio
]

const MTA_M15_COORDS = [
  [-73.9773, 40.7944], // 125 St / 1st Ave
  [-73.9759, 40.7845], // 96 St
  [-73.9762, 40.7746], // 72 St
  [-73.9743, 40.7519], // 42 St
  [-73.9741, 40.7479], // 34 St
  [-73.9742, 40.7352], // 14 St
  [-73.9874, 40.7255], // Houston St
]

const MTA_BX12_COORDS = [
  [-73.9248, 40.8521], // Fordham / Pelham Pkwy
  [-73.9124, 40.8542], // Pelham Parkway
  [-73.8987, 40.8547], // Morris Park
]

const BVG_100_COORDS = [
  [13.3326, 52.5070], // Zoologischer Garten
  [13.3532, 52.5138], // Tiergarten S
  [13.3793, 52.5163], // Brandenburger Tor
  [13.3930, 52.5174], // Unter den Linden
  [13.4124, 52.5219], // Museumsinsel
  [13.4138, 52.5234], // Alexanderplatz
]

const BVG_200_COORDS = [
  [13.3280, 52.5010], // Wittenbergplatz
  [13.3500, 52.5065], // Potsdamer Platz
  [13.3793, 52.5163], // Brandenburger Tor
  [13.4124, 52.5219], // Museumsinsel
  [13.4138, 52.5234], // Alexanderplatz
]

const TOKYO_YAMANOTE_COORDS = [
  [139.7003, 35.6938], // Shinjuku
  [139.7024, 35.6581], // Shibuya
  [139.7022, 35.6702], // Harajuku
  [139.6992, 35.6830], // Yoyogi
  [139.7198, 35.6464], // Ebisu
  [139.7299, 35.6197], // Osaki
]

function multiLineString(coords: number[][]) {
  return JSON.stringify({
    type: 'MultiLineString',
    coordinates: [coords],
  })
}

export const MOCK_ROUTES: RouteFeature[] = [
  {
    id: 'route-tfl-1',
    routeId: 'tfl-bus-1',
    shortName: '1',
    longName: 'Westminster Bridge – Tower Hill',
    routeType: 3,
    color: 'E1251B',
    textColor: 'FFFFFF',
    shapeGeom: multiLineString(TFL_BUS_1_COORDS),
    agencyId: 'agency-tfl',
    agencyName: 'Transport for London (TfL)',
  },
  {
    id: 'route-tfl-25',
    routeId: 'tfl-bus-25',
    shortName: '25',
    longName: 'Oxford Circus – Tower Hill',
    routeType: 3,
    color: 'E1251B',
    textColor: 'FFFFFF',
    shapeGeom: multiLineString(TFL_BUS_25_COORDS),
    agencyId: 'agency-tfl',
    agencyName: 'Transport for London (TfL)',
  },
  {
    id: 'route-tfl-15',
    routeId: 'tfl-bus-15',
    shortName: '15',
    longName: 'Trafalgar Square – Tower Hill',
    routeType: 3,
    color: 'E1251B',
    textColor: 'FFFFFF',
    shapeGeom: multiLineString(TFL_BUS_15_COORDS),
    agencyId: 'agency-tfl',
    agencyName: 'Transport for London (TfL)',
  },
  {
    id: 'route-atac-40',
    routeId: 'atac-40',
    shortName: '40',
    longName: 'Termini – San Pietro',
    routeType: 3,
    color: 'F7A800',
    textColor: '000000',
    shapeGeom: multiLineString(ATAC_40_COORDS),
    agencyId: 'agency-atac',
    agencyName: 'ATAC Roma',
  },
  {
    id: 'route-atac-23',
    routeId: 'atac-23',
    shortName: '23',
    longName: 'Termini – Villa Borghese',
    routeType: 3,
    color: 'F7A800',
    textColor: '000000',
    shapeGeom: multiLineString(ATAC_23_COORDS),
    agencyId: 'agency-atac',
    agencyName: 'ATAC Roma',
  },
  {
    id: 'route-mta-m15',
    routeId: 'mta-m15',
    shortName: 'M15',
    longName: '1st/2nd Avenue Select Bus',
    routeType: 3,
    color: '0039A6',
    textColor: 'FFFFFF',
    shapeGeom: multiLineString(MTA_M15_COORDS),
    agencyId: 'agency-mta',
    agencyName: 'MTA New York City Transit',
  },
  {
    id: 'route-mta-bx12',
    routeId: 'mta-bx12',
    shortName: 'Bx12',
    longName: 'Pelham Bay Park – Inwood',
    routeType: 3,
    color: '0039A6',
    textColor: 'FFFFFF',
    shapeGeom: multiLineString(MTA_BX12_COORDS),
    agencyId: 'agency-mta',
    agencyName: 'MTA New York City Transit',
  },
  {
    id: 'route-bvg-100',
    routeId: 'bvg-100',
    shortName: '100',
    longName: 'Zoologischer Garten – Alexanderplatz',
    routeType: 3,
    color: 'FFCC00',
    textColor: '000000',
    shapeGeom: multiLineString(BVG_100_COORDS),
    agencyId: 'agency-bvg',
    agencyName: 'Berliner Verkehrsbetriebe (BVG)',
  },
  {
    id: 'route-bvg-200',
    routeId: 'bvg-200',
    shortName: '200',
    longName: 'Wittenbergplatz – Alexanderplatz',
    routeType: 3,
    color: 'FFCC00',
    textColor: '000000',
    shapeGeom: multiLineString(BVG_200_COORDS),
    agencyId: 'agency-bvg',
    agencyName: 'Berliner Verkehrsbetriebe (BVG)',
  },
  {
    id: 'route-tokyo-yamanote',
    routeId: 'tokyo-yamanote',
    shortName: 'Yamanote',
    longName: 'Yamanote Line (circular)',
    routeType: 2,
    color: '9ACD32',
    textColor: 'FFFFFF',
    shapeGeom: multiLineString(TOKYO_YAMANOTE_COORDS),
    agencyId: 'agency-tokyometro',
    agencyName: 'Tokyo Metro',
  },
]
