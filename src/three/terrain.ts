import * as THREE from 'three'
import { dotFragment, simplex3 } from './glsl/noise'

const vertexShader = (octaves: number) => /* glsl */ `
#define OCTAVES ${octaves}
uniform float uTravel;
uniform float uOpacity;
uniform float uSize;
uniform float uPixelRatio;
uniform vec3 uLight;
uniform vec3 uLow;
uniform vec3 uMid;
uniform vec3 uHigh;
attribute vec2 aGrid;
attribute float aRand;
varying vec3 vColor;
varying float vAlpha;

${simplex3}

float ridge(vec2 p) {
  float s = 0.0;
  float a = 0.55;
  float f = 1.0;
  for (int i = 0; i < OCTAVES; i++) {
    float n = 1.0 - abs(snoise(vec3(p * f, 1.7 * float(i))));
    s += n * n * a;
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

// Low ground near the camera, ridged mountains rising towards the horizon.
float heightAt(vec2 xz) {
  float far = 1.0 - smoothstep(-20.0, 1.0, xz.y);
  vec2 p = vec2(xz.x, xz.y - uTravel) * 0.09;
  return ridge(p) * mix(0.35, 4.6, far) - 0.2;
}

void main() {
  vec2 xz = aGrid;
  float h = heightAt(xz);
  float e = 0.3;
  vec3 n = normalize(vec3(h - heightAt(xz + vec2(e, 0.0)), e, h - heightAt(xz + vec2(0.0, e))));

  vec4 mv = viewMatrix * modelMatrix * vec4(xz.x, h, xz.y, 1.0);
  gl_Position = projectionMatrix * mv;

  float lit = clamp(dot(n, normalize(uLight)), 0.0, 1.0);
  float peak = smoothstep(0.6, 3.6, h);
  vec3 col = mix(uLow, uMid, lit);
  vColor = mix(col, uHigh, peak * lit);

  float dist = -mv.z;
  float fog = 1.0 - smoothstep(16.0, 36.0, dist);
  float near = smoothstep(4.0, 8.0, dist);
  vAlpha = (0.16 + 0.7 * lit * (0.35 + 0.65 * peak)) * fog * near * uOpacity * (0.7 + 0.3 * aRand);
  // Size falls off gently with distance so the far ridges stay legible.
  gl_PointSize = uSize * uPixelRatio * (0.8 + 0.4 * aRand) / sqrt(dist);
}
`

/** A dotted mountain range under the orb that drifts towards the viewer as the page scrolls. */
export class Terrain {
  readonly points: THREE.Points
  private readonly uniforms = {
    uTravel: { value: 0 },
    uOpacity: { value: 1 },
    uSize: { value: 20 },
    uPixelRatio: { value: 1 },
    uLight: { value: new THREE.Vector3(0.2, 0.8, 0.55) },
    uLow: { value: new THREE.Color('#1a1450') },
    uMid: { value: new THREE.Color('#5a2fd8') },
    uHigh: { value: new THREE.Color('#ff7a2a') },
  }

  constructor(columns: number, rows: number, octaves: number) {
    const grid = new Float32Array(columns * rows * 2)
    const rand = new Float32Array(columns * rows)
    let k = 0
    for (let r = 0; r < rows; r++) {
      // Rows spread out with distance and the grid widens with it, so dots look even on screen.
      const z = 2 - Math.pow(r / (rows - 1), 1.5) * 32
      const halfWidth = 6 + 0.62 * (2 - z)
      for (let c = 0; c < columns; c++) {
        grid[k * 2] = (c / (columns - 1) - 0.5) * 2 * halfWidth
        grid[k * 2 + 1] = z
        rand[k] = Math.random()
        k++
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2))
    geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))
    // three needs a position attribute to know how many points to draw.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(columns * rows * 3), 3))

    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: vertexShader(octaves),
        fragmentShader: dotFragment,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.points.position.y = -2.3
    this.points.frustumCulled = false
    this.points.renderOrder = 0
  }

  update(time: number, scrollY: number, opacity: number, focal: number, pixelRatio: number): void {
    const u = this.uniforms
    u.uTravel.value = time * 0.25 + scrollY * 0.0035
    u.uOpacity.value = opacity
    u.uSize.value = 0.006 * focal
    u.uPixelRatio.value = pixelRatio
    this.points.visible = opacity > 0.01
  }
}
