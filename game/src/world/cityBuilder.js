// Instanced city geometry: streets, Art-Deco blocks, palms, docks, sea and the volcanic horizon.

import * as THREE from 'three';
import { ROADS, BLOCKS, isCarriageway } from './cityLayout.js';

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

function paletteFor(block, index) {
  const hash = [...`${block.id}${block.style}`].reduce((sum, char) => sum + char.charCodeAt(0), index);
  return FACADE_PALETTES[hash % FACADE_PALETTES.length];
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

      for (const [start, end] of roadSegments(road)) {
        const segmentLength = end - start;
        const segmentCenter = (start + end) / 2;
        for (const side of [-1, 1]) {
          const offset = side * (road.width / 2 + 1.7);
          if (alongX) {
            sidewalks.push(box(segmentCenter, 0.16, road.at + offset, segmentLength, 0.32, 3.2, side < 0 ? '#d9c8a6' : '#cfc0a2'));
            kerbs.push(box(segmentCenter, 0.34, road.at + side * (road.width / 2 + 0.12), segmentLength, 0.2, 0.25, '#f1dfbb'));
            paving.push(box(segmentCenter, 0.327, road.at + offset + side * 1.15, segmentLength, 0.014, 0.11, '#bdae90'));
          } else {
            sidewalks.push(box(road.at + offset, 0.16, segmentCenter, 3.2, 0.32, segmentLength, '#d6c5a4'));
            kerbs.push(box(road.at + side * (road.width / 2 + 0.12), 0.34, segmentCenter, 0.25, 0.2, segmentLength, '#f1dfbb'));
            paving.push(box(road.at + offset + side * 1.15, 0.327, segmentCenter, 0.11, 0.014, segmentLength, '#bdae90'));
          }
        }
        for (let distance = start + 2; distance < end - 2; distance += 9) {
          if (alongX) markings.push(box(distance, 0.055, road.at, 3.6, 0.03, 0.22, '#efdfb9'));
          else markings.push(box(road.at, 0.055, distance, 0.22, 0.03, 3.6, '#efdfb9'));
        }
        if (road.width >= 16) {
          for (const side of [-1, 1]) {
            if (alongX) markings.push(box(segmentCenter, 0.056, road.at + side * 0.46, segmentLength, 0.03, 0.16, '#f3e4c2'));
            else markings.push(box(road.at + side * 0.46, 0.056, segmentCenter, 0.16, 0.03, segmentLength, '#f3e4c2'));
          }
        }
        if (alongX) markings.push(box(start + 0.6, 0.056, road.at, 0.3, 0.03, road.width - 1.6, '#ead8ae'));
        else markings.push(box(road.at, 0.056, start + 0.6, road.width - 1.6, 0.03, 0.3, '#ead8ae'));
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

      for (const other of ROADS) {
        if (other.axis === road.axis || other.at < road.from || other.at > road.to) continue;
        const crossingCenter = other.at;
        for (const approach of [-1, 1]) {
          const along = crossingCenter + approach * (other.width / 2 + 2.6);
          for (let stripe = -2; stripe <= 2; stripe += 1) {
            if (alongX) markings.push(box(along + stripe * 1.15, 0.058, road.at, 0.55, 0.03, road.width - 2.2, '#f3e4c2'));
            else markings.push(box(road.at, 0.058, along + stripe * 1.15, road.width - 2.2, 0.03, 0.55, '#f3e4c2'));
          }
        }
      }
    }

    this.root.add(makeInstances(unitBox, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), markings, false, 'Road markings'));
    this.root.add(makeInstances(unitBox, asphalt, sidewalks, true, 'Sidewalk slabs'));
    this.root.add(makeInstances(unitBox, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }), kerbs, false, 'Raised kerbs'));
    this.root.add(makeInstances(unitBox, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), paving, false, 'Paving bands'));
    this.root.add(makeInstances(unitBox, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), drains, false, 'Storm drains'));
    this.root.add(makeInstances(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, metalness: 0.3 }), manholes, false, 'Manhole covers'));
  }

  buildBuildings() {
    const random = this.random;
    const bodies = [];
    const setbacks = [];
    const cornices = [];
    const shopGlass = [];
    const shopFrames = [];
    const awnings = [];
    const signBoxes = [];
    const windows = [];
    const frames = [];
    const sills = [];
    const balconies = [];
    const tanks = [];
    const units = [];
    const antennae = [];
    const stairHuts = [];

    for (const [index, block] of BLOCKS.entries()) {
      const { x, z, width, depth, height, style } = block;
      const palette = paletteFor(block, index);
      bodies.push({ ...box(x, height / 2, z, width, height, depth, palette.colour), label: palette.name });
      const nearestStreet = ROADS.filter((road) => road.axis === 'x')
        .sort((a, b) => Math.abs(a.at - z) - Math.abs(b.at - z))[0];
      const outward = nearestStreet && nearestStreet.at > z ? 1 : -1;
      const streetFace = z + outward * depth / 2;

      shopGlass.push(box(x, 1.55, streetFace + outward * 0.16, width * 0.9, 2.65, 0.2, '#315661'));
      for (let mullion = -2; mullion <= 2; mullion += 1) {
        shopFrames.push(box(x + mullion * width * 0.18, 1.55, streetFace + outward * 0.28, 0.16, 2.75, 0.3, '#efe0c2'));
      }
      shopFrames.push(box(x, 2.95, streetFace + outward * 0.3, width * 0.96, 0.22, 0.35, '#efe0c2'));

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

      const rows = Math.min(18, Math.max(2, Math.floor((height - 3.5) / 3.4)));
      for (const side of ['north', 'south', 'east', 'west']) {
        const alongZ = side === 'north' || side === 'south';
        const span = alongZ ? width : depth;
        const columns = Math.max(1, Math.min(9, Math.floor(span / 3.1)));
        const face = alongZ ? z + (side === 'north' ? -depth / 2 - 0.08 : depth / 2 + 0.08) : x + (side === 'west' ? -width / 2 - 0.08 : width / 2 + 0.08);
        const facingOut = side === 'north' ? -1 : 1;
        for (let row = 0; row < rows; row += 1) {
          const y = 3.4 + row * 3.4;
          if (y > height - 1.4) continue;
          const hasBalconies = style === 'corona' || (style !== 'puerto' && (block.id.charCodeAt(1) || 0) % 3 === 0);
          if (hasBalconies && row % 4 === 2) {
            for (const bandSide of [-1, 1]) {
              const bandX = alongZ ? x : face + bandSide * 0.12;
              const bandZ = alongZ ? face + facingOut * 0.12 : z;
              balconies.push(alongZ
                ? box(bandX, y - 1.25, bandZ, width * 0.94, 0.18, 1.1, '#efe1c4')
                : box(bandX, y - 1.25, bandZ, 1.1, 0.18, depth * 0.94, '#efe1c4'));
            }
          }
          for (let column = 0; column < columns; column += 1) {
            const along = -span / 2 + (column + 0.5) * span / columns;
            const lit = random() < (row > rows * 0.6 ? 0.2 : 0.11);
            const color = lit ? (random() < 0.5 ? '#ffd7a1' : '#ffecbd') : (random() < 0.3 ? '#2c4c5e' : '#345a6b');
            if (alongZ) {
              windows.push(box(x + along, y, face + facingOut * 0.14, 1.65, 1.7, 0.12, color));
              frames.push(box(x + along, y + 0.88, face + facingOut * 0.2, 1.85, 0.12, 0.16, '#eadfc6'));
              frames.push(box(x + along, y - 0.88, face + facingOut * 0.2, 1.85, 0.12, 0.16, '#eadfc6'));
              frames.push(box(x + along - 0.84, y, face + facingOut * 0.2, 0.11, 1.8, 0.16, '#eadfc6'));
              frames.push(box(x + along + 0.84, y, face + facingOut * 0.2, 0.11, 1.8, 0.16, '#eadfc6'));
              sills.push(box(x + along, y - 1.0, face + facingOut * 0.24, 1.9, 0.14, 0.3, '#f2e4c6'));
            } else {
              windows.push(box(face + facingOut * 0.14, y, z + along, 0.12, 1.7, 1.65, color));
              frames.push(box(face + facingOut * 0.2, y + 0.88, z + along, 0.16, 0.12, 1.85, '#eadfc6'));
              frames.push(box(face + facingOut * 0.2, y - 0.88, z + along, 0.16, 0.12, 1.85, '#eadfc6'));
              frames.push(box(face + facingOut * 0.2, y, z + along - 0.84, 0.16, 1.8, 0.11, '#eadfc6'));
              frames.push(box(face + facingOut * 0.2, y, z + along + 0.84, 0.16, 1.8, 0.11, '#eadfc6'));
              sills.push(box(face + facingOut * 0.24, y - 1.0, z + along, 0.3, 0.14, 1.9, '#f2e4c6'));
            }
          }
        }
      }

      if (style === 'malecon' || style === 'barrio' || style === 'playa') {
        const awningZ = streetFace + outward * 1.05;
        awnings.push(box(x, 3.3, awningZ, width * 0.8, 0.18, 2.1, outward < 0 ? '#e87555' : '#3b9b91'));
        this.registerProp(`Awning ${block.id}`, x, awningZ, width * 0.4, 1.05, { kind: 'awning', attachedToFacade: true });
        if (random() < 0.7) {
          const neon = ['#ff8f6d', '#64d9c4', '#ffd36b', '#e98bd3'];
          const signZ = streetFace + outward * 0.22;
          signBoxes.push(box(x, 4.25, signZ, Math.min(width * 0.55, 9), 1.0, 0.44, neon[Math.floor(random() * neon.length)]));
          this.registerProp(`Shop sign ${block.id}`, x, signZ, Math.min(width * 0.275, 4.5), 0.22, { kind: 'sign', attachedToFacade: true });
        }
      }

      if (block.tanks || height > 22) {
        tanks.push({ x: x + width * 0.22, y: height + 1.4, z: z - depth * 0.18, sx: 1.5, sy: 2.8, sz: 1.5, color: '#8d9c92' });
        units.push(box(x - width * 0.25, height + 0.5, z + depth * 0.2, 2.1, 1, 1.5, '#b3bbb4'));
        units.push(box(x + width * 0.05, height + 0.5, z - depth * 0.25, 1.6, 0.9, 1.2, '#a9b2ad'));
        antennae.push({ x: x - width * 0.18, y: height + 4, z: z + depth * 0.1, sx: 0.09, sy: 7, sz: 0.09, color: '#5a6668' });
        stairHuts.push(box(x + width * 0.24, height + 1.3, z + depth * 0.22, 3.2, 2.6, 3, '#d9cdb2'));
      }
    }

    const concrete = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88 });
    const glass = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.22, metalness: 0.3 });
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, bodies, true, 'Building facades'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, setbacks, true, 'Building setbacks'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, cornices, true, 'Building cornices'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), glass, shopGlass, false, 'Shopfront glass'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, shopFrames, false, 'Shopfront frames'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true }), windows, false, 'Window glass'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, frames, false, 'Window frames'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, sills, false, 'Window sills'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, balconies, true, 'Balcony bands'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), concrete, awnings, true, 'Facade awnings'));
    this.root.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true }), signBoxes, false, 'Shop sign boxes'));
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

    for (let x = -340; x <= -180; x += 19) {
      if (isCarriageway(x, -45, 1.5) || isCarriageway(x + 5, -47.5, 1.5)) continue;
      const color = ['#ff8d72', '#66cfc0', '#ffd981', '#f3f0d7'][Math.floor(this.random() * 4)];
      umbrellas.push({ x, y: 2.5, z: -45, sx: 1, sy: 1, sz: 1, color });
      parasolPoles.push({ x, y: 1.3, z: -45, sx: 0.09, sy: 2.6, sz: 0.09, color: '#e8dfc8' });
      parasolBases.push({ x, y: 0.08, z: -45, sx: 0.9, sy: 0.16, sz: 0.9, color: '#c2a982' });
      towels.push(box(x + 5, 0.08, -47.5, 2.7, 0.035, 1.7, color));
      this.registerProp(`Beach umbrella ${x}`, x, -45, 1.4, 1.4, { kind: 'umbrella' });
      this.registerProp(`Beach towel ${x}`, x + 5, -47.5, 1.4, 0.9, { kind: 'towel' });
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
    for (let i = 0; i < 3; i += 1) this.buildGantryCrane(128 + i * 82, -49);

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
  }

  buildGantryCrane(x, z) {
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
  }
}
