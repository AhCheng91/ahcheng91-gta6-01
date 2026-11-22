// Instanced city geometry: streets, Art-Deco blocks, palms, docks, sea and the volcanic horizon.

import * as THREE from 'three';
import { ROADS, BLOCKS, isCarriageway } from './cityLayout.js';
import { isBoulevard, laneDividerOffsets } from './roadNetwork.js';

function createRandom(seed) {
  let value = seed >>> 0;
  return function next() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const FACADE_PALETTES = [
  { name: 'coral', colour: '#e79076' },
  { name: 'mint', colour: '#8dc9b2' },
  { name: 'sand', colour: '#e4c896' },
  { name: 'cream', colour: '#f0e4cc' },
  { name: 'pale blue', colour: '#a7c2d6' },
];

const FACADE_ACCENTS = ['#3b9b91', '#e87555', '#d8a54b', '#5d7d8c', '#b45c7d'];
const WINDOW_TINTS = ['#2b4c5c', '#315a68', '#395f6b', '#2a4658', '#40616e'];
const VENDOR_NAMES = ['MERCADO', 'SURF', 'TABACO', 'HOTEL SOL', 'PANADERIA', 'CAFE MAR'];

function paletteFor(block, index) {
  const hash = [...`${block.id}${block.style}`].reduce((sum, char) => sum + char.charCodeAt(0), index);
  return FACADE_PALETTES[hash % FACADE_PALETTES.length];
}

function makeSignMaterial(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#201d1a';
  context.fillRect(0, 0, 512, 128);
  context.strokeStyle = '#e7c88f';
  context.lineWidth = 8;
  context.strokeRect(6, 6, 500, 116);
  context.fillStyle = '#ffe6b0';
  context.font = 'bold 62px Georgia, serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 256, 68, 470);
  const texture = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture, fog: true });
}

function makeInstances(geometry, material, transforms, shadows = false, name = 'City instance') {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, transforms.length));
  mesh.name = name;
  const dummy = new THREE.Object3D();
  const white = new THREE.Color('#ffffff');
  for (let i = 0; i < transforms.length; i += 1) {
    const item = transforms[i];
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(item.rx ?? 0, item.ry ?? 0, item.rz ?? 0, item.ro ?? 'XYZ');
    dummy.scale.set(item.sx ?? 1, item.sy ?? 1, item.sz ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, item.color ? new THREE.Color(item.color) : white);
  }
  mesh.count = transforms.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

function box(x, y, z, sx, sy, sz, color, ry = 0) {
  return { x, y, z, sx, sy, sz, color, ry };
}

function roadSegments(road) {
  const crossings = ROADS
    .filter((other) => other.axis !== road.axis)
    .map((other) => ({ at: other.at, half: other.width / 2 + 4 }))
    .filter((other) => other.at >= road.from && other.at <= road.to)
    .sort((a, b) => a.at - b.at);
  const segments = [];
  let cursor = road.from;
  for (const crossing of crossings) {
    if (crossing.at - crossing.half - cursor > 5) segments.push([cursor, crossing.at - crossing.half]);
    cursor = crossing.at + crossing.half;
  }
  if (road.to - cursor > 5) segments.push([cursor, road.to]);
  return segments;
}

function makeGlintTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const vertical = context.createLinearGradient(0, 0, 0, 256);
  vertical.addColorStop(0, 'rgba(255, 250, 230, 0.92)');
  vertical.addColorStop(0.3, 'rgba(255, 226, 168, 0.55)');
  vertical.addColorStop(1, 'rgba(255, 190, 130, 0)');
  context.fillStyle = vertical;
  context.fillRect(0, 0, 64, 256);
  const across = context.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, 'rgba(255, 255, 255, 0)');
  across.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
  across.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = across;
  context.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(canvas);
}

export class CityBuilder {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.root = new THREE.Group();
    this.root.name = 'Puerto Marea';
    this.scene.add(this.root);
    this.random = createRandom(0x53414c54);
    this.waterLines = [];
    this.props = [];
    this.craneTrolleys = [];
    this.movingCranes = [];
    this.gulls = [];
    this.sailboats = [];
    this.seaUniforms = null;
    this.roadSurfaces = [];
  }

  build() {
    this.buildSea();
    this.buildGround();
    this.buildRoads();
    this.buildBuildings();
    this.buildPalms();
    this.buildStreetFurniture();
    this.buildPort();
    this.buildLandmarks();
    this.buildHorizonLife();
    return this;
  }

  registerProp(label, x, z, halfX, halfZ, options = {}) {
    this.props.push({
      label,
      minX: x - halfX, maxX: x + halfX,
      minZ: z - halfZ, maxZ: z + halfZ,
      kind: options.kind ?? 'prop',
      baseY: options.baseY ?? 0,
      attachedToFacade: Boolean(options.attachedToFacade),
    });
  }

  diagnoseProps() {
    const violations = [];
    for (const prop of this.props) {
      if (prop.kind === 'palm' && prop.baseY > 0.2) {
        violations.push(`${prop.label}: palm base at y=${prop.baseY.toFixed(2)} (expected ground level)`);
      }
      if ((prop.kind === 'awning' || prop.kind === 'sign') && !prop.attachedToFacade) {
        violations.push(`${prop.label}: not attached to a street facade`);
      }
      for (const road of ROADS) {
        const minX = road.axis === 'x' ? road.from : road.at - road.width / 2;
        const maxX = road.axis === 'x' ? road.to : road.at + road.width / 2;
        const minZ = road.axis === 'x' ? road.at - road.width / 2 : road.from;
        const maxZ = road.axis === 'x' ? road.at + road.width / 2 : road.to;
        if (prop.maxX > minX + 0.05 && prop.minX < maxX - 0.05 && prop.maxZ > minZ + 0.05 && prop.minZ < maxZ - 0.05) {
          violations.push(`${prop.label}: bounds intersect carriageway ${road.id}`);
        }
      }
    }
    return {
      checked: this.props.length,
      palms: this.props.filter((prop) => prop.kind === 'palm').length,
      facadeAttached: this.props.filter((prop) => prop.attachedToFacade).length,
      violations,
    };
  }

  addPlane(x, z, width, depth, color, y = 0, receiveShadow = true, name = 'Ground plane') {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.94, metalness: 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = receiveShadow;
    this.root.add(mesh);
    return mesh;
  }

  buildSea() {
    this.seaUniforms = {
      time: { value: 0 },
      sunAzimuth: { value: new THREE.Vector2(-0.7, -0.71) },
      eye: { value: new THREE.Vector2() },
    };
    const seaMaterial = new THREE.MeshStandardMaterial({
      color: '#2b8b93', roughness: 0.15, metalness: 0.1,
    });
    seaMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = this.seaUniforms.time;
      shader.uniforms.sunAzimuth = this.seaUniforms.sunAzimuth;
      shader.uniforms.eye = this.seaUniforms.eye;
      shader.vertexShader = `uniform float time;\nvarying vec2 vSeaWorld;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 seaWorld = modelMatrix * vec4(position, 1.0);
        vSeaWorld = seaWorld.xz;
        transformed.z += sin(seaWorld.x * 0.07 + time * 0.65 + sin(seaWorld.z * 0.025) * 1.6) * 0.22
          + sin(seaWorld.z * 0.14 - time * 0.9) * 0.09;`,
      );
      shader.fragmentShader = `uniform float time;\nuniform vec2 sunAzimuth;\nuniform vec2 eye;\nvarying vec2 vSeaWorld;\n${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float bandA = sin(vSeaWorld.y * 0.085 + time * 0.55 + sin(vSeaWorld.x * 0.021) * 1.8) * 0.5 + 0.5;
        float bandB = sin(vSeaWorld.y * 0.21 - time * 0.72 + vSeaWorld.x * 0.013) * 0.5 + 0.5;
        diffuseColor.rgb *= 0.74 + bandA * 0.19 + bandB * 0.08;
        float along = dot(vSeaWorld, sunAzimuth);
        float across = dot(vSeaWorld, vec2(-sunAzimuth.y, sunAzimuth.x));
        float path = exp(-across * across / 2400.0) * (0.4 + 0.6 * bandB);
        float reach = 1.0 - smoothstep(0.0, 900.0, abs(along - dot(eye, sunAzimuth)));
        diffuseColor.rgb += vec3(0.34, 0.23, 0.12) * path * reach;`,
      );
    };
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4200, 3100, 64, 64), seaMaterial);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.65, -1600);
    sea.name = 'Teal sea with swell and sun glint';
    this.root.add(sea);

    this.sunPath = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 900),
      new THREE.MeshBasicMaterial({
        map: makeGlintTexture(), transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0, fog: false, toneMapped: false,
      }),
    );
    this.sunPath.rotation.x = -Math.PI / 2;
    this.sunPath.position.y = -0.57;
    this.sunPath.renderOrder = 2;
    this.sunPath.name = 'Sun glint path';
    this.root.add(this.sunPath);

    this.addPlane(0, -56, 900, 12, '#cfe6d8', -0.55, false, 'Shore foam');
    this.addPlane(0, -51, 740, 1.4, '#f4e6c4', 0.06, false, 'Beach edge');

    const waveMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, fog: true });
    const waves = [];
    for (let i = 0; i < 190; i += 1) {
      waves.push(box(-1200 + this.random() * 2400, -0.5, -70 - this.random() * 1100,
        18 + this.random() * 70, 0.02, 0.4 + this.random() * 1.2, '#16525c'));
    }
    const mesh = makeInstances(new THREE.BoxGeometry(1, 1, 1), waveMaterial, waves, false, 'Swell bands');
    this.waterLines.push(mesh);
    this.root.add(mesh);
  }

  buildGround() {
    this.addPlane(0, 300, 950, 660, '#d9c39b', -0.12, true, 'City ground');
    this.addPlane(200, 45, 280, 200, '#a9aaa2', -0.08, true, 'Dock apron');
    this.addPlane(0, -42, 740, 22, '#e2cba4', 0, true, 'Playa Ceniza sand');
    this.addPlane(-260, -42, 210, 20, '#eedcb2', 0.02, true, 'Ash sand band');
  }

  buildRoads() {
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const asphalt = new THREE.MeshStandardMaterial({ color: '#4a5157', roughness: 0.74, metalness: 0.08 });
    const markings = [];
    const sidewalks = [];
    const kerbs = [];
    const paving = [];
    const drains = [];
    const manholes = [];

    for (const road of ROADS) {
      const alongX = road.axis === 'x';
      const length = road.to - road.from;
      const center = (road.from + road.to) / 2;
      const width = alongX ? length : road.width;
      const depth = alongX ? road.width : length;
      const surfaceMaterial = asphalt.clone();
      this.roadSurfaces.push(surfaceMaterial);
      const surface = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), surfaceMaterial);
      surface.name = `Carriageway ${road.id}`;
      surface.rotation.x = -Math.PI / 2;
      surface.position.set(alongX ? center : road.at, 0.015, alongX ? road.at : center);
      surface.receiveShadow = true;
      this.root.add(surface);

      const boulevard = isBoulevard(road);
      const dividerOffsets = laneDividerOffsets(road);
      for (const [start, end] of roadSegments(road)) {
        const segmentLength = end - start;
        const segmentCenter = (start + end) / 2;
        for (const side of [-1, 1]) {
          const offset = side * (road.width / 2 + 1.7);
          if (alongX) {
            sidewalks.push(box(segmentCenter, 0.16, road.at + offset, segmentLength, 0.32, 3.2, side < 0 ? '#d9c8a6' : '#cfc0a2'));
            kerbs.push(box(segmentCenter, 0.3, road.at + side * (road.width / 2 + 0.1), segmentLength, 0.28, 0.15, '#8c8982'));
            paving.push(box(segmentCenter, 0.327, road.at + offset + side * 0.78, segmentLength, 0.02, 0.55, '#c3b394'));
            paving.push(box(segmentCenter, 0.327, road.at + offset - side * 0.78, segmentLength, 0.02, 0.55, '#b7a887'));
          } else {
            sidewalks.push(box(road.at + offset, 0.16, segmentCenter, 3.2, 0.32, segmentLength, '#d6c5a4'));
            kerbs.push(box(road.at + side * (road.width / 2 + 0.1), 0.3, segmentCenter, 0.15, 0.28, segmentLength, '#8c8982'));
            paving.push(box(road.at + offset + side * 0.78, 0.327, segmentCenter, 0.55, 0.02, segmentLength, '#c3b394'));
            paving.push(box(road.at + offset - side * 0.78, 0.327, segmentCenter, 0.55, 0.02, segmentLength, '#b7a887'));
          }
        }

        // One row of 0.15 m wide, 3 m dashes with 6 m gaps per lane divider.
        for (const divider of dividerOffsets) {
          for (let distance = start + 2; distance < end - 2; distance += 9) {
            if (alongX) markings.push(box(distance, 0.055, road.at + divider, 3, 0.03, 0.15, '#efe6d0'));
            else markings.push(box(road.at + divider, 0.055, distance, 0.15, 0.03, 3, '#efe6d0'));
          }
        }
        if (boulevard) {
          for (const side of [-1, 1]) {
            if (alongX) markings.push(box(segmentCenter, 0.056, road.at + side * 0.1, segmentLength, 0.03, 0.12, '#f3e4c2'));
            else markings.push(box(road.at + side * 0.1, 0.056, segmentCenter, 0.12, 0.03, segmentLength, '#f3e4c2'));
          }
        }
        for (let distance = start + 15; distance < end - 5; distance += 46) {
          const edge = road.width / 2 - 0.7;
          if (alongX) {
            drains.push(box(distance, 0.032, road.at + edge, 0.9, 0.025, 0.28, '#2c3538'));
            manholes.push({ x: distance + 19, y: 0.033, z: road.at - edge * 0.5, sx: 0.8, sy: 0.025, sz: 0.8, color: '#4b5254' });
          } else {
            drains.push(box(road.at + edge, 0.032, distance, 0.28, 0.025, 0.9, '#2c3538'));
            manholes.push({ x: road.at - edge * 0.5, y: 0.033, z: distance + 19, sx: 0.8, sy: 0.025, sz: 0.8, color: '#4b5254' });
          }
        }
      }

      // Stop bars and 0.6 m crosswalk stripes exist only at intersections.
      for (const other of ROADS) {
        if (other.axis === road.axis || other.at < road.from || other.at > road.to) continue;
        const crossingCenter = other.at;
        for (const approach of [-1, 1]) {
          const stopAt = crossingCenter + approach * (other.width / 2 + 1.15);
          if (alongX) markings.push(box(stopAt, 0.057, road.at, 0.3, 0.03, road.width - 2.4, '#ead8ae'));
          else markings.push(box(road.at, 0.057, stopAt, road.width - 2.4, 0.03, 0.3, '#ead8ae'));
          const crosswalkCenter = crossingCenter + approach * (other.width / 2 + 3.4);
          for (let stripe = -1; stripe <= 2; stripe += 1) {
            const point = crosswalkCenter + (stripe - 0.5) * 1.5;
            if (alongX) markings.push(box(point, 0.058, road.at, 0.6, 0.03, road.width - 2.6, '#f3e4c2'));
            else markings.push(box(road.at, 0.058, point, road.width - 2.6, 0.03, 0.6, '#f3e4c2'));
          }
        }
      }
    }

    this.root.add(makeInstances(unitBox, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), markings, false, 'Road markings'));
    this.root.add(makeInstances(unitBox, asphalt, sidewalks, true, 'Sidewalk slabs'));
    this.root.add(makeInstances(unitBox, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }), kerbs, false, 'Granite kerbs'));
    this.root.add(makeInstances(unitBox, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), paving, false, 'Sidewalk paving bands'));
    this.root.add(makeInstances(unitBox, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), drains, false, 'Storm drains'));
    this.root.add(makeInstances(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, metalness: 0.3 }), manholes, false, 'Manhole covers'));
  }

  buildBuildings() {
    const random = this.random;
    const bodies = [];
    const setbacks = [];
    const cornices = [];
    const floorBands = [];
    const shopGlass = [];
    const shopFrames = [];
    const awningSlabs = [];
    const awningStripes = [];
    const signsByVendor = new Map(VENDOR_NAMES.map((name) => [name, []]));
    const windows = [];
    const frames = [];
    const sills = [];
    const balconySlabs = [];
    const balconyRails = [];
    const balconyPosts = [];
    const tanks = [];
    const units = [];
    const antennae = [];
    const stairHuts = [];

    for (const [index, block] of BLOCKS.entries()) {
      const { x, z, width, depth, height, style } = block;
      const palette = paletteFor(block, index);
      const accent = FACADE_ACCENTS[(index + block.id.charCodeAt(1)) % FACADE_ACCENTS.length];
      const windowTint = WINDOW_TINTS[index % WINDOW_TINTS.length];
      bodies.push({ ...box(x, height / 2, z, width, height, depth, palette.colour), label: palette.name });
      const nearestStreet = ROADS.filter((road) => road.axis === 'x')
        .sort((a, b) => Math.abs(a.at - z) - Math.abs(b.at - z))[0];
      const outward = nearestStreet && nearestStreet.at > z ? 1 : -1;
      const streetFace = z + outward * depth / 2;

      // Ground floor: dark recessed glass, mullions, a shallow awning and a lettered sign box.
      shopGlass.push(box(x, 1.55, streetFace + outward * 0.05, width * 0.88, 2.55, 0.12, '#16282d'));
      for (let mullion = -2; mullion <= 2; mullion += 1) {
        shopFrames.push(box(x + mullion * width * 0.175, 1.55, streetFace + outward * 0.12, 0.13, 2.65, 0.16, '#e2d3b8'));
      }
      shopFrames.push(box(x, 2.86, streetFace + outward * 0.13, width * 0.9, 0.2, 0.2, '#e2d3b8'));
      const awningY = 3.18;
      awningSlabs.push(box(x, awningY, streetFace + outward * 0.31, width * 0.84, 0.13, 0.5, accent));
      awningStripes.push(box(x, awningY - 0.11, streetFace + outward * 0.55, width * 0.84, 0.12, 0.07, '#f4e6c6'));
      const vendor = VENDOR_NAMES[index % VENDOR_NAMES.length];
      signsByVendor.get(vendor).push(box(x, 3.82, streetFace + outward * 0.34,
        Math.min(width * 0.56, 8.4), 0.92, 0.32, '#ffffff', outward < 0 ? Math.PI : 0));
      this.registerProp(`Shop awning ${block.id}`, x, streetFace + outward * 0.31, width * 0.42, 0.25, { kind: 'awning', attachedToFacade: true });
      this.registerProp(`Shop sign ${block.id}`, x, streetFace + outward * 0.34, Math.min(width * 0.28, 4.2), 0.22, { kind: 'sign', attachedToFacade: true });

      if (height > 17 && style !== 'puerto') {
        setbacks.push(box(x, height + 1.7, z, width * 0.8, 3.4, depth * 0.8, palette.colour));
        if (style === 'corona' && height > 42) {
          setbacks.push(box(x, height + 5.2, z, width * 0.58, 3.4, depth * 0.58, palette.colour));
        }
        if (style === 'corona' && height > 58) {
          setbacks.push(box(x, height + 8.7, z, width * 0.4, 3.4, depth * 0.4, palette.colour));
        }
      }
      cornices.push(box(x, height - 0.35, z, width + 0.9, 0.75, depth + 0.9, '#f6e7c9'));
      if (height > 22) cornices.push(box(x, height * 0.54, z, width + 0.45, 0.45, depth + 0.45, '#ead9b9'));

      const rows = Math.min(18, Math.max(2, Math.floor((height - 3.5) / 3.3)));
      const balconyBuilding = style !== 'puerto' && (index * 7 + 3) % 5 < 2;
      for (const side of ['north', 'south', 'east', 'west']) {
        const alongZ = side === 'north' || side === 'south';
        const span = alongZ ? width : depth;
        const columns = span > 23 ? 4 : span > 15 ? 3 : 2;
        const face = alongZ ? z + (side === 'north' ? -depth / 2 - 0.08 : depth / 2 + 0.08) : x + (side === 'west' ? -width / 2 - 0.08 : width / 2 + 0.08);
        const facingOut = side === 'north' ? -1 : 1;
        const winWidth = Math.max(0.9, Math.min(2.5, span / columns - 1.25));
        const winHeight = 1.58;
        for (let row = 0; row < rows; row += 1) {
          const y = 3.5 + row * 3.3;
          if (y > height - 1.4) continue;
          if (row > 0) {
            if (alongZ) floorBands.push(box(x, y - 1.66, face, span, 0.15, 0.24, '#f0dfc1'));
            else floorBands.push(box(face, y - 1.66, z, 0.24, 0.15, span, '#f0dfc1'));
          }
          for (let column = 0; column < columns; column += 1) {
            const along = -span / 2 + (column + 0.5) * span / columns;
            const lit = random() < (row > rows * 0.6 ? 0.2 : 0.1);
            const color = lit ? (random() < 0.5 ? '#ffd7a1' : '#ffecbd') : windowTint;
            if (alongZ) {
              windows.push(box(x + along, y, face + facingOut * 0.02, winWidth, winHeight, 0.08, color));
              frames.push(box(x + along, y + winHeight / 2 + 0.04, face + facingOut * 0.08, winWidth + 0.16, 0.08, 0.07, '#6f5d49'));
              frames.push(box(x + along, y - winHeight / 2 - 0.04, face + facingOut * 0.08, winWidth + 0.16, 0.08, 0.07, '#6f5d49'));
              frames.push(box(x + along - winWidth / 2 - 0.04, y, face + facingOut * 0.08, 0.08, winHeight + 0.16, 0.07, '#6f5d49'));
              frames.push(box(x + along + winWidth / 2 + 0.04, y, face + facingOut * 0.08, 0.08, winHeight + 0.16, 0.07, '#6f5d49'));
              sills.push(box(x + along, y - winHeight / 2 - 0.13, face + facingOut * 0.14, winWidth + 0.24, 0.12, 0.26, '#f2e4c6'));
            } else {
              windows.push(box(face + facingOut * 0.02, y, z + along, 0.08, winHeight, winWidth, color));
              frames.push(box(face + facingOut * 0.08, y + winHeight / 2 + 0.04, z + along, 0.07, 0.08, winWidth + 0.16, '#6f5d49'));
              frames.push(box(face + facingOut * 0.08, y - winHeight / 2 - 0.04, z + along, 0.07, 0.08, winWidth + 0.16, '#6f5d49'));
              frames.push(box(face + facingOut * 0.08, y, z + along - winWidth / 2 - 0.04, 0.07, winHeight + 0.16, 0.08, '#6f5d49'));
              frames.push(box(face + facingOut * 0.08, y, z + along + winWidth / 2 + 0.04, 0.07, winHeight + 0.16, 0.08, '#6f5d49'));
              sills.push(box(face + facingOut * 0.14, y - winHeight / 2 - 0.13, z + along, 0.26, 0.12, winWidth + 0.24, '#f2e4c6'));
            }
          }
        }
      }

      // Balconies with a 0.9 m slab, two rails and three posts on about 40% of buildings.
      if (balconyBuilding) {
        const balconyWidth = Math.min(width * 0.72, 7.2);
        const railZ = streetFace + outward * 0.92;
        for (let row = 1; row < Math.min(rows, 6); row += 1) {
          const slabY = 3.5 + row * 3.3 - 1.55;
          balconySlabs.push(box(x, slabY, streetFace + outward * 0.46, balconyWidth, 0.13, 0.9, '#efe1c4'));
          balconyRails.push(box(x, slabY + 0.52, railZ, balconyWidth, 0.06, 0.06, '#7d8b87'));
          balconyRails.push(box(x, slabY + 0.94, railZ, balconyWidth, 0.06, 0.06, '#7d8b87'));
          for (const post of [-1, 0, 1]) {
            balconyPosts.push(box(x + post * balconyWidth * 0.4, slabY + 0.48, railZ, 0.05, 0.98, 0.05, '#7d8b87'));
          }
        }
      }

      // Every roof gets a tank, two AC boxes, an antenna mast and a stair hut.
      tanks.push({ x: x + width * 0.22, y: height + 1.4, z: z - depth * 0.18, sx: 1.5, sy: 2.8, sz: 1.5, color: '#8d9c92' });
      units.push(box(x - width * 0.26, height + 0.55, z + depth * 0.2, 2.0, 0.95, 1.45, '#b3bbb4'));
      units.push(box(x + width * 0.06, height + 0.55, z - depth * 0.26, 1.5, 0.85, 1.15, '#a9b2ad'));
      antennae.push({ x: x - width * 0.18, y: height + 4.5, z: z + depth * 0.1, sx: 0.09, sy: 8, sz: 0.09, color: '#5a6668' });
      stairHuts.push(box(x + width * 0.25, height + 1.3, z + depth * 0.22, 3.2, 2.6, 3, '#d9cdb2'));
    }

    const concrete = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88 });
    const glass = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.22, metalness: 0.3 });
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, bodies, true, 'Building facades'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, setbacks, true, 'Building setbacks'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, cornices, true, 'Building cornices'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, floorBands, false, 'Facade floor cornices'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), glass, shopGlass, false, 'Shopfront glass'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, shopFrames, false, 'Shopfront frames'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true }), windows, false, 'Window glass'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, frames, false, 'Window frames'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, sills, false, 'Window sills'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, balconySlabs, true, 'Balcony slabs'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, metalness: 0.2 }), balconyRails, false, 'Balcony rails'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, metalness: 0.2 }), balconyPosts, false, 'Balcony posts'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, awningSlabs, true, 'Facade awnings'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, awningStripes, false, 'Awning stripes'));
    for (const [vendor, transforms] of signsByVendor) {
      this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), makeSignMaterial(vendor), transforms, false, `Shop sign ${vendor}`));
    }
    this.root.add(makeInstances(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), concrete, tanks, true, 'Rooftop water tanks'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, units, true, 'Rooftop AC units'));
    this.root.add(makeInstances(new THREE.CylinderGeometry(0.5, 0.5, 1, 5), concrete, antennae, false, 'Rooftop antennae'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, stairHuts, true, 'Rooftop stair huts'));
    this.buildRoofParapets();
  }

  buildRoofParapets() {
    const parapets = [];
    for (const block of BLOCKS) {
      if (block.style === 'puerto') continue;
      const y = block.height + 0.35;
      parapets.push(box(block.x, y, block.z - block.depth / 2, block.width, 0.8, 0.35, '#ead4b0'));
      parapets.push(box(block.x, y, block.z + block.depth / 2, block.width, 0.8, 0.35, '#ead4b0'));
      parapets.push(box(block.x - block.width / 2, y, block.z, 0.35, 0.8, block.depth, '#ead4b0'));
      parapets.push(box(block.x + block.width / 2, y, block.z, 0.35, 0.8, block.depth, '#ead4b0'));
    }
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), parapets, true, 'Roof parapets'));
  }

  buildPalms() {
    const trunks = [];
    const crowns = [];
    const fronds = [];
    const soil = [];
    const positions = [];
    for (let x = -336; x <= 336; x += 17) positions.push({ x: x + (this.random() - 0.5) * 3, z: -36 + (this.random() - 0.5) * 2 });
    for (let x = -320; x <= 320; x += 34) positions.push({ x, z: -11.5 });
    for (let x = -340; x <= -170; x += 24) positions.push({ x, z: -45 });

    for (const position of positions.filter((spot) => !isCarriageway(spot.x, spot.z, 1.35))) {
      const height = 6.5 + this.random() * 2.8;
      const lean = (this.random() - 0.5) * 0.16;
      for (let segment = 0; segment < 3; segment += 1) {
        const fraction = (segment + 0.5) / 3;
        trunks.push({
          x: position.x + lean * height * fraction,
          y: height * fraction,
          z: position.z,
          sx: 0.34, sy: height / 3 + 0.04, sz: 0.34, rz: -lean,
          color: '#8c6b4f',
        });
      }
      const topX = position.x + lean * height;
      crowns.push({ x: topX, y: height + 0.02, z: position.z, sx: 0.75, sy: 0.6, sz: 0.75, color: '#486f45' });
      for (let i = 0; i < 7; i += 1) {
        const angle = i * Math.PI * 2 / 7 + this.random() * 0.2;
        fronds.push({
          x: topX,
          y: height + 0.12,
          z: position.z,
          sx: 0.42, sy: 1, sz: 0.16,
          rx: Math.PI / 2 + 0.32,
          ry: angle,
          ro: 'YXZ',
          color: i % 2 ? '#3e8753' : '#57a35d',
        });
      }
      soil.push({ x: position.x, y: 0.06, z: position.z, sx: 1.25, sy: 0.16, sz: 1.25, color: '#9a7b57' });
      this.registerProp(`Palm ${position.x.toFixed(0)},${position.z.toFixed(0)}`, position.x, position.z, 1.3, 1.3, { kind: 'palm', baseY: 0 });
    }

    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const frondGeometry = new THREE.ConeGeometry(1.25, 4.6, 3);
    frondGeometry.translate(0, 2.3, 0);
    this.root.add(makeInstances(new THREE.CylinderGeometry(0.7, 1, 1, 7), material, trunks, true, 'Palm trunks'));
    this.root.add(makeInstances(new THREE.IcosahedronGeometry(1, 0), material, crowns, true, 'Palm crowns'));
    this.root.add(makeInstances(frondGeometry, material, fronds, true, 'Palm fronds'));
    this.root.add(makeInstances(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), material, soil, false, 'Palm soil rings'));
  }

  buildStreetFurniture() {
    const poles = [];
    const poleBases = [];
    const arms = [];
    const lamps = [];
    const benches = [];
    const bins = [];
    const hydrants = [];
    const umbrellas = [];
    const parasolPoles = [];
    const parasolBases = [];
    const towels = [];
    const litter = [];
    const railing = [];

    for (const road of ROADS) {
      for (const [start, end] of roadSegments(road)) {
        for (let distance = start + 8; distance < end - 6; distance += 38) {
          const offset = road.width / 2 + 2.6;
          const x = road.axis === 'x' ? distance : road.at + offset;
          const z = road.axis === 'x' ? road.at + offset : distance;
          poles.push({ x, y: 3.5, z, sx: 0.16, sy: 7, sz: 0.16, color: '#5b6b70' });
          poleBases.push({ x, y: 0.09, z, sx: 0.75, sy: 0.18, sz: 0.75, color: '#9d8d73' });
          arms.push(box(x - (road.axis === 'x' ? 1.1 : 0), 6.95, z + (road.axis === 'x' ? 0 : -1.1), road.axis === 'x' ? 2.4 : 0.16, 0.14, road.axis === 'x' ? 0.16 : 2.4, '#5b6b70'));
          lamps.push(box(x - (road.axis === 'x' ? 2 : 0), 6.8, z + (road.axis === 'x' ? 0 : -2), 0.7, 0.22, 0.7, '#ffd9a0'));
          this.registerProp(`Street lamp ${x.toFixed(0)},${z.toFixed(0)}`, x, z, 0.3, 0.3, { kind: 'lamp' });
          if (Math.floor(distance / 38) % 2 === 0 && !isCarriageway(x + 1.4, z + 0.8, 0.4)) {
            hydrants.push({ x: x + 1.4, y: 0.55, z: z + 0.8, sx: 0.28, sy: 1.1, sz: 0.28, color: '#c85648' });
            this.registerProp(`Hydrant ${x.toFixed(0)},${z.toFixed(0)}`, x + 1.4, z + 0.8, 0.3, 0.3, { kind: 'hydrant' });
          }
        }
      }
    }

    for (let x = -310; x <= 310; x += 62) {
      if (isCarriageway(x, -41.5, 1.5) || isCarriageway(x + 4, -41.4, 0.5)) continue;
      benches.push(box(x, 0.65, -41.5, 2.6, 0.18, 0.75, '#9b7355'));
      benches.push(box(x, 1.05, -41.9, 2.6, 0.75, 0.16, '#8d674c'));
      bins.push({ x: x + 4, y: 0.7, z: -41.4, sx: 0.7, sy: 1.4, sz: 0.7, color: '#4f7170' });
      this.registerProp(`Bench ${x}`, x, -41.5, 1.4, 0.5, { kind: 'bench' });
      this.registerProp(`Bin ${x}`, x + 4, -41.4, 0.4, 0.4, { kind: 'bin' });
    }

    for (let i = 0; i < 10; i += 1) {
      const x = -322 + i * 15.5;
      const z = -44.5 - (i % 2) * 2.4;
      if (isCarriageway(x, z, 1.5) || isCarriageway(x + 5, z - 3, 1.5)) continue;
      const color = ['#ff8d72', '#66cfc0', '#ffd981', '#f3f0d7', '#c5a1d6'][i % 5];
      umbrellas.push({ x, y: 2.5, z, sx: 1, sy: 1, sz: 1, color });
      parasolPoles.push({ x, y: 1.3, z, sx: 0.09, sy: 2.6, sz: 0.09, color: '#e8dfc8' });
      parasolBases.push({ x, y: 0.08, z, sx: 0.9, sy: 0.16, sz: 0.9, color: '#c2a982' });
      towels.push(box(x + 4.4, 0.08, z - 2.8, 2.7, 0.035, 1.7, i % 3 === 0 ? '#f4ead2' : color));
      this.registerProp(`Beach umbrella ${i}`, x, z, 1.4, 1.4, { kind: 'umbrella' });
      this.registerProp(`Beach towel ${i}`, x + 4.4, z - 2.8, 1.4, 0.9, { kind: 'towel' });
    }

    for (let x = -330; x <= 330; x += 4.5) {
      railing.push({ x, y: 0.95, z: -53, sx: 0.1, sy: 1.6, sz: 0.1, color: '#d8c9ad' });
    }
    railing.push({ x: 0, y: 1.65, z: -53, sx: 660, sy: 0.12, sz: 0.12, color: '#e8d9ba' });

    for (let i = 0; i < 120; i += 1) {
      const x = -330 + this.random() * 660;
      const z = -44 + this.random() * 8;
      if (isCarriageway(x, z, 0.4)) continue;
      litter.push(box(x, 0.09, z, 0.25 + this.random() * 0.3, 0.03, 0.18, this.random() < 0.5 ? '#d8c9a6' : '#b9a98e'));
      this.registerProp(`Litter ${i}`, x, z, 0.3, 0.2, { kind: 'litter' });
    }

    const metal = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, metalness: 0.15 });
    const earth = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
    this.root.add(makeInstances(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), earth, poleBases, false, 'Street lamp bases'));
    this.root.add(makeInstances(new THREE.CylinderGeometry(1, 1, 1, 7), metal, poles, false, 'Street lamp poles'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), metal, arms, false, 'Street lamp arms'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true }), lamps, false, 'Street lamp heads'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), benches, true, 'Street benches'));
    this.root.add(makeInstances(new THREE.CylinderGeometry(0.5, 0.6, 1, 8), metal, bins, false, 'Street bins'));
    this.root.add(makeInstances(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), metal, hydrants, false, 'Fire hydrants'));
    this.root.add(makeInstances(new THREE.ConeGeometry(2.2, 1.2, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }), umbrellas, true, 'Beach umbrellas'));
    this.root.add(makeInstances(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), earth, parasolBases, false, 'Beach umbrella bases'));
    this.root.add(makeInstances(new THREE.CylinderGeometry(1, 1, 1, 6), metal, parasolPoles, false, 'Beach umbrella poles'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), towels, false, 'Beach towels'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), metal, railing, false, 'Beach railing'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), litter, false, 'Beach litter'));
  }

  buildPort() {
    const containers = [];
    const colours = ['#d2654b', '#3f8f8a', '#d6a442', '#476d86', '#b9c2b5', '#a85163'];
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 11; column += 1) {
        const x = 108 + column * 18.5 + (row % 2) * 3;
        const z = -4 + row * 13;
        if (this.random() < 0.18) continue;
        const stack = 1 + Math.floor(this.random() * 3);
        for (let level = 0; level < stack; level += 1) {
          containers.push(box(x, 1.3 + level * 2.7, z, 13.5, 2.5, 4.6, colours[Math.floor(this.random() * colours.length)]));
        }
      }
    }
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), containers, true, 'Container stacks'));
    for (let i = 0; i < 2; i += 1) this.buildGantryCrane(150 + i * 100, -49, true);

    const shipHull = new THREE.MeshStandardMaterial({ color: '#49636c', roughness: 0.8 });
    const shipDeck = new THREE.MeshStandardMaterial({ color: '#d8d4c4', roughness: 0.9 });
    for (const [x, z, length] of [[168, -118, 86], [296, -150, 110], [-420, -96, 74]]) {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(length, 5, 15), shipHull);
      hull.position.set(x, -1.5, z);
      hull.castShadow = true;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(length * 0.45, 6, 11), shipDeck);
      deck.position.set(x - length * 0.2, 4, z);
      this.root.add(hull, deck);
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(length * 1.5, 34), new THREE.MeshBasicMaterial({ color: '#b9e2d8', transparent: true, opacity: 0.22 }));
      wake.rotation.x = -Math.PI / 2;
      wake.position.set(x + length * 0.6, -0.42, z);
      wake.name = 'Boat wake';
      this.root.add(wake);
    }

    // A moored container ship with deck stacks beside the dock.
    const moored = new THREE.Group();
    moored.name = 'Moored container ship';
    const mooredHull = new THREE.Mesh(new THREE.BoxGeometry(132, 9, 24), shipHull);
    mooredHull.position.set(214, 1.5, -99);
    mooredHull.castShadow = true;
    moored.add(mooredHull);
    const mooredDeck = new THREE.Mesh(new THREE.BoxGeometry(126, 4, 20), shipDeck);
    mooredDeck.position.set(214, 7.5, -99);
    moored.add(mooredDeck);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(14, 13, 16), new THREE.MeshStandardMaterial({ color: '#e4ddca', roughness: 0.85 }));
    bridge.position.set(270, 12, -99);
    bridge.castShadow = true;
    moored.add(bridge);
    const deckBoxes = [];
    const deckColours = ['#b8523f', '#357f7a', '#d09a39', '#476d86', '#a9b2a5'];
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 9; column += 1) {
        const level = (row + column) % 3;
        deckBoxes.push(box(162 + column * 12.5, 11.5 + level * 2.6, -108 + row * 4.4,
          11.4, 2.4, 4.1, deckColours[(column + row) % deckColours.length]));
      }
    }
    moored.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), deckBoxes, true, 'Ship containers'));
    this.root.add(moored);

    // Two sailboats with white sails and soft wakes in the bay.
    for (let i = 0; i < 2; i += 1) {
      const boat = new THREE.Group();
      boat.name = 'Sailboat';
      const hull = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.9, 2.3), new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.8 }));
      hull.position.y = 0.3;
      boat.add(hull);
      const deckStripe = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.22, 2.0), new THREE.MeshStandardMaterial({ color: '#4b8a86', roughness: 0.8 }));
      deckStripe.position.y = 0.82;
      boat.add(deckStripe);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 8.4, 6), new THREE.MeshStandardMaterial({ color: '#b9ae97', roughness: 0.7 }));
      mast.position.y = 4.6;
      boat.add(mast);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5.5), new THREE.MeshBasicMaterial({ color: '#f5f1e3', side: THREE.DoubleSide, fog: true }));
      sail.position.set(-0.2, 4.6, 0.02);
      boat.add(sail);
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(20, 5), new THREE.MeshBasicMaterial({ color: '#d6f0e4', transparent: true, opacity: 0.32, depthWrite: false }));
      wake.rotation.x = -Math.PI / 2;
      wake.position.set(-11, -0.52, 0);
      boat.add(wake);
      const baseX = i === 0 ? -158 : -18;
      const baseZ = i === 0 ? -118 : -146;
      boat.position.set(baseX, -1.1, baseZ);
      boat.rotation.y = i === 0 ? 0.3 : -0.2;
      this.sailboats.push({ group: boat, baseX, baseZ, phase: i * 2.3 });
      this.root.add(boat);
    }
  }

  buildGantryCrane(x, z, moving = false) {
    const group = new THREE.Group();
    group.name = 'Dock gantry crane';
    const material = new THREE.MeshStandardMaterial({ color: '#dca944', roughness: 0.7, metalness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: '#6e7b7b', roughness: 0.8 });
    const beam = (sx, sy, sz, px, py, pz, mat = material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    for (const legX of [-7, 7]) {
      for (const legZ of [-5, 5]) beam(1.3, 34, 1.3, x + legX, 17, z + legZ);
    }
    beam(17, 1.6, 13, x, 34, z);
    beam(82, 2, 2.6, x - 28, 39, z);
    beam(4, 8, 3, x + 17, 41, z);
    beam(1, 22, 1, x - 62, 28, z, dark);
    beam(3, 1.2, 3, x - 62, 16, z, dark);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 21, 6), dark);
    cable.position.set(x - 30, 28, z);
    group.add(cable);

    const trolley = new THREE.Group();
    trolley.name = 'Crane trolley';
    trolley.position.set(x - 30, 36, z);
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 4), dark);
    trolley.add(carriage);
    const hoist = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 16, 6), dark);
    hoist.position.y = -9;
    trolley.add(hoist);
    const load = new THREE.Mesh(new THREE.BoxGeometry(8, 2.4, 3.5), new THREE.MeshStandardMaterial({ color: '#b85f49', roughness: 0.9 }));
    load.position.y = -18;
    trolley.add(load);
    group.add(trolley);
    this.craneTrolleys.push({ group: trolley, origin: x - 30, phase: this.random() * 10 });
    if (moving) this.movingCranes.push({ group, phase: this.random() * 10 });
    this.root.add(group);
  }

  buildLandmarks() {
    const lighthouse = new THREE.Group();
    lighthouse.name = 'Malecón lighthouse';
    const white = new THREE.MeshStandardMaterial({ color: '#f2e6d2', roughness: 0.8 });
    const red = new THREE.MeshStandardMaterial({ color: '#c95f4c', roughness: 0.8 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 26, 12), white);
    tower.position.y = 13;
    tower.castShadow = true;
    lighthouse.add(tower);
    for (const y of [5, 13, 21]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(3.9 - y * 0.03, 4 - y * 0.03, 2.2, 12), red);
      band.position.y = y;
      lighthouse.add(band);
    }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), new THREE.MeshBasicMaterial({ color: '#ffe6a4' }));
    lamp.position.y = 27.5;
    lighthouse.add(lamp);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 4, 12), red);
    roof.position.y = 31.5;
    lighthouse.add(roof);
    lighthouse.position.set(326, 0, -66);
    this.root.add(lighthouse);

    const hotel = new THREE.Group();
    hotel.name = 'Hotel Marea sign';
    const hotelBody = new THREE.Mesh(new THREE.BoxGeometry(38, 58, 26), new THREE.MeshStandardMaterial({ color: '#e8cbb0', roughness: 0.8 }));
    hotelBody.position.set(0, 29, 0);
    hotelBody.castShadow = true;
    hotel.add(hotelBody);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(24, 4.5, 0.8), new THREE.MeshBasicMaterial({ color: '#ffb46a' }));
    sign.position.set(0, 52, 13.5);
    hotel.add(sign);
    for (let i = 0; i < 9; i += 1) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 5), new THREE.MeshBasicMaterial({ color: '#fff0bd' }));
      bulb.position.set(-10 + i * 2.5, 52, 14.1);
      hotel.add(bulb);
    }
    hotel.position.set(52, 0, -4);
    this.root.add(hotel);

    this.addPlane(-430, -56, 220, 24, '#dccca6', -0.05, false, 'Causeway');
    this.addPlane(-430, -66, 260, 7, '#4a5157', 0.01, false, 'Causeway road');

    const ridgeMaterial = new THREE.MeshBasicMaterial({ color: '#6f6a80', fog: true, side: THREE.DoubleSide });
    this.root.add(this.makeRidge(620, 118, ridgeMaterial, 1));
    this.root.add(this.makeRidge(790, 165, new THREE.MeshBasicMaterial({ color: '#5d6176', fog: true, side: THREE.DoubleSide }), 2));

    const volcano = new THREE.Mesh(new THREE.ConeGeometry(150, 108, 9, 1, true), new THREE.MeshStandardMaterial({ color: '#3f6d70', roughness: 1, flatShading: true }));
    volcano.position.set(-610, 30, -620);
    this.root.add(volcano);

    const stadium = new THREE.Group();
    stadium.name = 'Stadium glow';
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(46, 52, 14, 32), new THREE.MeshStandardMaterial({ color: '#c8c4b0', roughness: 0.9 }));
    stand.position.set(288, 7, 306);
    stand.castShadow = true;
    stadium.add(stand);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(42, 2.4, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffe0a5' }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(288, 18, 306);
    stadium.add(ring);
    this.root.add(stadium);

    const skyline = [];
    const random = createRandom(0x534b594c);
    for (let i = 0; i < 90; i += 1) {
      const x = -1000 + i * 23 + random() * 12;
      const height = 24 + random() * 96;
      skyline.push(box(x, height / 2, 590 + random() * 90, 14 + random() * 12, height, 14, random() < 0.5 ? '#596d7c' : '#6b7382'));
    }
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true }), skyline, false, 'Distant skyline silhouette'));
  }

  buildHorizonLife() {
    const random = createRandom(0x484f5249);
    const ring = [];
    for (let i = 0; i < 136; i += 1) {
      const angle = (i / 136) * Math.PI * 2;
      const radius = 690 + (i % 7) * 34 + random() * 55;
      const x = Math.cos(angle) * radius;
      const z = 150 + Math.sin(angle) * radius;
      const height = 28 + random() * 150;
      ring.push(box(x, height / 2 - 5, z, 16 + random() * 22, height, 16 + random() * 18,
        random() < 0.55 ? '#2f5d63' : '#3c6b6f'));
    }
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true }), ring, false, 'Distant skyline ring'));

    this.root.add(this.makeRidge(-1030, 112,
      new THREE.MeshBasicMaterial({ color: '#3d4a52', fog: true, side: THREE.DoubleSide }), 4));
    const volcanicCone = new THREE.Mesh(new THREE.ConeGeometry(190, 86, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: '#37454c', fog: true, side: THREE.DoubleSide }));
    volcanicCone.position.set(470, -2, -930);
    volcanicCone.name = 'Horizon volcanic ridge';
    this.root.add(volcanicCone);

    const gullMaterial = new THREE.LineBasicMaterial({ color: '#f8f4e8', fog: true });
    for (let i = 0; i < 7; i += 1) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        -1.15, 0.18, 0, 0, 0, 0, 1.15, 0.18, -0.12,
      ], 3));
      const gull = new THREE.Line(geometry, gullMaterial);
      gull.name = 'Seagull';
      gull.position.set(-226 + i * 13, 11 + (i % 3) * 2.5, -64 - (i % 4) * 11);
      this.gulls.push({ line: gull, phase: i * 0.9, radius: 14 + i * 3, height: 10 + (i % 4) * 2.5, x: -224 + i * 13, z: -70 - (i % 3) * 12 });
      this.root.add(gull);
    }
  }

  makeRidge(z, height, material, seed) {
    const random = createRandom(seed * 7919);
    const vertices = [];
    const step = 55;
    let previous = null;
    for (let x = -1100; x <= 1100; x += step) {
      const peak = height * (0.42 + random() * 58 / 100);
      const point = [x, peak, z];
      if (previous) vertices.push(previous[0], 0, previous[2], previous[0], previous[1], previous[2], x, peak, z, previous[0], 0, previous[2], x, peak, z, x, 0, z);
      previous = point;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }

  update(dt) {
    const time = performance.now() * 0.001;
    const lowSun = 1 - THREE.MathUtils.smoothstep(Math.abs(this.engine.sunDirection.y), 0.02, 0.38);
    for (const material of this.roadSurfaces) {
      material.roughness = 0.74 - lowSun * 0.18;
      material.metalness = 0.08 + lowSun * 0.1;
    }
    for (const line of this.waterLines) line.material.opacity = 0.22 + Math.sin(time * 0.8) * 0.05;
    if (this.seaUniforms) {
      this.seaUniforms.time.value = time;
      this.seaUniforms.eye.value.set(this.engine.camera.position.x, this.engine.camera.position.z);
      const sun = this.engine.sunDirection;
      const azimuth = this.seaUniforms.sunAzimuth.value.set(sun.x, sun.z).normalize();
      this.sunPath.rotation.z = Math.atan2(-azimuth.x, -azimuth.y);
      this.sunPath.position.x = this.engine.camera.position.x + azimuth.x * 380;
      this.sunPath.position.z = this.engine.camera.position.z + azimuth.y * 380;
      this.sunPath.material.opacity = THREE.MathUtils.smoothstep(sun.y, -0.04, 0.3) * 0.6;
    }
    for (const trolley of this.craneTrolleys) {
      trolley.group.position.x = trolley.origin + Math.sin(time * 0.16 + trolley.phase) * 22;
    }
    for (const crane of this.movingCranes) {
      crane.group.position.x = Math.sin(time * 0.07 + crane.phase) * 7;
    }
    for (const gull of this.gulls) {
      const angle = time * 0.24 + gull.phase;
      gull.line.position.set(gull.x + Math.cos(angle) * gull.radius, gull.height + Math.sin(time * 1.4 + gull.phase) * 1.3, gull.z + Math.sin(angle) * gull.radius);
      gull.line.rotation.y = -angle + Math.PI * 0.5;
      gull.line.scale.y = 1 + Math.sin(time * 5.2 + gull.phase) * 0.35;
    }
    for (const boat of this.sailboats) {
      boat.group.position.x = boat.baseX + Math.sin(time * 0.09 + boat.phase) * 7;
      boat.group.position.y = -1.1 + Math.sin(time * 0.7 + boat.phase) * 0.14;
      boat.group.rotation.z = Math.sin(time * 0.65 + boat.phase) * 0.025;
    }
  }
}
