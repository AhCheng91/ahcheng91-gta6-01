// Renderer, sky, lighting rig, camera follow and time-of-day control.

import * as THREE from 'three';
import { isBuildingFootprint } from '../world/cityLayout.js';

THREE.ColorManagement.enabled = true;

const SKY_VERTEX = `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = `
  uniform vec3 topColor;
  uniform vec3 midColor;
  uniform vec3 horizonColor;
  uniform vec3 sunDirection;
  uniform float night;
  varying vec3 vDirection;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec3 direction = normalize(vDirection);
    float h = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 color = mix(horizonColor, midColor, smoothstep(0.49, 0.57, h));
    color = mix(color, topColor, smoothstep(0.55, 0.72, h));

    // Warm haze hugging the waterline, narrower than the colour gradient itself.
    float haze = exp(-pow((direction.y - 0.012) * 17.0, 2.0));
    color = mix(color, mix(horizonColor, vec3(1.0, 0.84, 0.68), 0.32), haze * 0.52 * (1.0 - night * 0.45));

    // The sun disc and halo use the same direction vector as the directional key light.
    float sunDot = dot(direction, normalize(sunDirection));
    float disc = smoothstep(0.99935, 0.99972, sunDot);
    float halo = pow(max(sunDot, 0.0), 320.0);
    color += vec3(1.0, 0.82, 0.58) * disc * (0.9 - night * 0.3);
    color += vec3(1.0, 0.54, 0.28) * halo * 0.32 * (1.0 - night * 0.5);

    // Stars and a low city glow only appear once the key light has set.
    vec2 starCell = floor(direction.xy * 320.0 + direction.z * 13.0);
    float star = step(0.9975, hash21(starCell)) * step(0.03, direction.y);
    color += vec3(0.72, 0.82, 1.0) * star * night * (0.65 + 0.35 * hash21(starCell + 7.0));
    float glow = exp(-pow((direction.y - 0.025) * 24.0, 2.0)) * (0.5 + 0.5 * hash21(vec2(floor(direction.x * 22.0), 3.0)));
    color += vec3(0.85, 0.45, 0.3) * glow * night * 0.22;
    gl_FragColor = vec4(color, 1.0);
    #include <encodings_fragment>
  }
`;

const LIGHT_PRESETS = [
  { hour: 0, top: '#0a1730', mid: '#122a44', horizon: '#243d55', fog: '#1d3145', sun: '#9dbaff', power: 0.14, fill: 0.35 },
  { hour: 6, top: '#2d6b92', mid: '#d99b78', horizon: '#ffc48a', fog: '#e7b48b', sun: '#ffb56f', power: 1.05, fill: 0.55 },
  { hour: 12, top: '#2f80bd', mid: '#9ccce5', horizon: '#ffeccd', fog: '#d0dfdc', sun: '#fff3d5', power: 1.55, fill: 0.72 },
  { hour: 18.2, top: '#1e5f9d', mid: '#efa684', horizon: '#ffd0a0', fog: '#e7b99e', sun: '#ffc490', power: 1.3, fill: 0.55 },
  { hour: 20.2, top: '#102a4c', mid: '#6e5476', horizon: '#e77b6c', fog: '#645064', sun: '#ff8e66', power: 0.4, fill: 0.35 },
  { hour: 24, top: '#0a1730', mid: '#122a44', horizon: '#243d55', fog: '#1d3145', sun: '#9dbaff', power: 0.14, fill: 0.35 },
];

let contactTexture = null;

export function makeContactShadow(radius) {
  if (!contactTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(8,10,12,0.78)');
    gradient.addColorStop(0.55, 'rgba(8,10,12,0.42)');
    gradient.addColorStop(1, 'rgba(8,10,12,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    contactTexture = new THREE.CanvasTexture(canvas);
  }
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, opacity: 0.75, fog: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.035;
  disc.name = 'Contact shadow';
  disc.renderOrder = 1;
  return disc;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,245,1)');
  gradient.addColorStop(0.18, 'rgba(255,224,170,0.95)');
  gradient.addColorStop(0.45, 'rgba(255,175,110,0.35)');
  gradient.addColorStop(1, 'rgba(255,150,90,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function samplePreset(hour) {
  let lower = LIGHT_PRESETS[0];
  let upper = LIGHT_PRESETS[LIGHT_PRESETS.length - 1];
  for (let i = 0; i < LIGHT_PRESETS.length - 1; i += 1) {
    if (hour >= LIGHT_PRESETS[i].hour && hour <= LIGHT_PRESETS[i + 1].hour) {
      lower = LIGHT_PRESETS[i];
      upper = LIGHT_PRESETS[i + 1];
      break;
    }
  }
  const span = upper.hour - lower.hour || 1;
  return { lower, upper, blend: Math.max(0, Math.min(1, (hour - lower.hour) / span)) };
}

export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding !== undefined) this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#e7b99e', 240, 1150);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.15, 2200);

    this.skyUniforms = {
      topColor: { value: new THREE.Color() },
      midColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
      sunDirection: { value: new THREE.Vector3(0, 0.2, -1) },
      night: { value: 0 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 32, 18),
      new THREE.ShaderMaterial({ uniforms: this.skyUniforms, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }),
    );
    sky.renderOrder = -10;
    sky.name = 'Gradient sky dome';
    sky.frustumCulled = false;
    this.sky = sky;
    this.scene.add(sky);

    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: '#ffc98c', transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    }));
    this.sunGlow.scale.set(160, 160, 1);
    this.scene.add(this.sunGlow);

    this.hemi = new THREE.HemisphereLight('#d6eaff', '#d1a477', 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffd0a0', 2.2);
    this.sun.name = 'Golden hour key light';
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.timeOfDay = 18.2;
    this.cameraVelocity = new THREE.Vector3();
    this.shakeOffset = new THREE.Vector3();
    this.shake = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setTimeOfDay(this.timeOfDay);
  }

  resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setTimeOfDay(hours) {
    this.timeOfDay = hours;
    const { lower, upper, blend } = samplePreset(hours);
    const mixColor = (key) => new THREE.Color(lower[key]).lerp(new THREE.Color(upper[key]), blend);
    this.skyUniforms.topColor.value.copy(mixColor('top'));
    this.skyUniforms.midColor.value.copy(mixColor('mid'));
    this.skyUniforms.horizonColor.value.copy(mixColor('horizon'));
    this.scene.fog.color.copy(mixColor('fog'));
    this.hemi.intensity = lower.fill + (upper.fill - lower.fill) * blend;
    this.sun.intensity = lower.power + (upper.power - lower.power) * blend;
    this.sun.color.copy(mixColor('sun'));

    const elevation = Math.max(-0.12, Math.sin(((hours - 6) / 13) * Math.PI));
    this.sun.castShadow = true;
    const azimuth = -2.35 + (hours - 18.2) * 0.16;
    const horizontal = Math.sqrt(Math.max(0.001, 1 - elevation * elevation));
    this.sunDirection = new THREE.Vector3(Math.cos(azimuth) * horizontal, elevation, Math.sin(azimuth) * horizontal).normalize();
    this.skyUniforms.sunDirection.value.copy(this.sunDirection);
    this.skyUniforms.night.value = THREE.MathUtils.clamp(1 - elevation * 5.5, 0, 1);
    this.sunGlow.position.copy(this.sunDirection).multiplyScalar(900);
    this.sunGlow.material.color.copy(this.sun.color);
    this.sunGlow.material.opacity = 0.62 + (1 - this.skyUniforms.night.value) * 0.12;
    const glowScale = 150 + Math.max(0, 1 - elevation * 4) * 80;
    this.sunGlow.scale.set(glowScale, glowScale, 1);
  }

  cameraGoal(target, opts = {}) {
    const blend = Math.max(0, Math.min(1, target.cameraBlend ?? (target.inVehicle ? 1 : 0)));
    const yaw = target.viewYaw ?? target.yaw ?? 0;
    const speed = Math.abs(target.inVehicle?.speed ?? target.speed ?? 0);
    const distance = opts.distance ?? (3.2 + blend * (6.5 - 3.2));
    const height = opts.height ?? (1.8 + blend * (2.6 - 1.8));
    const lookAhead = opts.lookAhead ?? (11 + blend * 2);
    const pitch = Math.max(-0.04, Math.min(0.22, 0.03 + (target.viewPitch ?? 0) * 0.25));
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const flat = Math.cos(pitch) * distance;
    const desired = new THREE.Vector3(
      target.position.x - forwardX * flat,
      target.position.y + height,
      target.position.z - forwardZ * flat,
    );

    // Pull the boom in when a wall sits behind the player instead of clipping through it.
    const anchor = new THREE.Vector3(target.position.x, target.position.y + 1.3, target.position.z);
    const direction = desired.clone().sub(anchor);
    const fullLength = direction.length();
    if (fullLength > 0.001) {
      direction.divideScalar(fullLength);
      let allowed = fullLength;
      for (let sample = 1.6; sample < fullLength - 1; sample += 1.5) {
        const x = anchor.x + direction.x * sample;
        const z = anchor.z + direction.z * sample;
        if (isBuildingFootprint(x, z, 0.7)) {
          allowed = Math.max(2.1, sample - 1.5);
          break;
        }
      }
      if (allowed < fullLength) desired.copy(anchor).addScaledVector(direction, allowed);
    }

    const aimDistance = target.aiming && !target.inVehicle ? 12 : lookAhead;
    const lookAt = new THREE.Vector3(
      target.position.x + forwardX * aimDistance,
      target.position.y + (1.42 + blend * 0.12) + (1 - blend) * pitch * 14,
      target.position.z + forwardZ * aimDistance,
    );
    return { desired, lookAt, speed, blend, aimDistance, distance, height };
  }

  snapCamera(target, opts = {}) {
    const goal = this.cameraGoal(target, opts);
    this.followTarget = target;
    this.lastGoal = goal;
    this.camera.position.copy(goal.desired);
    this.cameraVelocity.set(0, 0, 0);
    this.camera.lookAt(goal.lookAt);
    this.camera.fov = 62 + goal.blend * 4 + Math.min(10, goal.speed * 0.22);
    this.camera.updateProjectionMatrix();
    this.sun.target.position.set(target.position.x, 0, target.position.z);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDirection, 220);
  }

  addShake(amount) {
    this.shake = Math.min(1.8, this.shake + amount);
  }

  followCamera(target, opts = {}) {
    const dt = Math.max(0.001, Math.min(0.05, opts.dt ?? 1 / 60));
    const goal = this.cameraGoal(target, opts);
    this.followTarget = target;
    this.lastGoal = goal;
    this.camera.position.sub(this.shakeOffset);
    const stiffness = opts.stiffness ?? 36;
    const damping = opts.damping ?? 10.5;
    const force = goal.desired.clone().sub(this.camera.position).multiplyScalar(stiffness)
      .addScaledVector(this.cameraVelocity, -damping);
    this.cameraVelocity.addScaledVector(force, dt);
    this.cameraVelocity.clampLength(0, 90);
    this.camera.position.addScaledVector(this.cameraVelocity, dt);

    this.camera.lookAt(goal.lookAt);
    if (this.shake > 0.001) {
      this.shakeOffset.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.camera.position.add(this.shakeOffset);
      this.camera.rotation.z += (Math.random() - 0.5) * this.shake * 0.016;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    const wantedFov = 62 + goal.blend * 4 + Math.min(10, goal.speed * 0.22);
    this.camera.fov += (wantedFov - this.camera.fov) * (1 - Math.exp(-4 * dt));
    this.camera.updateProjectionMatrix();

    this.sun.target.position.set(target.position.x, 0, target.position.z);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDirection, 220);
  }

  cameraReport(target = this.followTarget) {
    if (!target) return null;
    const goal = this.lastGoal ?? this.cameraGoal(target);
    const offset = goal.desired.clone().sub(target.position);
    return {
      mode: goal.blend > 0.5 ? 'driving' : 'on foot',
      distanceMetres: Number(Math.hypot(offset.x, offset.z).toFixed(2)),
      heightMetres: Number(offset.y.toFixed(2)),
      offset: { x: Number(offset.x.toFixed(2)), y: Number(offset.y.toFixed(2)), z: Number(offset.z.toFixed(2)) },
      fovDegrees: Number(this.camera.fov.toFixed(2)),
      lookAheadMetres: Number(goal.aimDistance.toFixed(2)),
      speed: Number(goal.speed.toFixed(2)),
    };
  }

  shadowReport() {
    const counts = { buildings: 0, palms: 0, cars: 0, characters: 0, other: 0 };
    let receivers = 0;
    this.scene.traverse((object) => {
      if (!object.isMesh && !object.isInstancedMesh) return;
      if (object.receiveShadow && !object.castShadow) receivers += 1;
      if (!object.castShadow) return;
      let node = object;
      let label = '';
      while (node) {
        label += ` ${node.name ?? ''}`;
        node = node.parent;
      }
      label = label.toLowerCase();
      if (label.includes('palm')) counts.palms += 1;
      else if (label.includes('building') || label.includes('facade') || label.includes('roof') || label.includes('cornice') || label.includes('setback')) counts.buildings += 1;
      else if (label.includes('vehicle') || label.includes('calyx') || label.includes('dorado') || label.includes('marisma') || label.includes('punta') || label.includes('cangrejo') || label.includes('avispa') || label.includes('pmpd')) counts.cars += 1;
      else if (label.includes('rafa') || label.includes('pedestrian')) counts.characters += 1;
      else counts.other += 1;
    });
    const camera = this.sun.shadow.camera;
    return {
      enabled: this.renderer.shadowMap.enabled,
      type: this.renderer.shadowMap.type,
      mapSize: [this.sun.shadow.mapSize.x, this.sun.shadow.mapSize.y],
      keyLightCasts: this.sun.castShadow,
      bounds: { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom, near: camera.near, far: camera.far },
      casters: counts,
      casterTotal: Object.values(counts).reduce((sum, count) => sum + count, 0),
      receivers,
    };
  }

  probePixels(points) {
    this.render();
    const gl = this.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    return points.map(([u, v]) => {
      const x = Math.max(0, Math.min(width - 1, Math.round(u * (width - 1))));
      const y = Math.max(0, Math.min(height - 1, Math.round((1 - v) * (height - 1))));
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const rgb = [pixel[0], pixel[1], pixel[2]];
      return {
        u, v, rgb,
        hex: `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`,
      };
    });
  }

  render() {
    this.sky.position.copy(this.camera.position);
    this.sunGlow.position.copy(this.camera.position).addScaledVector(this.sunDirection, 900);
    this.renderer.render(this.scene, this.camera);
  }
}
