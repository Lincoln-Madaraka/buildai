import * as THREE from 'three'
import { dotFragment } from './glsl/noise'

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uPixelRatio;
attribute vec2 aRand;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 pos = position;
  pos.y = mod(pos.y + uTime * (0.03 + 0.06 * aRand.x) + 5.0, 10.0) - 5.0;
  pos.x += sin(uTime * 0.2 + aRand.y * 30.0) * 0.15;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.7 + aRand.x) + aRand.y * 40.0);
  vColor = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.7, 0.5), step(0.85, aRand.y));
  vAlpha = (0.12 + 0.45 * aRand.y) * twinkle * uOpacity;
  gl_PointSize = (1.2 + 2.0 * aRand.y) * uPixelRatio * 7.0 / -mv.z;
}
`

/** Fine specks drifting slowly upwards through the whole scene. */
export class Dust {
  readonly points: THREE.Points
  private readonly uniforms = { uTime: { value: 0 }, uOpacity: { value: 1 }, uPixelRatio: { value: 1 } }

  constructor(count: number) {
    const position = new Float32Array(count * 3)
    const rand = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      position[i * 3] = (Math.random() * 2 - 1) * 9
      position[i * 3 + 1] = (Math.random() * 2 - 1) * 5
      position[i * 3 + 2] = -Math.random() * 10 + 2
      rand[i * 2] = Math.random()
      rand[i * 2 + 1] = Math.random()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 2))
    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader,
        fragmentShader: dotFragment,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.points.frustumCulled = false
    this.points.renderOrder = 1
  }

  update(time: number, pixelRatio: number): void {
    this.uniforms.uTime.value = time
    this.uniforms.uPixelRatio.value = pixelRatio
  }
}
