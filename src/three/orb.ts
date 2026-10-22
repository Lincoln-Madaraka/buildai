import * as THREE from 'three'
import { dotFragment, simplex3 } from './glsl/noise'

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uFreq;
uniform float uPalette;
uniform float uToCap;
uniform float uToWord;
uniform float uSize;
uniform float uPixelRatio;
uniform float uOpacity;
uniform vec3 uPointer;
uniform float uPointerStrength;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uC4;

attribute vec3 aCap;
attribute vec3 aCapN;
attribute vec3 aWord;
attribute vec4 aRand;

varying vec3 vColor;
varying float vAlpha;

${simplex3}

// Folds and ripples: domain-warped simplex noise plus a travelling ripple along the dot rows.
float field(vec3 p) {
  float t = uTime * 0.11;
  vec3 q = p * uFreq;
  float w = snoise(q * 0.7 + vec3(0.0, t, 0.0));
  float n = snoise(q + vec3(w * 0.85, t * 0.7, -t * 0.5));
  float ripple = sin(dot(p, vec3(0.0, 10.0, 4.0)) + n * 4.0 - uTime * 0.9) * 0.05;
  return n + ripple;
}

vec3 surface(vec3 dir) {
  float d = field(dir) * uAmp;
  float pd = distance(dir, uPointer);
  d += uPointerStrength * 0.2 * exp(-pd * pd * 5.0);
  return dir * (1.0 + d);
}

// Rim-to-core ramp: amber and orange on the rim, magenta between, violet and indigo in the centre.
vec3 fire(float f) {
  vec3 c = mix(uC0, uC1, smoothstep(0.0, 0.32, f));
  c = mix(c, uC2, smoothstep(0.32, 0.58, f));
  c = mix(c, uC3, smoothstep(0.58, 0.8, f));
  return mix(c, uC4, smoothstep(0.86, 1.0, f));
}

vec3 iridescent(float f, vec3 dir) {
  vec3 c = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + f * 0.9 + dir.y * 0.45 + dir.x * 0.2 + uTime * 0.02));
  return pow(c, vec3(2.2)) * (0.35 + 0.9 * f);
}

void main() {
  vec3 dir = normalize(position);
  vec3 p = surface(dir);

  // Normal of the folded surface from two nearby samples, for the fresnel colouring.
  vec3 up = abs(dir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t1 = normalize(cross(up, dir));
  vec3 t2 = cross(dir, t1);
  vec3 pa = surface(normalize(dir + t1 * 0.02));
  vec3 pb = surface(normalize(dir + t2 * 0.02));
  vec3 n = normalize(cross(pa - p, pb - p));
  if (dot(n, dir) < 0.0) n = -n;

  // Morph to the cap and to the wordmark, each point leaving at its own moment and swirling in flight.
  float delay = aRand.x * 0.45;
  float kc = smoothstep(delay, delay + 0.55, uToCap);
  float kw = smoothstep(delay, delay + 0.55, uToWord);
  vec3 pos = p;
  if (uToCap > 0.0 || uToWord > 0.0) {
    vec3 swirl = vec3(
      snoise(dir * 1.7 + vec3(uTime * 0.15)),
      snoise(dir * 1.7 + vec3(11.3, uTime * 0.15, 3.1)),
      snoise(dir * 1.7 + vec3(-7.1, 2.9, uTime * 0.15))
    ) * 0.55;
    pos = mix(pos, aCap, kc) + swirl * (kc * (1.0 - kc) * 4.0);
    pos = mix(pos, aWord, kw) + swirl * (kw * (1.0 - kw) * 4.0);
  }

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  vec3 viewDir = normalize(-mv.xyz);
  float facingS = dot(normalize(normalMatrix * n), viewDir);
  float facingC = dot(normalize(normalMatrix * aCapN), viewDir);
  float fS = pow(1.0 - abs(facingS), 1.35);
  float fC = pow(1.0 - abs(facingC), 1.2);

  vec3 colS = mix(fire(fS), iridescent(fS, dir), uPalette);
  vec3 colC = fire(0.3 + 0.7 * fC);
  vec3 colW = fire(mix(1.0, 0.42, clamp(aWord.x * 0.3 + 0.5, 0.0, 1.0)));
  vColor = mix(mix(colS, colC, kc), colW, kw);

  float aS = (0.3 + 0.7 * fS) * mix(0.22, 1.0, smoothstep(-0.25, 0.2, facingS));
  float aC = (0.35 + 0.65 * fC) * mix(0.3, 1.0, smoothstep(-0.2, 0.2, facingC));
  vAlpha = mix(mix(aS, aC, kc), 0.9, kw) * uOpacity;

  float size = mix(mix(0.6 + 0.85 * fS, 0.75 + 0.5 * fC, kc), 0.85, kw) * (0.85 + 0.3 * aRand.y);
  gl_PointSize = uSize * uPixelRatio * size / -mv.z;
}
`

export type OrbTarget = 'aCap' | 'aCapN' | 'aWord'

/** The hero orb: a cube-sphere grid of dots folded by noise, which can re-form into the cap or the wordmark. */
export class Orb {
  readonly points: THREE.Points
  readonly count: number
  readonly uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.16 },
    uFreq: { value: 1.15 },
    uPalette: { value: 0 },
    uToCap: { value: 0 },
    uToWord: { value: 0 },
    uSize: { value: 10 },
    uPixelRatio: { value: 1 },
    uOpacity: { value: 1 },
    uPointer: { value: new THREE.Vector3(0, 0, 1) },
    uPointerStrength: { value: 0 },
    uC0: { value: new THREE.Color('#2a1a8c') },
    uC1: { value: new THREE.Color('#5a2fd8') },
    uC2: { value: new THREE.Color('#e0218a') },
    uC3: { value: new THREE.Color('#ff6a1a') },
    uC4: { value: new THREE.Color('#ffb35c') },
  }
  private readonly geometry = new THREE.BufferGeometry()

  constructor(readonly grid: number) {
    const sphere = cubeSphere(grid)
    this.count = sphere.length / 3

    const rand = new Float32Array(this.count * 4)
    for (let i = 0; i < rand.length; i++) rand[i] = Math.random()

    const g = this.geometry
    g.setAttribute('position', new THREE.BufferAttribute(sphere, 3))
    g.setAttribute('aCap', new THREE.BufferAttribute(sphere.slice(), 3))
    g.setAttribute('aCapN', new THREE.BufferAttribute(sphere.slice(), 3))
    g.setAttribute('aWord', new THREE.BufferAttribute(sphere.slice(), 3))
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 4))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader: dotFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    this.points = new THREE.Points(g, material)
    this.points.frustumCulled = false
    this.points.renderOrder = 2
  }

  setTarget(name: OrbTarget, data: Float32Array): void {
    const attr = this.geometry.getAttribute(name) as THREE.BufferAttribute
    ;(attr.array as Float32Array).set(data.subarray(0, attr.array.length))
    attr.needsUpdate = true
  }
}

/** Equi-angular cube sphere: six n-by-n grids pushed onto the unit sphere, giving the even rows of dots. */
function cubeSphere(n: number): Float32Array {
  const out = new Float32Array(6 * n * n * 3)
  let k = 0
  for (let face = 0; face < 6; face++) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const u = Math.tan(((a + 0.5) / n - 0.5) * (Math.PI / 2))
        const v = Math.tan(((b + 0.5) / n - 0.5) * (Math.PI / 2))
        let x = 0
        let y = 0
        let z = 0
        switch (face) {
          case 0: x = 1; y = v; z = -u; break
          case 1: x = -1; y = v; z = u; break
          case 2: x = u; y = 1; z = -v; break
          case 3: x = u; y = -1; z = v; break
          case 4: x = u; y = v; z = 1; break
          default: x = -u; y = v; z = -1
        }
        const len = Math.hypot(x, y, z)
        out[k++] = x / len
        out[k++] = y / len
        out[k++] = z / len
      }
    }
  }
  return out
}
