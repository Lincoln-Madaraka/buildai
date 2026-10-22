import * as THREE from 'three'
import { dotFragment } from './glsl/noise'
import { sampleSurface } from './sample'

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uSize;
uniform float uPixelRatio;
attribute vec3 aN;
attribute float aKind;
attribute vec3 aRand;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 pos = position;
  // A few body points drift off and fall, like dust coming off the shoulders.
  float shed = step(0.86, aRand.x) * (1.0 - aKind);
  float life = fract(uTime * (0.03 + 0.04 * aRand.y) + aRand.z);
  pos.y -= shed * life * 1.5;
  pos.x += shed * sin(uTime * 0.5 + aRand.z * 6.2831) * 0.05 * life;
  pos *= 1.0 + 0.006 * sin(uTime * 1.1);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  // Bright outline, dark interior: the silhouette is drawn by its rim.
  vec3 n = normalize(normalMatrix * aN);
  float rim = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 2.4);
  float top = max(aN.y, 0.0);
  vec3 body = mix(vec3(0.22, 0.34, 0.75), vec3(0.8, 0.9, 1.0), clamp(rim + top * 0.35, 0.0, 1.0));
  vec3 hand = mix(vec3(0.55, 0.06, 0.03), vec3(1.0, 0.42, 0.18), clamp(rim + top * 0.7, 0.0, 1.0));
  vColor = mix(body, hand, aKind);

  float aBody = 0.04 + 0.9 * rim + 0.35 * top * rim;
  float aHand = 0.25 + 0.75 * max(rim, top * 0.8);
  vAlpha = mix(aBody, aHand, aKind) * mix(1.0, 1.0 - life, shed) * uOpacity;
  gl_PointSize = uSize * uPixelRatio * (0.7 + 0.6 * aRand.y) / -mv.z;
}
`

const planeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// Light falling from the head into the open hand: soft vertical streaks that shimmer downwards.
const raysFragment = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
}
void main() {
  float x = vUv.x;
  float y = vUv.y;
  float streak = pow(noise1(x * 38.0), 5.0) * 0.9 + pow(noise1(x * 91.0 + 7.0), 7.0) * 0.6 + pow(noise1(x * 17.0 + 3.0), 3.0) * 0.35;
  float flow = 0.6 + 0.4 * noise1(x * 55.0 + y * 7.0 + uTime * 1.2);
  float fadeY = smoothstep(0.0, 0.22, y) * (1.0 - smoothstep(0.72, 1.0, y));
  float fadeX = 1.0 - pow(abs(x - 0.5) * 2.0, 1.6);
  vec3 col = mix(vec3(1.0, 0.5, 0.32), vec3(0.72, 0.82, 1.0), smoothstep(0.05, 0.45, y));
  gl_FragColor = vec4(col, streak * flow * fadeY * fadeX * uOpacity * 0.5);
  #include <colorspace_fragment>
}
`

const glowFragment = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * vec2(1.0, 1.4);
  float a = exp(-dot(p, p) * 9.0) * uOpacity * 0.75;
  gl_FragColor = vec4(vec3(1.0, 0.4, 0.2), a);
  #include <colorspace_fragment>
}
`

/** A head-and-shoulders figure made of light, with rays falling into an open, warm-lit hand. */
export class Figure {
  readonly group = new THREE.Group()
  private readonly uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uSize: { value: 10 },
    uPixelRatio: { value: 1 },
  }
  private readonly light = { uTime: { value: 0 }, uOpacity: { value: 0 } }

  constructor(count: number) {
    const shape = new THREE.Group()

    // Torso and shoulders from a lathe profile, flattened front to back.
    const profile = [
      [0.001, -1.35], [0.7, -1.35], [0.92, -1.0], [1.0, -0.55], [1.0, -0.2],
      [0.94, 0.06], [0.78, 0.2], [0.5, 0.3], [0.24, 0.36], [0.001, 0.4],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 64))
    torso.scale.set(1, 1, 0.46)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.42, 32, 1, true))
    neck.position.y = 0.52
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 48, 32))
    head.scale.set(1, 1.24, 1.1)
    head.position.y = 1.0
    shape.add(torso, neck, head)

    // An open hand, palm up, held in front of the chest.
    const hand = new THREE.Group()
    hand.position.set(0.05, -1.08, 0.62)
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16))
    palm.scale.set(1, 0.3, 1.1)
    hand.add(palm)
    const handParts: THREE.Mesh[] = [palm]
    for (const [x, length] of [[-0.12, 0.2], [-0.04, 0.24], [0.04, 0.23], [0.12, 0.18]]) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, length, 6, 12))
      finger.rotation.x = Math.PI / 2 - 0.42
      finger.position.set(x * 1.2, 0.03 + length * 0.18, 0.2 + length * 0.45)
      hand.add(finger)
      handParts.push(finger)
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.16, 6, 12))
    thumb.rotation.set(Math.PI / 2 - 0.6, 0, 0.9)
    thumb.position.set(-0.24, 0.05, 0.06)
    hand.add(thumb)
    handParts.push(thumb)
    shape.add(hand)

    const handCount = Math.round(count * 0.22)
    const body = sampleSurface([torso, neck, head], shape, count - handCount)
    const palmUp = sampleSurface(handParts, shape, handCount)
    shape.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })

    const position = new Float32Array(count * 3)
    const normal = new Float32Array(count * 3)
    position.set(body.pos)
    position.set(palmUp.pos, body.pos.length)
    normal.set(body.nrm)
    normal.set(palmUp.nrm, body.nrm.length)
    const kind = new Float32Array(count)
    kind.fill(1, count - handCount)
    const rand = new Float32Array(count * 3)
    for (let i = 0; i < rand.length; i++) rand[i] = Math.random()

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('aN', new THREE.BufferAttribute(normal, 3))
    geometry.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
    geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 3))
    const points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader,
        fragmentShader: dotFragment(0.3),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    points.frustumCulled = false

    const rays = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 2.3),
      new THREE.ShaderMaterial({
        uniforms: this.light,
        vertexShader: planeVertex,
        fragmentShader: raysFragment,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    rays.position.set(0.04, -0.05, 0.3)
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.9),
      new THREE.ShaderMaterial({
        uniforms: this.light,
        vertexShader: planeVertex,
        fragmentShader: glowFragment,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    glow.position.set(0.05, -1.02, 0.7)

    this.group.add(rays, glow, points)
    this.group.visible = false
  }

  update(opacity: number, time: number, size: number, pixelRatio: number): void {
    this.group.visible = opacity > 0.01
    this.uniforms.uOpacity.value = opacity
    this.uniforms.uTime.value = time
    this.uniforms.uSize.value = size
    this.uniforms.uPixelRatio.value = pixelRatio
    this.light.uOpacity.value = opacity
    this.light.uTime.value = time
  }
}
