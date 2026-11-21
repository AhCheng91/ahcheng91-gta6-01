// The plan of Puerto Marea: districts, street grid, building parcels and fixed spawn data.

function createRandom(seed) {
  let value = seed >>> 0;
  return function next() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export const DISTRICTS = [
  { id: 'playa', name: 'Playa Ceniza', sub: 'THE ASHEN SHORE', tint: '#7fd6c8', minX: -360, maxX: -160, minZ: -60, maxZ: 52 },
  { id: 'puerto', name: 'Puerto Nuevo', sub: 'CONTAINER DOCKS', tint: '#f4a259', minX: 80, maxX: 360, minZ: -60, maxZ: 130 },
  { id: 'barrio', name: 'Barrio Sal', sub: 'NIGHT MARKET', tint: '#ff7f6e', minX: -360, maxX: -80, minZ: 52, maxZ: 130 },
  { id: 'malecon', name: 'Malecón Viejo', sub: 'OLD WATERFRONT', tint: '#ffd08a', minX: -160, maxX: 80, minZ: -60, maxZ: 52 },
  { id: 'corona', name: 'Corona Heights', sub: 'DOWNTOWN', tint: '#9fc8ff', minX: -360, maxX: 360, minZ: 130, maxZ: 230 },
  { id: 'cerro', name: 'Cerro Verde', sub: 'HILLSIDE VILLAS', tint: '#a8dda0', minX: -360, maxX: 360, minZ: 230, maxZ: 360 },
];

export const ROADS = [
  { id: 'malecon', name: 'Malecón Viejo', axis: 'x', at: -22, from: -340, to: 340, width: 16 },
  { id: 'sal', name: 'Calle Sal', axis: 'x', at: 52, from: -340, to: 340, width: 14 },
  { id: 'muelle', name: 'Avenida Muelle', axis: 'x', at: 120, from: -340, to: 340, width: 14 },
  { id: 'corona', name: 'Corona Avenue', axis: 'x', at: 194, from: -340, to: 340, width: 16 },
  { id: 'ceniza', name: 'Ceniza Road', axis: 'x', at: 262, from: -340, to: 340, width: 14 },
  { id: 'av-240', name: 'Avenida Oeste', axis: 'z', at: -240, from: -56, to: 340, width: 14 },
  { id: 'av-160', name: 'Avenida Cangrejo', axis: 'z', at: -160, from: -56, to: 340, width: 14 },
  { id: 'av-80', name: 'Calle Espejo', axis: 'z', at: -80, from: -56, to: 340, width: 14 },
  { id: 'av-0', name: 'Avenida Central', axis: 'z', at: 0, from: -56, to: 340, width: 14 },
  { id: 'av-80e', name: 'Calle Marea', axis: 'z', at: 80, from: -56, to: 340, width: 14 },
  { id: 'av-160e', name: 'Avenida Puerto', axis: 'z', at: 160, from: -56, to: 340, width: 14 },
  { id: 'av-240e', name: 'Boulevard Cerro', axis: 'z', at: 240, from: -56, to: 340, width: 14 },
];

export const SPAWN_POINTS = {
  onFoot: { x: -9, z: -22.6, yaw: Math.PI / 2 },
  garage: { x: 24, z: 78, yaw: 0 },
  docks: { x: 180, z: 108, yaw: Math.PI / 2 },
  hills: { x: 240, z: 284, yaw: -Math.PI / 2 },
};

export const MARKERS = [
  { id: 'valet', label: 'VALET LOT', x: -8, z: -27 },
  { id: 'market', label: 'SALT MARKET', x: -190, z: 70 },
  { id: 'manifest', label: 'MANIFEST VAN', x: 178, z: 98 },
  { id: 'tower', label: 'CORONA TOWER', x: 28, z: 194 },
  { id: 'beach', label: 'PLAYA CENIZA', x: -270, z: -36 },
  { id: 'causeway', label: 'CAUSEWAY', x: -330, z: -46 },
];

export const CRAB_SPOTS = [
  { x: -312, z: -38 }, { x: -222, z: -37 }, { x: -124, z: -9 }, { x: -38, z: 30 },
  { x: 36, z: -8 }, { x: 118, z: 38 }, { x: 206, z: -9 }, { x: 298, z: 40 },
  { x: -198, z: 104 }, { x: 44, z: 168 }, { x: 204, z: 222 }, { x: -104, z: 300 },
];

function buildParkingLots() {
  const lots = [];
  const trafficTypes = ['sedan', 'pickup', 'van', 'lowrider', 'sedan', 'scooter', 'van', 'sedan'];
  const trafficColours = ['#e8e3d6', '#5d7d8c', '#b9503f', '#d8a54b', '#3f6e65', '#e9d0a0', '#8a5a72', '#c9d3cf'];
  for (let i = 0; i < 18; i += 1) {
    const northSide = i % 2 === 0;
    lots.push({
      x: -306 + i * 35,
      z: -22 + (northSide ? -5.6 : 5.6),
      heading: northSide ? Math.PI / 2 : -Math.PI / 2,
      type: trafficTypes[i % trafficTypes.length],
      colour: trafficColours[i % trafficColours.length],
      parked: true,
    });
  }
  lots.push({ x: -8, z: -27, heading: Math.PI / 2, type: 'sprint', colour: '#ff6d55', parked: true, hero: true });
  for (let i = 0; i < 12; i += 1) {
    const x = i % 2 === 0 ? -80 : 80;
    lots.push({
      x: x + (i % 4 < 2 ? 6 : -6),
      z: 16 + i * 18,
      heading: x < 0 ? 0 : Math.PI,
      type: trafficTypes[(i + 3) % trafficTypes.length],
      colour: trafficColours[(i + 5) % trafficColours.length],
      parked: true,
    });
  }
  return lots;
}

export const PARKING_LOTS = buildParkingLots();

export function districtAt(x, z) {
  for (const district of DISTRICTS) {
    if (x >= district.minX && x <= district.maxX && z >= district.minZ && z <= district.maxZ) return district;
  }
  return DISTRICTS[3];
}

const TINTS = {
  malecon: ['#f2d9b6', '#e9b59d', '#bcded4', '#f0c98d', '#dfc6dd'],
  playa: ['#f5dfbd', '#a8d5ce', '#f0bda6', '#e6d2a9'],
  barrio: ['#e9a184', '#f2c47f', '#a6c8c0', '#d99a8f'],
  puerto: ['#c8ccc7', '#a9b8b2', '#d6c6a4', '#93a6a8'],
  corona: ['#9fb9c9', '#b7c5cd', '#8faab9', '#d0c8bd'],
  cerro: ['#e8d5b2', '#b9d5b0', '#efc2a4', '#d6c7dd'],
};

const HEIGHTS = {
  malecon: [12, 26], playa: [9, 17], barrio: [9, 20], puerto: [8, 17], corona: [30, 74], cerro: [9, 20],
};

function buildBlocks() {
  const random = createRandom(0x4d415245);
  const verticalRoads = ROADS.filter((road) => road.axis === 'z').sort((a, b) => a.at - b.at);
  const horizontalRoads = ROADS.filter((road) => road.axis === 'x').sort((a, b) => a.at - b.at);
  const xGaps = [];
  let xCursor = -330;
  for (const road of verticalRoads) {
    xGaps.push([xCursor, road.at - road.width / 2 - 5]);
    xCursor = road.at + road.width / 2 + 5;
  }
  xGaps.push([xCursor, 330]);
  const zGaps = [];
  let zCursor = -9;
  for (const road of horizontalRoads.slice(1)) {
    zGaps.push([zCursor, road.at - road.width / 2 - 5]);
    zCursor = road.at + road.width / 2 + 5;
  }
  zGaps.push([zCursor, 332]);

  const blocks = [];
  for (const [x0, x1] of xGaps) {
    for (const [z0, z1] of zGaps) {
      if (x1 - x0 < 18 || z1 - z0 < 18) continue;
      const columns = Math.max(1, Math.min(3, Math.round((x1 - x0) / 38)));
      const rows = Math.max(1, Math.min(3, Math.round((z1 - z0) / 34)));
      for (let column = 0; column < columns; column += 1) {
        for (let row = 0; row < rows; row += 1) {
          const width = (x1 - x0) / columns - 5;
          const depth = (z1 - z0) / rows - 5;
          if (width < 9 || depth < 9) continue;
          const x = x0 + (column + 0.5) * (x1 - x0) / columns;
          const z = z0 + (row + 0.5) * (z1 - z0) / rows;
          const district = districtAt(x, z);
          if (district.id === 'puerto' && random() < 0.55) continue;
          if (random() < 0.06) continue;
          const [low, high] = HEIGHTS[district.id];
          const palette = TINTS[district.id];
          blocks.push({
            id: `b${blocks.length}`,
            x, z, width, depth,
            height: low + random() * (high - low),
            tint: palette[Math.floor(random() * palette.length)],
            style: district.id,
            awnings: district.id === 'malecon' || district.id === 'barrio' || district.id === 'playa',
            tanks: random() < 0.55,
            facing: z < 0 ? 'south' : 'north',
          });
        }
      }
    }
  }
  return blocks;
}

export const BLOCKS = buildBlocks();

export function isBuildingFootprint(x, z, margin = 0) {
  for (const block of BLOCKS) {
    if (Math.abs(x - block.x) < block.width / 2 + margin && Math.abs(z - block.z) < block.depth / 2 + margin) return true;
  }
  return false;
}

export function coastalLimit(x) {
  return x > 90 && x < 320 ? -86 : -52;
}

export function isCarriageway(x, z, margin = 0) {
  for (const road of ROADS) {
    const minX = road.axis === 'x' ? road.from : road.at - road.width / 2;
    const maxX = road.axis === 'x' ? road.to : road.at + road.width / 2;
    const minZ = road.axis === 'x' ? road.at - road.width / 2 : road.from;
    const maxZ = road.axis === 'x' ? road.at + road.width / 2 : road.to;
    if (x + margin > minX && x - margin < maxX && z + margin > minZ && z - margin < maxZ) return true;
  }
  return false;
}
