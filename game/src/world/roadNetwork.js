// Road graph, lane queries, junction signals and the polylines the traffic and minimap follow.

import { ROADS } from './cityLayout.js';

export const LANE_OFFSET = 2.6;
export const LANE_WIDTH = 3.6;

export function isBoulevard(road) {
  return road.width >= 16;
}

export function laneDividerOffsets(road) {
  return isBoulevard(road) ? [-LANE_WIDTH, LANE_WIDTH] : [0];
}

const nodes = new Map();
const adjacency = new Map();

function addEdge(from, to, roadId) {
  if (!adjacency.has(from)) adjacency.set(from, []);
  adjacency.get(from).push({ to, roadId });
}

for (const road of ROADS) {
  const crossingRoads = ROADS.filter((other) => other.axis !== road.axis);
  const crossings = [];
  for (const other of crossingRoads) {
    if (road.axis === 'x') {
      if (other.at < road.from || other.at > road.to) continue;
    } else if (road.at < other.from || road.at > other.to) continue;
    const id = `${road.id}@${other.id}`;
    const point = road.axis === 'x' ? { x: other.at, z: road.at } : { x: road.at, z: other.at };
    nodes.set(id, { id, ...point, roadId: road.id, crossingId: other.id });
    crossings.push({ id, along: road.axis === 'x' ? point.x : point.z });
  }
  crossings.sort((a, b) => a.along - b.along);
  for (let i = 0; i < crossings.length - 1; i += 1) addEdge(crossings[i].id, crossings[i + 1].id, road.id);
  for (let i = crossings.length - 1; i > 0; i -= 1) addEdge(crossings[i].id, crossings[i - 1].id, road.id);
}

export function roadJunctions() {
  return [...nodes.values()];
}

export function junctionAt(roadId, crossingId) {
  return nodes.get(`${roadId}@${crossingId}`) ?? null;
}

export function junctionSignal(junctionId, time) {
  let hash = 0;
  for (let i = 0; i < junctionId.length; i += 1) hash = (hash * 31 + junctionId.charCodeAt(i)) | 0;
  const phase = Math.floor(time / 7 + Math.abs(hash) % 9);
  return phase % 2 === 0;
}

export function nearestRoadPoint(x, z) {
  let best = null;
  for (const road of ROADS) {
    const along = road.axis === 'x' ? x : z;
    const fixed = road.axis === 'x' ? road.at : road.at;
    const clamped = Math.max(road.from, Math.min(road.to, along));
    const point = road.axis === 'x' ? { x: clamped, z: fixed } : { x: fixed, z: clamped };
    const distance = Math.hypot(point.x - x, point.z - z);
    if (!best || distance < best.distance) {
      best = {
        x: point.x,
        z: point.z,
        road,
        distance,
        heading: road.axis === 'x' ? Math.PI / 2 : 0,
        along: clamped,
      };
    }
  }
  return best;
}

function offsetPoint(from, to, amount) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: from.x + (dz / length) * amount, z: from.z - (dx / length) * amount };
}

export function lanePath(fromId, toId) {
  if (!nodes.has(fromId) || !nodes.has(toId) || fromId === toId) return [];
  const queue = [fromId];
  const previous = new Map([[fromId, null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current === toId) break;
    for (const edge of adjacency.get(current) ?? []) {
      if (!previous.has(edge.to)) {
        previous.set(edge.to, current);
        queue.push(edge.to);
      }
    }
  }
  if (!previous.has(toId)) return [];
  const route = [];
  for (let id = toId; id !== null; id = previous.get(id)) route.push(id);
  route.reverse();
  const points = [];
  for (let i = 0; i < route.length - 1; i += 1) {
    const from = nodes.get(route[i]);
    const to = nodes.get(route[i + 1]);
    const point = offsetPoint(from, to, LANE_OFFSET);
    if (!points.length || Math.hypot(point.x - points[points.length - 1].x, point.z - points[points.length - 1].z) > 1) points.push(point);
  }
  return points;
}

function lanePoint(road, along, direction) {
  const offset = direction * LANE_OFFSET;
  return road.axis === 'x'
    ? { x: along, z: road.at - offset }
    : { x: road.at + offset, z: along };
}

function headingFor(points, fallback = 0) {
  if (points.length < 2) return fallback;
  const from = points[0];
  const to = points[1];
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function distanceToRoad(road, x, z) {
  const along = road.axis === 'x' ? x : z;
  const nearest = clamp(along, road.from, road.to);
  return road.axis === 'x' ? Math.hypot(x - nearest, z - road.at) : Math.hypot(x - road.at, z - nearest);
}

function pointOnRoad(road, x, z) {
  return clamp(road.axis === 'x' ? x : z, road.from + 10, road.to - 10);
}

// Pick a legal lane a little way from a position and walk it through several junctions.
export function randomRoute(rand = Math.random, near = null, options = {}) {
  const minDistance = options.minDistance ?? 25;
  const pool = near
    ? ROADS.map((road) => ({ road, distance: distanceToRoad(road, near.x, near.z) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
      .map((item) => item.road)
    : ROADS;
  let road = pool[Math.floor(rand() * pool.length)] ?? ROADS[0];
  let direction = rand() < 0.5 ? 1 : -1;
  let along = near ? pointOnRoad(road, near.x, near.z) : road.from + rand() * (road.to - road.from);

  if (near) {
    along = clamp(along + direction * (minDistance + rand() * 80), road.from + 12, road.to - 12);
    let first = lanePoint(road, along, direction);
    if (Math.hypot(first.x - near.x, first.z - near.z) < minDistance) {
      direction *= -1;
      along = pointOnRoad(road, near.x, near.z) + direction * (minDistance + rand() * 60);
      along = clamp(along, road.from + 12, road.to - 12);
      first = lanePoint(road, along, direction);
    }
  }

  const points = [lanePoint(road, along, direction)];
  const junctions = [];
  const legs = options.legs ?? 5;
  for (let leg = 0; leg < legs; leg += 1) {
    const candidates = ROADS
      .filter((other) => other.axis !== road.axis
        && other.at > road.from + 9 && other.at < road.to - 9
        && direction * (other.at - along) > 14)
      .sort((a, b) => direction * (a.at - along) - direction * (b.at - along));
    const next = candidates.length
      ? candidates[Math.floor(rand() * Math.min(3, candidates.length))]
      : null;
    const legEnd = next ? next.at : (direction > 0 ? road.to - 10 : road.from + 10);
    const oldAt = road.at;
    const oldAxis = road.axis;
    const step = direction > 0 ? 1 : -1;
    for (let position = along + step * 18; step * (legEnd - position) > 0; position += step * 18) {
      const clamped = step > 0 ? Math.min(position, legEnd) : Math.max(position, legEnd);
      points.push(lanePoint(road, clamped, direction));
    }
    points.push(lanePoint(road, legEnd, direction));
    if (!next) {
      direction *= -1;
      along = legEnd;
      continue;
    }
    junctions.push({
      id: `${road.id}@${next.id}`,
      x: oldAxis === 'x' ? next.at : oldAt,
      z: oldAxis === 'x' ? oldAt : next.at,
    });
    road = next;
    along = oldAt;
    direction = rand() < 0.5 ? 1 : -1;
    if (direction > 0 && along > road.to - 14) direction = -1;
    if (direction < 0 && along < road.from + 14) direction = 1;
  }
  if (points.length < 2) points.push(lanePoint(road, along + direction * 30, direction));
  return {
    points,
    junctions,
    heading: headingFor(points),
    roadId: road.id,
    start: { ...points[0] },
  };
}

export function randomLane(rand = Math.random) {
  const route = randomRoute(rand, null, { legs: 3, minDistance: 0 });
  return {
    points: route.points,
    heading: route.heading,
    roadId: route.roadId,
  };
}

export function minimapPolylines() {
  return ROADS.map((road) => [
    { x: road.axis === 'x' ? road.from : road.at, z: road.axis === 'x' ? road.at : road.from },
    { x: road.axis === 'x' ? road.to : road.at, z: road.axis === 'x' ? road.at : road.to },
  ]);
}
