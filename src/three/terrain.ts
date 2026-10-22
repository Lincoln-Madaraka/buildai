import * as THREE from 'three'
import { dotFragment, simplex3 } from './glsl/noise'

const vertexShader = (octaves: number) => /* glsl */ `
#define OCTAVES ${octaves}
uniform float uTravel;
uniform float uOpacity;
uniform float uSize;
uniform float uPixelRatio;
uniform vec3 uLight;
uniform vec3 uNear;
uniform vec3 uFar;
uniform vec3 uWarm;
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

  // Slate dots close by, fading to hazy blue on the far ridges; sunlit peaks warm up a little.
  float dist = -mv.z;
  float lit = clamp(dot(n, normalize(uLight)), 0.0, 1.0);
  float peak = smoothstep(0.6, 3.6, h);
  vec3 col = mix(uNear, uFar, smoothstep(8.0, 32.0, dist));
  vColor = mix(col, uWarm, peak * lit * 0.5);

  float fog = 1.0 - smoothstep(18.0, 38.0, dist);
  float near = smoothstep(4.0, 8.0, dist);
  vAlpha = (0.2 + 0.55 * lit) * (0.55 + 0.45 * peak) * fog * near * uOpacity * (0.75 + 0.25 * aRand);
  // Size falls off gently with distance so the far ridges stay legible.
  gl_PointSize = uSize * uPixelRatio * (0.8 + 0.4 * aRand) / sqrt(dist);
}
`

/** A dotted mountain range in morning haze, drifting towards the viewer as the page scrolls. */
export class Terrain {
  readonly points: THREE.Points
  private readonly uniforms = {
    uTravel: { value: 0 },
    uOpacity: { value: 1 },
    uSize: { value: 20 },
    uPixelRatio: { value: 1 },
    uLight: { value: new THREE.Vector3(0.5, 0.75, 0.45) },
    uNear: { value: new THREE.Color('#26304a') },
    uFar: { value: new THREE.Color('#8794b0') },
    uWarm: { value: new THREE.Color('#c8673b') },
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
        fragmentShader: dotFragment(0.1),
        transparent: true,
        depthWrite: false,
        depthTest: false,
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
