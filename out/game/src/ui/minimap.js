// Canvas minimap: rounded street map, district labels, blips, icons and speed-reactive zoom.

import { ROADS, BLOCKS, DISTRICTS, SPAWN_POINTS, CRAB_SPOTS, MARKERS, districtAt } from '../world/cityLayout.js';
import { minimapPolylines } from '../world/roadNetwork.js';

function positionOf(item) {
  if (!item) return null;
  if (item.position) return item.position;
  if (Number.isFinite(item.x) && Number.isFinite(item.z)) return item;
  return null;
}

function roundedPath(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.lines = minimapPolylines();
    this.baseScale = 0.78;
    this.scale = this.baseScale;
    this.pulse = 0;
  }

  draw(state) {
    const ctx = this.context;
    if (!ctx) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const player = state.player;
    if (!player) return;
    const centerX = player.position.x;
    const centerZ = player.position.z;
    const speed = Math.abs(player.inVehicle?.speed ?? player.speed ?? 0);
    const targetScale = player.inVehicle ? this.baseScale / (1 + speed / 48) : this.baseScale;
    this.scale += (targetScale - this.scale) * 0.045;
    this.pulse += 0.05;

    const toX = (x) => width / 2 + (x - centerX) * this.scale;
    const toY = (z) => height / 2 + (z - centerZ) * this.scale;

    ctx.save();
    roundedPath(ctx, 0, 0, width, height, 6);
    ctx.clip();
    ctx.fillStyle = '#102b35';
    ctx.fillRect(0, 0, width, height);

    const shoreY = toY(-52);
    if (shoreY > -10) {
      ctx.fillStyle = '#24616c';
      ctx.fillRect(0, 0, width, Math.max(0, shoreY));
      ctx.fillStyle = 'rgba(196, 235, 217, 0.45)';
      ctx.fillRect(0, shoreY - 1.2, width, 1.6);
      ctx.fillStyle = 'rgba(228, 246, 230, 0.11)';
      for (let x = 8; x < width; x += 26) ctx.fillRect(x, shoreY * 0.45, 12, 1);
    }

    ctx.fillStyle = 'rgba(231, 214, 176, 0.075)';
    for (const block of BLOCKS) {
      const left = toX(block.x - block.width / 2);
      const top = toY(block.z - block.depth / 2);
      if (left < -50 || top < -50 || left > width + 50 || top > height + 50) continue;
      ctx.fillRect(left, top, block.width * this.scale, block.depth * this.scale);
    }

    this.lines.forEach((line, index) => {
      const road = ROADS[index];
      const ax = toX(line[0].x);
      const ay = toY(line[0].z);
      const bx = toX(line[1].x);
      const by = toY(line[1].z);
      ctx.strokeStyle = '#546d70';
      ctx.lineWidth = Math.max(3, road.width * this.scale);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(239, 220, 181, 0.55)';
      ctx.lineWidth = 0.7;
      ctx.setLineDash([4, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    ctx.font = '7px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    for (const district of DISTRICTS) {
      const x = toX((district.minX + district.maxX) / 2);
      const y = toY((district.minZ + district.maxZ) / 2);
      if (x < 16 || x > width - 16 || y < 14 || y > height - 14) continue;
      const current = districtAt(centerX, centerZ).id === district.id;
      ctx.fillStyle = current ? 'rgba(255, 236, 195, 0.82)' : 'rgba(220, 232, 220, 0.42)';
      ctx.fillText(district.name.toUpperCase(), x, y);
    }

    for (const vehicle of state.vehicles ?? []) {
      const point = positionOf(vehicle);
      if (!point) continue;
      const x = toX(point.x);
      const y = toY(point.z);
      if (x < 0 || x > width || y < 0 || y > height) continue;
      ctx.fillStyle = vehicle === player.inVehicle ? '#ffd06f' : vehicle.sirenOn ? '#ff7f6b' : '#e9a07e';
      ctx.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
    }

    const garage = SPAWN_POINTS.garage;
    const gx = toX(garage.x);
    const gy = toY(garage.z);
    if (gx > -10 && gx < width + 10 && gy > -10 && gy < height + 10) {
      ctx.fillStyle = '#69d3c1';
      ctx.fillRect(gx - 5, gy - 5, 10, 10);
      ctx.fillStyle = '#09222b';
      ctx.font = 'bold 8px "Segoe UI", Arial, sans-serif';
      ctx.fillText('G', gx, gy + 3);
    }

    for (const crab of state.collectibles ?? CRAB_SPOTS) {
      const spot = positionOf(crab);
      if (!spot || crab.collected) continue;
      const x = toX(spot.x);
      const y = toY(spot.z);
      if (x < 0 || x > width || y < 0 || y > height) continue;
      ctx.fillStyle = '#ffd06f';
      ctx.beginPath();
      ctx.moveTo(x, y - 3.4);
      ctx.lineTo(x + 3.4, y);
      ctx.lineTo(x, y + 3.4);
      ctx.lineTo(x - 3.4, y);
      ctx.closePath();
      ctx.fill();
    }

    const markerPosition = positionOf(state.mission?.marker ?? MARKERS[0]);
    if (markerPosition) {
      const x = toX(markerPosition.x);
      const y = toY(markerPosition.z);
      const radius = 6 + Math.sin(this.pulse * 1.6) * 1.8;
      ctx.strokeStyle = 'rgba(255, 122, 92, 0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ff7a5c';
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 5);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.fill();
    }

    for (const unit of state.police ?? []) {
      const point = positionOf(unit);
      if (!point) continue;
      const x = toX(point.x);
      const y = toY(point.z);
      if (x < -8 || x > width + 8 || y < -8 || y > height + 8) continue;
      const flash = Math.sin(this.pulse * 2.2) > 0;
      ctx.fillStyle = flash ? 'rgba(255, 62, 70, 0.28)' : 'rgba(70, 120, 255, 0.28)';
      ctx.beginPath();
      ctx.arc(x, y, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#ff3e46' : '#4b7bff';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const px = width / 2;
    const py = height / 2;
    const yaw = player.viewYaw ?? 0;
    const coneRadius = 46 * (this.baseScale / this.scale) ** 0.35;
    ctx.fillStyle = 'rgba(105, 211, 193, 0.17)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(yaw - 0.48) * coneRadius, py + Math.cos(yaw - 0.48) * coneRadius);
    ctx.lineTo(px + Math.sin(yaw + 0.48) * coneRadius, py + Math.cos(yaw + 0.48) * coneRadius);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#7ff0da';
    ctx.strokeStyle = '#062026';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(-5.5, -6);
    ctx.lineTo(0, -3);
    ctx.lineTo(5.5, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(6, 18, 24, 0.7)';
    ctx.fillRect(width - 28, 6, 21, 24);
    ctx.fillStyle = '#ffd08a';
    ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
    ctx.fillText('N', width - 17, 18);
    ctx.beginPath();
    ctx.moveTo(width - 20, 21);
    ctx.lineTo(width - 17, 27);
    ctx.lineTo(width - 14, 21);
    ctx.fill();

    ctx.restore();
    roundedPath(ctx, 0.5, 0.5, width - 1, height - 1, 6);
    ctx.strokeStyle = 'rgba(105, 211, 193, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
