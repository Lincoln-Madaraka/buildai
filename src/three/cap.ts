import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

// Crown radii (side to side, height, front to back) and how far the brim reaches forward.
const SX = 1
const SY = 0.82
const SZ = 1.1
const BRIM_TIP = 1.95
const BRIM_SIDE = 0.18 // angle from the side where the brim meets the crown
const BRIM_DEPTH = 0.028
const BEVEL = 0.008

/** Brims curve down at the sides and towards the tip. */
function bend(x: number, z: number): number {
  return -(0.26 * x * x + 0.06) * THREE.MathUtils.smoothstep(z, 0.15, BRIM_TIP)
}

function innerArc(u: number): THREE.Vector2 {
  const a = BRIM_SIDE + u * (Math.PI - 2 * BRIM_SIDE)
  return new THREE.Vector2(Math.cos(a) * SX * 0.995, Math.sin(a) * SZ * 0.995)
}

function outerArc(u: number): THREE.Vector2 {
  const end = innerArc(0)
  const t = u * Math.PI
  return new THREE.Vector2(Math.cos(t) * end.x, end.y + Math.sin(t) * (BRIM_TIP - end.y))
}

const coneVertex = /* glsl */ `
uniform float uLength;
varying float vDepth;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vDepth = position.z / uLength;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const coneFragment = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
varying float vDepth;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
  float fade = (1.0 - vDepth) * smoothstep(0.0, 0.06, vDepth);
  float pulse = 0.9 + 0.1 * sin(uTime * 1.6);
  float a = (pow(rim, 2.0) * 0.32 + 0.05) * fade * pulse * uOpacity;
  vec3 col = mix(vec3(1.0, 0.35, 0.08), vec3(0.88, 0.13, 0.54), vDepth);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`

/** The capture cap, built from primitives, with an exploded view and the camera's view cone. */
export class Cap {
  readonly group = new THREE.Group()
  readonly anchors: Record<string, THREE.Object3D> = {}
  private readonly inner = new THREE.Group()
  private readonly crown = new THREE.Group()
  private readonly brim = new THREE.Group()
  private readonly module = new THREE.Group()
  private readonly moduleBase = new THREE.Vector3()
  private readonly button: THREE.Mesh
  private readonly cable: THREE.Mesh
  private readonly cone: THREE.Mesh
  private readonly led = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true })
  private readonly fading: THREE.Material[] = [this.led]
  private readonly surface: THREE.Mesh[] = []
  private readonly coneUniforms = { uOpacity: { value: 0 }, uTime: { value: 0 }, uLength: { value: 2.4 } }
  private readonly tmp = new THREE.Vector3()
  private lastExplode = -1

  constructor() {
    const fabric = this.fade(
      new THREE.MeshPhysicalMaterial({
        color: 0x15151a,
        roughness: 0.92,
        sheen: 1,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color(0x6a6a80),
        side: THREE.DoubleSide,
      }),
    )
    const thread = this.fade(new THREE.MeshStandardMaterial({ color: 0x34343f, roughness: 0.7 }))
    const plastic = this.fade(
      new THREE.MeshPhysicalMaterial({ color: 0x0e0e12, roughness: 0.5, metalness: 0.15, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
    )
    const metal = this.fade(new THREE.MeshStandardMaterial({ color: 0x2b2b33, metalness: 0.85, roughness: 0.3 }))
    const glass = this.fade(
      new THREE.MeshPhysicalMaterial({
        color: 0x07070c,
        roughness: 0.05,
        metalness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        iridescence: 1,
        iridescenceIOR: 1.6,
      }),
    )
    const rubber = this.fade(new THREE.MeshStandardMaterial({ color: 0x1b1b21, roughness: 0.55 }))
    const black = this.fade(new THREE.MeshBasicMaterial({ color: 0x000000 }))

    // Crown: half an ellipsoid with six seams, eyelets, a band at the base and a top button.
    const crownMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 72, 36, 0, Math.PI * 2, 0, Math.PI / 2).scale(SX, SY, SZ),
      fabric,
    )
    const seams: THREE.BufferGeometry[] = []
    const eyelets: THREE.BufferGeometry[] = []
    const marker = new THREE.Object3D()
    for (let k = 0; k < 6; k++) {
      const phi = (k / 6) * Math.PI * 2 + Math.PI / 2
      const points: THREE.Vector3[] = []
      for (let i = 0; i <= 24; i++) {
        const th = (i / 24) * (Math.PI / 2)
        points.push(new THREE.Vector3(Math.sin(th) * Math.cos(phi) * SX, Math.cos(th) * SY, Math.sin(th) * Math.sin(phi) * SZ).multiplyScalar(1.004))
      }
      seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.0065, 5, false))

      const mid = phi + Math.PI / 6
      const p = new THREE.Vector3(Math.sin(0.62) * Math.cos(mid) * SX, Math.cos(0.62) * SY, Math.sin(0.62) * Math.sin(mid) * SZ).multiplyScalar(1.003)
      marker.position.copy(p)
      marker.lookAt(p.clone().multiplyScalar(2))
      marker.updateMatrix()
      eyelets.push(new THREE.TorusGeometry(0.028, 0.008, 6, 18).applyMatrix4(marker.matrix))
    }
    const seamMesh = new THREE.Mesh(mergeGeometries(seams), thread)
    const eyeletMesh = new THREE.Mesh(mergeGeometries(eyelets), thread)
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 8, 96).rotateX(Math.PI / 2).scale(SX, 1, SZ), fabric)
    band.position.y = 0.012
    this.button = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12).scale(1, 0.45, 1), fabric)
    this.crown.add(crownMesh, seamMesh, eyeletMesh, band, this.button)

    // Brim: a crescent extruded thin, curved down, with rows of stitching on top.
    const shape = new THREE.Shape()
    for (let i = 0; i <= 40; i++) {
      const p = innerArc(i / 40)
      if (i === 0) shape.moveTo(p.x, p.y)
      else shape.lineTo(p.x, p.y)
    }
    for (let i = 40; i >= 0; i--) {
      const p = outerArc(i / 40)
      shape.lineTo(p.x, p.y)
    }
    let brimGeometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: BRIM_DEPTH,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 2,
    }).rotateX(Math.PI / 2)
    const pos = brimGeometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + bend(pos.getX(i), pos.getZ(i)))
    brimGeometry.deleteAttribute('normal')
    brimGeometry.deleteAttribute('uv')
    brimGeometry = mergeVertices(brimGeometry)
    brimGeometry.computeVertexNormals()
    const brimMesh = new THREE.Mesh(brimGeometry, fabric)

    const stitches: THREE.BufferGeometry[] = []
    for (const w of [0.62, 0.72, 0.82, 0.92]) {
      const points: THREE.Vector3[] = []
      for (let i = 0; i <= 48; i++) {
        const u = 0.1 + (i / 48) * 0.8
        const p = innerArc(u).lerp(outerArc(u), w)
        points.push(new THREE.Vector3(p.x, BEVEL + 0.0035 + bend(p.x, p.y), p.y))
      }
      stitches.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.0035, 4, false))
    }
    this.brim.add(brimMesh, new THREE.Mesh(mergeGeometries(stitches), thread))

    // Camera module: hangs under the front of the brim, lens forward and tipped slightly down.
    const brimUnderside = -(BRIM_DEPTH + BEVEL) + bend(0, 1.12)
    this.moduleBase.set(0, brimUnderside - 0.094, 1.12)
    this.module.position.copy(this.moduleBase)
    this.module.rotation.x = 0.15
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.18, 0.12, 4, 0.035), plastic)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.03, 40).rotateX(Math.PI / 2), metal)
    barrel.position.z = 0.072
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 40).rotateX(Math.PI / 2), glass)
    lens.position.z = 0.086
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), this.led)
    led.position.set(0.078, 0.06, 0.061)
    const usb = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.026, 0.012, 2, 0.006), metal)
    usb.position.set(0, -0.02, -0.062)
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.01, 0.004), black)
    slot.position.set(0, -0.02, -0.069)
    this.module.add(body, barrel, lens, led, usb, slot)

    // The view cone: what the camera sees.
    const coneGeometry = new THREE.ConeGeometry(1.15, 2.4, 48, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 1.2)
    this.cone = new THREE.Mesh(
      coneGeometry,
      new THREE.ShaderMaterial({
        uniforms: this.coneUniforms,
        vertexShader: coneVertex,
        fragmentShader: coneFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.cone.position.z = 0.09
    this.cone.visible = false
    this.module.add(this.cone)

    this.cable = new THREE.Mesh(new THREE.BufferGeometry(), rubber)

    // Centre the whole cap on the origin so the orb's points can flow into it.
    this.inner.position.set(0, -0.28, -0.38)
    this.inner.add(this.crown, this.brim, this.module, this.cable)
    this.group.add(this.inner)
    this.surface.push(crownMesh, brimMesh, this.button, body)

    this.anchors.lens = this.anchor(this.module, 0, 0, 0.1)
    this.anchors.usb = this.anchor(this.module, 0, -0.02, -0.075)
    this.anchors.brim = this.anchor(this.brim, -0.62, bend(-0.62, 1.45) - 0.03, 1.45)
    this.anchors.cable = this.anchor(this.inner, 0, 0, 0)
    this.rebuildCable(0)

    this.setOpacity(0)
  }

  /** Meshes whose surface the orb's points re-form into. */
  surfaceMeshes(): THREE.Mesh[] {
    return this.surface
  }

  update(solid: number, explode: number, cone: number, time: number): void {
    this.setOpacity(solid)
    if (!this.group.visible) return

    this.crown.position.y = 0.42 * explode
    this.button.position.y = SY + 0.005 + 0.22 * explode
    this.brim.position.set(0, -0.04 * explode, 0.2 * explode)
    this.module.position.copy(this.moduleBase).add(this.tmp.set(0, -0.42 * explode, 0.42 * explode))
    if (Math.abs(explode - this.lastExplode) > 0.002) this.rebuildCable(explode)

    const coneOpacity = cone * solid
    this.coneUniforms.uOpacity.value = coneOpacity
    this.coneUniforms.uTime.value = time
    this.cone.visible = coneOpacity > 0.01
    this.led.color.set(Math.sin(time * 4) > 0 ? 0xff6a1a : 0x3a1606)
  }

  private rebuildCable(explode: number): void {
    const lift = 0.42 * explode
    const m = this.tmp.copy(this.moduleBase).add(new THREE.Vector3(0, -lift, lift))
    const points = [
      new THREE.Vector3(0, m.y + 0.01, m.z - 0.065),
      new THREE.Vector3(0, m.y + 0.04, m.z - 0.15),
      new THREE.Vector3(0, -0.03 + lift * 0.3, 0.97),
      new THREE.Vector3(0, 0.3 + lift * 0.85, 0.72),
      new THREE.Vector3(0, 0.55 + lift, 0.32),
    ]
    this.cable.geometry.dispose()
    this.cable.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.011, 6, false)
    this.lastExplode = explode
    this.placeCableAnchor(points)
  }

  private placeCableAnchor(points?: THREE.Vector3[]): void {
    const anchor = this.anchors.cable
    if (!anchor || !points) return
    anchor.position.copy(new THREE.CatmullRomCurve3(points).getPoint(0.62))
  }

  private anchor(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
    const o = new THREE.Object3D()
    o.position.set(x, y, z)
    parent.add(o)
    return o
  }

  private fade<T extends THREE.Material>(material: T): T {
    material.transparent = true
    this.fading.push(material)
    return material
  }

  private setOpacity(opacity: number): void {
    for (const m of this.fading) m.opacity = opacity
    this.group.visible = opacity > 0.005
  }
}
