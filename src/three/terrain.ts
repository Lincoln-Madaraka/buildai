import * as THREE from 'three'
import { simplex3 } from './glsl/noise'

const vertexShader = /* glsl */ `
uniform float uSeed;
uniform float uShift;
uniform float uBase;
uniform float uAmp;
uniform float uFreq;
varying vec2 vPos;
varying float vH;
varying float vSide;

${simplex3}

float ridge(float x) {
  float h = 0.0;
  float a = 0.55;
  float f = 1.0;
  for (int i = 0; i < 4; i++) {
    float n = 1.0 - abs(snoise(vec3(x * f, uSeed, float(i) * 3.7)));
    h += n * n * a;
    f *= 2.05;
    a *= 0.5;
  }
  return h;
}

void main() {
  // The top row of the strip follows a ridged-noise skyline; the bottom row sits far below the view.
  vec3 p = position;
  float top = uBase + ridge(position.x * uFreq + uShift) * uAmp;
  p.y = uv.y > 0.5 ? top : uBase - 8.0;
  vH = uv.y;
  vPos = p.xy;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vSide = clip.x / clip.w;
  gl_Position = clip;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uDots;
varying vec2 vPos;
varying float vH;
varying float vSide;

void main() {
  // Solid along the ridge, dissolving into haze further down; a fine dot texture rides on the slope.
  float fade = smoothstep(0.5, 1.0, vH);
  vec2 g = fract(vPos * uDots) - 0.5;
  float dots = 1.0 - smoothstep(0.2, 0.32, length(g));
  // Lighter behind the text column on the left.
  float side = mix(0.55, 1.0, smoothstep(-0.7, 0.05, vSide));
  gl_FragColor = vec4(uColor, mix(0.18, 0.95, fade) * mix(0.5, 1.0, dots) * side * uOpacity);
  #include <colorspace_fragment>
}
`

interface Layer {
  z: number
  base: number
  amp: number
  freq: number
  color: string
  opacity: number
  /** How fast this layer drifts with scroll and time: near layers move more. */
  drift: number
}

// Far to near: paler and bluer with distance, like mountains in morning haze.
const LAYERS: Layer[] = [
  { z: -26, base: 0.2, amp: 3.0, freq: 0.12, color: '#b8c2d6', opacity: 0.55, drift: 0.3 },
  { z: -18, base: -0.7, amp: 2.4, freq: 0.15, color: '#98a4bf', opacity: 0.62, drift: 0.5 },
  { z: -11, base: -1.6, amp: 1.7, freq: 0.2, color: '#7a87a6', opacity: 0.72, drift: 0.75 },
  { z: -5, base: -2.8, amp: 0.9, freq: 0.26, color: '#59647f', opacity: 0.82, drift: 1 },
]

const CAMERA_Z = 7

/** Layered, dotted mountain ridges that drift apart as the page scrolls, giving the scene depth. */
export class Terrain {
  readonly group = new THREE.Group()
  private readonly layers: { layer: Layer; uniforms: Record<string, THREE.IUniform> }[] = []

  constructor() {
    LAYERS.forEach((layer, i) => {
      const distance = CAMERA_Z - layer.z
      const uniforms = {
        uSeed: { value: i * 7.31 + 1.7 },
        uShift: { value: 0 },
        uBase: { value: layer.base },
        uAmp: { value: layer.amp },
        uFreq: { value: layer.freq },
        uColor: { value: new THREE.Color(layer.color) },
        uOpacity: { value: layer.opacity },
        uDots: { value: 10 },
      }
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(distance * 1.8, 1, 220, 1),
        new THREE.ShaderMaterial({
          uniforms,
          vertexShader,
          fragmentShader,
          transparent: true,
          depthWrite: false,
          depthTest: false,
        }),
      )
      mesh.position.z = layer.z
      mesh.frustumCulled = false
      mesh.renderOrder = -4 + i
      this.group.add(mesh)
      this.layers.push({ layer, uniforms })
    })
  }

  update(time: number, scrollY: number, opacity: number, focal: number): void {
    this.group.visible = opacity > 0.01
    for (const { layer, uniforms } of this.layers) {
      const distance = CAMERA_Z - layer.z
      uniforms.uShift.value = (time * 0.02 + scrollY * 0.0008) * layer.drift
      uniforms.uOpacity.value = layer.opacity * opacity
      // About five pixels between dots, whatever the layer's distance.
      uniforms.uDots.value = focal / (5 * distance)
    }
  }
}
