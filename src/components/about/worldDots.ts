/**
 * Dot-matrix world map for the footer, generated at build/render time from simplified continent outlines (lon, lat).
 * The outlines are deliberately low-poly: sampled on a ~2.5° grid they read as a stylised map, not cartography.
 */
type Ring = readonly (readonly [number, number])[];

const LAND: Ring[] = [
  // North America
  [[-168, 66], [-162, 70], [-140, 70], [-125, 72], [-95, 72], [-80, 73], [-65, 62], [-60, 55], [-53, 48], [-66, 44], [-70, 41], [-76, 35], [-81, 31], [-80, 25], [-83, 29], [-90, 30], [-97, 27], [-97, 22], [-92, 18], [-87, 21], [-88, 16], [-83, 10], [-79, 8], [-85, 11], [-92, 15], [-105, 20], [-110, 24], [-117, 32], [-122, 37], [-124, 42], [-124, 48], [-131, 55], [-140, 60], [-152, 58], [-165, 60]],
  // Greenland, Iceland
  [[-55, 60], [-45, 60], [-20, 70], [-18, 77], [-30, 83], [-60, 82], [-70, 77], [-55, 70]],
  [[-24, 64], [-14, 64], [-14, 66], [-22, 66.5]],
  // South America
  [[-80, 8], [-75, 11], [-62, 11], [-50, 0], [-35, -6], [-39, -15], [-41, -22], [-48, -26], [-58, -34], [-62, -40], [-66, -46], [-68, -52], [-74, -52], [-74, -42], [-71, -30], [-70, -18], [-76, -14], [-81, -5], [-80, 0]],
  // Europe
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [8, 57], [5, 59], [5, 62], [12, 66], [18, 70], [28, 71], [40, 68], [33, 66], [30, 60], [22, 60], [24, 65], [21, 64], [17, 61], [19, 58], [16, 56], [12, 56], [10, 54], [14, 54], [22, 55], [28, 57], [30, 46], [28, 41], [23, 40], [22, 37], [19, 42], [13, 45], [16, 40], [12, 38], [8, 44], [3, 43], [0, 39], [-6, 36]],
  // Great Britain, Ireland
  [[-5, 50], [1, 51], [2, 53], [-2, 56], [-3, 58.5], [-6, 58], [-5, 55], [-3, 54], [-5, 52]],
  [[-10, 52], [-6, 52], [-6, 55], [-10, 54]],
  // Asia
  [[28, 41], [36, 36], [35, 32], [35, 28], [43, 13], [52, 16], [57, 22], [60, 25], [67, 25], [73, 20], [77, 8], [80, 15], [88, 22], [92, 22], [98, 16], [100, 13], [103, 1], [104, 10], [109, 12], [108, 21], [117, 24], [122, 31], [121, 39], [126, 38], [130, 43], [141, 48], [141, 53], [135, 55], [143, 60], [155, 59], [163, 62], [180, 66], [180, 71], [140, 73], [113, 74], [100, 78], [80, 73], [68, 69], [60, 69], [48, 68], [40, 68], [30, 60], [30, 46], [40, 42]],
  // Japan, Sumatra, Borneo, New Guinea
  [[130, 31], [135, 34], [140, 35], [141, 41], [145, 44], [141, 45], [140, 40], [136, 37], [131, 34]],
  [[95, 5], [106, -6], [101, -3]],
  [[109, 1], [117, 7], [119, 1], [116, -4], [110, -3]],
  [[131, -1], [141, -3], [150, -10], [141, -9], [137, -5]],
  // Africa, Madagascar
  [[-17, 21], [-17, 15], [-12, 8], [-5, 5], [5, 5], [9, 4], [10, -2], [13, -12], [12, -17], [15, -28], [18, -34], [26, -34], [33, -27], [35, -20], [40, -15], [40, -5], [44, 0], [51, 11], [43, 12], [38, 18], [33, 28], [32, 31], [20, 31], [10, 37], [-1, 36], [-6, 36], [-10, 30]],
  [[44, -16], [50, -14], [47, -25], [44, -22]],
  // Australia, New Zealand
  [[114, -22], [122, -18], [126, -14], [131, -12], [137, -12], [136, -16], [141, -12], [143, -15], [146, -19], [153, -25], [153, -29], [150, -37], [144, -39], [138, -35], [132, -32], [124, -34], [115, -34], [113, -26]],
  [[172, -34], [178, -38], [174, -41], [171, -45], [167, -46], [170, -41]],
];

function inside([x, y]: readonly [number, number], ring: Ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export const MAP = { lonMin: -130, lonMax: 180, latMax: 75, latMin: -50, width: 1000 } as const;
export const MAP_HEIGHT = Math.round(((MAP.latMax - MAP.latMin) / (MAP.lonMax - MAP.lonMin)) * MAP.width);

export const project = (lat: number, lon: number) => ({
  x: ((lon - MAP.lonMin) / (MAP.lonMax - MAP.lonMin)) * MAP.width,
  y: ((MAP.latMax - lat) / (MAP.latMax - MAP.latMin)) * MAP_HEIGHT,
});

/**
 * Land dots as two compact SVG paths of zero-length segments (round caps draw them as dots):
 * `glow` holds the dots within `radius`° of a highlighted city, `rest` everything else.
 */
export function landDots(highlight: readonly { lat: number; lon: number }[], radius = 6) {
  const step = 2.5;
  let rest = "";
  let glow = "";
  for (let lat = MAP.latMax - step / 2; lat > MAP.latMin; lat -= step) {
    for (let lon = MAP.lonMin + step / 2; lon < MAP.lonMax; lon += step) {
      if (!LAND.some((r) => inside([lon, lat], r))) continue;
      const p = project(lat, lon);
      const seg = `M${p.x.toFixed(1)} ${p.y.toFixed(1)}h0`;
      if (highlight.some((c) => Math.hypot(c.lat - lat, c.lon - lon) <= radius)) glow += seg;
      else rest += seg;
    }
  }
  return { rest, glow };
}
