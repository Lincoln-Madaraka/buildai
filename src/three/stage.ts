import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { motion } from '../ui/motion'
import { Cap } from './cap'
import { Choreography, type SceneValues } from './choreography'
import { Dust } from './dust'
import { Figure } from './figure'
import { Orb } from './orb'
import { sampleSurface } from './sample'
import { Terrain } from './terrain'
import { pickTier } from './tier'
import { sampleWordmark } from './wordmark'

const FOV = 35
const CAM_Z = 7
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
const TAU = Math.PI * 2

const smooth = (t: number) => t * t * (3 - 2 * t)

function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % TAU) + TAU * 1.5) % TAU) - Math.PI
  return a + d * t
}

/** Builds the WebGL scene behind the page and drives it from scroll, pointer and time. */
export function startStage(): void {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null
  if (!canvas) return
  const tier = pickTier()

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: tier.name !== 'low',
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  let dpr = Math.min(window.devicePixelRatio || 1, tier.dprCap)
  renderer.setPixelRatio(dpr)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120)
  camera.position.set(0, 0, CAM_Z)

  if (tier.name !== 'low') {
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.6
    pmrem.dispose()
  }
  // Soft daylight for the cap, with rim lights in the orb's colours.
  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.position.set(-2.5, 3.5, 4)
  const warm = new THREE.DirectionalLight(0xff7a2a, 1.4)
  warm.position.set(-3, 1.5, -3)
  const cool = new THREE.DirectionalLight(0x6f7cff, 1.1)
  cool.position.set(3.2, 1.2, -2)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cdc0, 1.3), key, warm, cool)

  // A full-screen night sky that fades in over the daylight page for the Promises section.
  const nightUniforms = { uNight: { value: 0 } }
  const nightSky = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: nightUniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        varying vec2 vUv;
        void main() {
          vec3 col = mix(vec3(0.012, 0.008, 0.035), vec3(0.004, 0.004, 0.01), vUv.y);
          vec2 d = (vUv - vec2(0.7, 0.45)) * vec2(1.5, 2.0);
          col += vec3(0.02, 0.03, 0.09) * exp(-dot(d, d) * 6.0);
          gl_FragColor = vec4(col, uNight);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  )
  nightSky.frustumCulled = false
  nightSky.renderOrder = -10
  scene.add(nightSky)
  let lastNight = -1

  const terrain = new Terrain(tier.terrain[0], tier.terrain[1], tier.octaves)
  const dust = new Dust(tier.dust)
  const figure = new Figure(tier.figure)
  const rig = new THREE.Group()
  const orb = new Orb(tier.grid)
  const cap = new Cap()
  orb.points.add(cap.group)
  rig.add(orb.points)
  scene.add(terrain.points, dust.points, figure.group, rig)

  const capSamples = sampleSurface(cap.surfaceMeshes(), cap.group, orb.count)
  orb.setTarget('aCap', capSamples.pos)
  orb.setTarget('aCapN', capSamples.nrm)
  sampleWordmark('logo-mark.png', orb.count)
    .then((pos) => orb.setTarget('aWord', pos))
    .catch(() => undefined)

  const choreo = new Choreography()
  const target: SceneValues = choreo.values()
  const cur: SceneValues = choreo.values()
  const fields = Object.keys(cur) as (keyof SceneValues)[]

  const annotations = Array.from(document.querySelectorAll<HTMLElement>('.annotation'))
    .map((el) => ({ el, anchor: cap.anchors[el.dataset.anchor ?? ''], left: el.dataset.side === 'left' }))
    .filter((a) => a.anchor)
  const hotspot = document.querySelector<HTMLElement>('[data-hotspot]')
  let hotspotCardWidth = 300

  let width = 1
  let height = 1
  let focal = 1
  const resize = () => {
    width = window.innerWidth
    height = window.innerHeight
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    focal = height / 2 / TAN
    hotspotCardWidth = hotspot?.querySelector<HTMLElement>('.hotspot__card')?.offsetWidth || hotspotCardWidth
    choreo.measure(camera.aspect)
  }
  resize()
  window.addEventListener('resize', resize)
  ScrollTrigger.addEventListener('refresh', () => choreo.measure(camera.aspect))
  window.addEventListener('load', () => choreo.measure(camera.aspect))

  const ndc = new THREE.Vector2()
  let mouse = false
  window.addEventListener(
    'pointermove',
    (e) => {
      ndc.set((e.clientX / width) * 2 - 1, -(e.clientY / height) * 2 + 1)
      mouse = e.pointerType === 'mouse'
    },
    { passive: true },
  )

  const raycaster = new THREE.Raycaster()
  const sphere = new THREE.Sphere()
  const hit = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  let pointerStrength = 0
  let elapsed = 0
  let clock = 0
  let spin = 0
  let intro = motion.shot ? 1 : 0
  let first = true
  let frames = 0
  let frameTime = 0
  let settled = false

  gsap.ticker.add((_time, deltaMS) => {
    const dt = Math.min(deltaMS / 1000, 0.05)
    const speed = motion.reduced ? 0.15 : 1
    clock += dt
    elapsed += dt * speed
    spin += dt * speed * 0.12
    intro = Math.min(1, intro + dt * 0.7)
    const introE = 1 - Math.pow(1 - intro, 3)
    const phone = camera.aspect < 0.9

    choreo.sample(window.scrollY, phone, target)
    const k = first || motion.shot || motion.reduced ? 1 : 1 - Math.exp(-dt * 5)
    first = false
    for (const f of fields) cur[f] += (target[f] - cur[f]) * k

    const halfH = CAM_Z * TAN
    const halfW = halfH * camera.aspect
    const radius = Math.max(cur.s * halfH * 0.56 * (0.55 + 0.45 * introE), 0.001)
    rig.position.set(cur.x * halfW, cur.y * halfH, 0)
    rig.scale.setScalar(radius)

    // Free spin as an orb, a product pose as the cap, face-on as the wordmark.
    const capE = smooth(cur.toCap)
    const wordE = smooth(cur.toWord)
    const lookX = mouse ? ndc.x : 0
    const lookY = mouse ? ndc.y : 0
    let ry = lerpAngle(spin + lookX * 0.2, -0.62 + cur.explode * 0.32, capE)
    let rx = THREE.MathUtils.lerp(0.25 - lookY * 0.12, -0.06 - cur.explode * 0.2, capE)
    ry = lerpAngle(ry, 0, wordE)
    rx = THREE.MathUtils.lerp(rx, 0, wordE)
    orb.points.rotation.set(rx, ry, 0)

    // The orb swells gently under the mouse.
    let strengthTarget = 0
    if (mouse && capE < 0.05 && wordE < 0.05) {
      rig.updateMatrixWorld(true)
      raycaster.setFromCamera(ndc, camera)
      sphere.set(rig.position, radius * 1.1)
      if (raycaster.ray.intersectSphere(sphere, hit)) {
        orb.points.worldToLocal(hit).normalize()
        orb.uniforms.uPointer.value.lerp(hit, 0.25)
        strengthTarget = 1
      }
    }
    pointerStrength += (strengthTarget - pointerStrength) * (1 - Math.exp(-dt * 3))

    const u = orb.uniforms
    u.uTime.value = elapsed
    u.uAmp.value = 0.16 * cur.amp
    u.uPalette.value = cur.palette
    u.uToCap.value = cur.toCap
    u.uToWord.value = cur.toWord
    u.uOpacity.value = (1 - cur.dim * 0.85) * (1 - cur.solid) * introE
    u.uPointerStrength.value = pointerStrength
    u.uPixelRatio.value = dpr
    u.uSize.value = (Math.PI / 2 / orb.grid) * 0.5 * 2.5 * radius * focal

    cap.update(cur.solid * introE, cur.explode, cur.cone, elapsed)

    const figureOpacity = cur.figure * introE * (phone ? 0.55 : 1)
    if (figureOpacity > 0.01) {
      const scale = halfH * (phone ? 0.52 : 0.62)
      figure.group.position.set(phone ? 0 : halfW * 0.42, -halfH * 0.04, 0)
      figure.group.scale.setScalar(scale)
      figure.group.rotation.y = Math.sin(elapsed * 0.2) * 0.08 + (mouse ? ndc.x * 0.1 : 0)
    }
    figure.update(figureOpacity, elapsed, 0.016 * figure.group.scale.x * focal, dpr)
    terrain.update(elapsed, window.scrollY, cur.ground * introE, focal, dpr)
    dust.update(elapsed, cur.night, dpr)

    // Night: the sky in WebGL, and the page text colours through the --night CSS variable.
    nightUniforms.uNight.value = cur.night
    nightSky.visible = cur.night > 0.002
    if (Math.abs(cur.night - lastNight) > 0.002) {
      lastNight = cur.night
      document.documentElement.style.setProperty('--night', cur.night.toFixed(3))
    }

    // Slight camera parallax with the mouse.
    const ease = 1 - Math.exp(-dt * 2)
    camera.position.x += ((mouse ? ndc.x * 0.22 : 0) - camera.position.x) * ease
    camera.position.y += ((mouse ? ndc.y * 0.14 : 0) - camera.position.y) * ease
    camera.lookAt(0, 0, 0)

    // HTML labels pinned to parts of the exploded cap.
    const labels = width >= 900 ? cur.solid * THREE.MathUtils.smoothstep(cur.explode, 0.3, 0.65) : 0
    for (const a of annotations) {
      a.el.style.opacity = labels > 0.01 ? String(labels) : '0'
      if (labels <= 0.01) continue
      a.anchor.getWorldPosition(tmp).project(camera)
      const x = (tmp.x * 0.5 + 0.5) * width
      const y = (-tmp.y * 0.5 + 0.5) * height - 16
      a.el.style.transform = a.left
        ? `translate3d(calc(${x - 14}px - 100%), ${y}px, 0)`
        : `translate3d(${x + 14}px, ${y}px, 0)`
    }

    // The hero hotspot card points at the top of the orb and stays inside the screen.
    if (hotspot) {
      const show = width >= 1100 ? (1 - THREE.MathUtils.smoothstep(window.scrollY, 0, height * 0.3)) * introE : 0
      hotspot.style.opacity = String(show)
      if (show > 0.01) {
        tmp.set(rig.position.x + radius * 0.22, rig.position.y + radius * 0.74, radius * 0.6).project(camera)
        const maxX = width - 40 - 78 - hotspotCardWidth
        hotspot.style.setProperty('--x', `${Math.min((tmp.x * 0.5 + 0.5) * width, maxX)}px`)
        hotspot.style.setProperty('--y', `${Math.max((-tmp.y * 0.5 + 0.5) * height, 190)}px`)
      }
    }

    renderer.render(scene, camera)

    // Step the resolution down once if the first seconds run slow.
    if (!settled && clock > 1.5) {
      frames++
      frameTime += deltaMS
      if (frames >= 90) {
        if (frameTime / frames > 24 && dpr > 1) {
          dpr = Math.max(1, dpr - 0.35)
          renderer.setPixelRatio(dpr)
          resize()
          frames = 0
          frameTime = 0
        } else {
          settled = true
        }
      }
    }
  })
}
