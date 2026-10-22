import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// A structured six-panel cap, in units of the crown's half-width (about 8.5 cm).
const SX = 1 // crown half-width
const SZ = 1.16 // crown half-length, front to back
const SY = 1.15 // crown height at the button
const APEX_Z = -0.05 // the button sits just behind the middle
const SEAMS = 6

const BILL_SIDE = 1.42 // angle from the front where the bill's corners meet the crown
const BILL_HALF_WIDTH = 1.05
const BILL_TIP = 1.98
const BILL_ARCH = 0.18 // the middle of the bill sits higher than its corners
const BILL_CURL = 0.35 // and its sides curl down towards the front
const BILL_PITCH = 0.1 // slope down towards the tip
const BILL_THICK = 0.034
const BILL_INSET = 0.985 // the bill's inner edge tucks just inside the crown

const SEAM_OFFSETS = [-0.022, 0.022, -0.03, 0.03] // topstitching outside, then the tape's edges inside

const OPEN_HALF = 0.36 // back opening above the strap: half its width, as an angle
const OPEN_TOP = 0.5 // and its height

const MODULE_Z = 1.42 // where the camera clips on, along the middle of the bill

const TAU = Math.PI * 2
const XC = Math.sin(BILL_SIDE) * SX
const tmpN = new THREE.Vector3()
const tmpI = new THREE.Vector2()
const tmpO = new THREE.Vector2()

/** Superellipse exponent of the crown's profile: the front stands up straighter than the back. */
const profile = (phi: number) => 2.2 + 0.6 * Math.cos(phi)

/** Height of the crown's lower edge, raised at the front where it follows the curve of the bill. */
function baseY(phi: number): number {
  const p = Math.atan2(Math.sin(phi), Math.cos(phi))
  if (Math.abs(p) >= BILL_SIDE) return 0
  const x = (Math.sin(p) * SX) / XC
  return BILL_ARCH * (1 - x * x)
}

/** Height of the back opening's arch at this angle, 0 outside it. */
function archY(phi: number): number {
  const d = Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))))
  return d >= OPEN_HALF ? 0 : OPEN_TOP * Math.pow(1 - Math.pow(d / OPEN_HALF, 2.6), 1 / 2.6)
}

/** Profile parameter (0 at the base, 1 at the button) at a given height. */
function vAt(phi: number, y: number): number {
  const y0 = baseY(phi)
  const h = THREE.MathUtils.clamp((y - y0) / (SY - y0), 0, 1)
  return Math.asin(Math.pow(h, profile(phi) / 2)) / (Math.PI / 2)
}

/** Arc length per radian around the crown at profile parameter v. */
function girth(phi: number, v: number): number {
  const r = Math.pow(Math.cos((v * Math.PI) / 2), 2 / profile(phi))
  return r * Math.hypot(SX * Math.cos(phi), SZ * Math.sin(phi))
}

/** Point on the crown's smooth shell: phi around from the front, v from the base to the button. */
function shell(phi: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  const n = profile(phi)
  const th = (v * Math.PI) / 2
  const r = Math.pow(Math.cos(th), 2 / n)
  const h = Math.pow(Math.sin(th), 2 / n)
  const y0 = baseY(phi)
  return out.set(SX * Math.sin(phi) * r, y0 + (SY - y0) * h, SZ * Math.cos(phi) * r + APEX_Z * (1 - r))
}

/** Outward direction at a crown point, taken from the ellipsoid the crown is close to. */
function outward(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(p.x / (SX * SX), p.y / (SY * SY), (p.z - APEX_Z) / (SZ * SZ)).normalize()
}

/** Angle to the nearest seam: up the front, the back, and every 60 degrees between. */
function seamGap(phi: number): number {
  const p = TAU / SEAMS
  const d = ((phi % p) + p) % p
  return Math.min(d, p - d)
}

/** Point on the crown fabric: panels gently domed, creased where they are sewn together. */
function crown(phi: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  shell(phi, v, out)
  const g = girth(phi, v)
  const puff = 0.012 * Math.sin(Math.PI * v) * (1 - Math.cos(SEAMS * phi)) * 0.5
  const crease =
    0.008 *
    Math.exp(-(((seamGap(phi) * g) / 0.025) ** 2)) *
    THREE.MathUtils.smoothstep(g, 0.08, 0.3) *
    THREE.MathUtils.smoothstep(v, 0, 0.08)
  return out.addScaledVector(outward(out, tmpN), puff - crease)
}

/** Inner and outer edge of the bill at u, from one corner (0) to the other (1), in x and z. */
function billEdges(u: number, inner: THREE.Vector2, outer: THREE.Vector2): void {
  const phi = BILL_SIDE * (2 * u - 1)
  inner.set(Math.sin(phi) * SX * BILL_INSET, Math.cos(phi) * SZ * BILL_INSET)
  const t = Math.PI * (1 - u)
  const c = Math.cos(t)
  const z0 = Math.cos(BILL_SIDE) * SZ
  outer.set(BILL_HALF_WIDTH * Math.sign(c) * Math.abs(c) ** (2 / 2.4), z0 + (BILL_TIP - z0) * Math.abs(Math.sin(t)) ** (2 / 2.4))
  // The edge sweeps in to a point where each corner meets the crown.
  outer.lerp(inner, 1 - THREE.MathUtils.smoothstep(Math.min(u, 1 - u), 0, 0.08))
}

/** Height of the bill's top at x, a distance d out from the crown. */
const billTop = (x: number, d: number) => BILL_ARCH * (1 - (x / XC) ** 2) - BILL_PITCH * d - BILL_CURL * x * x * d

/** Point on the bill's top (side 0) or underside (side 1); w runs out from the crown to the edge. */
function bill(u: number, w: number, side: number, out: THREE.Vector3): THREE.Vector3 {
  billEdges(u, tmpI, tmpO)
  const x = tmpI.x + (tmpO.x - tmpI.x) * w
  const d = tmpI.distanceTo(tmpO) * w
  return out.set(x, billTop(x, d) - side * BILL_THICK, tmpI.y + (tmpO.y - tmpI.y) * w)
}

/** Smooth-shaded surface through a grid of points listed column by column. */
function grid(points: THREE.Vector3[], cols: number, rows: number, flip = false): THREE.BufferGeometry {
  const index: number[] = []
  for (let i = 0; i < cols - 1; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j
      const b = a + rows
      if (flip) index.push(a, a + 1, b, b, a + 1, b + 1)
      else index.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/** A flat band along a path, `across` spanning its width and `through` its thickness. */
function band(path: THREE.Vector3[], across: THREE.Vector3[], through: THREE.Vector3[], width: number, thickness: number) {
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
  const sides: THREE.BufferGeometry[] = []
  for (let s = 0; s < 4; s++) {
    const points: THREE.Vector3[] = []
    path.forEach((p, i) => {
      for (const [a, t] of [corners[s], corners[(s + 1) % 4]]) {
        points.push(p.clone().addScaledVector(across[i], (a * width) / 2).addScaledVector(through[i], (t * thickness) / 2))
      }
    })
    sides.push(grid(points, path.length, 2))
  }
  return mergeGeometries(sides)
}

/** A rounded square tile lying flat, its underside on y = 0. */
function roundedSquare(size: number, radius: number, depth: number, bevel: number): THREE.BufferGeometry {
  const h = size / 2 - bevel
  const r = radius - bevel
  const shape = new THREE.Shape()
  shape.moveTo(-h + r, -h)
  shape.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false)
  shape.absarc(h - r, h - r, r, 0, Math.PI / 2, false)
  shape.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false)
  shape.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 })
  return geometry.rotateX(-Math.PI / 2).translate(0, bevel + 0.001, 0)
}

const stitch = (points: THREE.Vector3[], radius = 0.003) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length * 2, radius, 4, false)

function crownGeometry(): THREE.BufferGeometry {
  // Columns around from the back, with extra ones at the sides of the back opening so its edges stay crisp.
  const phis: number[] = []
  for (let i = 0; i <= 180; i++) phis.push(-Math.PI + (i / 180) * TAU)
  for (const s of [-1, 1]) for (const d of [OPEN_HALF, OPEN_HALF - 0.004]) phis.push(s * (Math.PI - d))
  phis.sort((a, b) => a - b)
  const rows = 56
  const points: THREE.Vector3[] = []
  for (const phi of phis) {
    const v0 = vAt(phi, archY(phi))
    for (let j = 0; j < rows; j++) points.push(crown(phi, v0 + (1 - v0) * (j / (rows - 1)), new THREE.Vector3()))
  }
  return grid(points, phis.length, rows)
}

function billGeometry(): THREE.BufferGeometry {
  const cols = 72
  const rows = 16
  const arc = 6
  const top: THREE.Vector3[] = []
  const under: THREE.Vector3[] = []
  const rim: THREE.Vector3[] = []
  const out = new THREE.Vector3()
  for (let i = 0; i < cols; i++) {
    const u = i / (cols - 1)
    for (let j = 0; j < rows; j++) {
      top.push(bill(u, j / (rows - 1), 0, new THREE.Vector3()))
      under.push(bill(u, j / (rows - 1), 1, new THREE.Vector3()))
    }
    // The fabric wraps round the edge in a half-round.
    billEdges(u, tmpI, tmpO)
    out.set(tmpO.x - tmpI.x + tmpI.x * 0.01, 0, tmpO.y - tmpI.y + tmpI.y * 0.01).normalize()
    const a = top[top.length - 1]
    const b = under[under.length - 1]
    for (let k = 0; k <= arc; k++) {
      const t = (k / arc) * Math.PI
      rim.push(a.clone().lerp(b, (1 - Math.cos(t)) / 2).addScaledVector(out, (Math.sin(t) * BILL_THICK) / 2))
    }
  }
  return mergeGeometries([grid(top, cols, rows, true), grid(under, cols, rows), grid(rim, cols, arc + 1, true)])
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
  private readonly strap = new THREE.Group()
  private readonly brim = new THREE.Group()
  private readonly clip = new THREE.Group()
  private readonly module = new THREE.Group()
  private readonly plug = new THREE.Group()
  private readonly clipBase = new THREE.Vector3()
  private readonly moduleBase = new THREE.Vector3()
  private readonly plugBase = new THREE.Vector3()
  private readonly cableCrown: THREE.Vector3[] = []
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
        color: 0x0f0f11,
        roughness: 0.94,
        sheen: 0.8,
        sheenRoughness: 0.45,
        sheenColor: new THREE.Color(0x4c4c52),
        side: THREE.DoubleSide,
      }),
    )
    const tape = this.fade(new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85, side: THREE.DoubleSide }))
    const thread = this.fade(new THREE.MeshStandardMaterial({ color: 0x3a3a3f, roughness: 0.7 }))
    const plastic = this.fade(
      new THREE.MeshPhysicalMaterial({ color: 0x1a1a1f, roughness: 0.62, metalness: 0.05, clearcoat: 0.2, clearcoatRoughness: 0.6 }),
    )
    const gloss = this.fade(
      new THREE.MeshPhysicalMaterial({ color: 0x0b0b0e, roughness: 0.3, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
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
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    const marker = new THREE.Object3D()
    const place = (geometry: THREE.BufferGeometry, at: THREE.Vector3, facing: THREE.Vector3) => {
      marker.position.copy(at)
      marker.lookAt(at.clone().add(facing))
      marker.updateMatrix()
      return geometry.applyMatrix4(marker.matrix)
    }

    // Crown: six panels with topstitched seams, eyelets, a button, taped seams and a sweatband inside.
    const crownMesh = new THREE.Mesh(crownGeometry(), fabric)
    const stitches: THREE.BufferGeometry[] = []
    const tapes: THREE.BufferGeometry[] = []
    const eyelets: THREE.BufferGeometry[] = []
    const holes: THREE.BufferGeometry[] = []
    for (let k = 0; k < SEAMS; k++) {
      const seam = -Math.PI + (k / SEAMS) * TAU
      const n2 = profile(seam) / 2
      const start = vAt(seam, archY(seam)) + 0.02
      const end = Math.acos(Math.pow(0.1 / Math.hypot(SX * Math.cos(seam), SZ * Math.sin(seam)), n2)) / (Math.PI / 2)
      // Topstitching either side of the seam outside, and the edges of the seam tape inside.
      const rows: THREE.Vector3[][] = [[], [], [], []]
      for (let i = 0; i <= 24; i++) {
        const v = start + (end - start) * (i / 24)
        const g = girth(seam, v)
        SEAM_OFFSETS.forEach((o, s) => {
          crown(seam + o / g, v, p)
          rows[s].push(p.clone().addScaledVector(outward(p, n), s < 2 ? 0.004 : -0.008))
        })
      }
      stitches.push(stitch(rows[0]), stitch(rows[1]))
      tapes.push(grid(rows[2].flatMap((a, i) => [a, rows[3][i]]), rows[2].length, 2))

      crown(seam + Math.PI / SEAMS, 0.7, p)
      outward(p, n)
      eyelets.push(place(new THREE.TorusGeometry(0.03, 0.009, 6, 18), p.clone().addScaledVector(n, 0.002), n))
      holes.push(place(new THREE.CircleGeometry(0.022, 16), p.clone().addScaledVector(n, 0.001), n))
    }

    // A row of stitching round the base, and binding round the back opening.
    const baseRow: THREE.Vector3[] = []
    for (let i = 0; i <= 120; i++) {
      const phi = (Math.PI - OPEN_HALF - 0.03) * (2 * (i / 120) - 1)
      crown(phi, vAt(phi, baseY(phi) + 0.04), p)
      baseRow.push(p.clone().addScaledVector(outward(p, n), 0.004))
    }
    stitches.push(stitch(baseRow))
    const binding: THREE.Vector3[] = []
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI
      const c = Math.cos(t)
      const phi = Math.PI - OPEN_HALF * Math.sign(c) * Math.abs(c) ** (2 / 2.6)
      binding.push(crown(phi, vAt(phi, OPEN_TOP * Math.sin(t) ** (2 / 2.6)), new THREE.Vector3()))
    }

    const sweat: THREE.Vector3[] = []
    for (let i = 0; i <= 140; i++) {
      const phi = (Math.PI - OPEN_HALF) * (2 * (i / 140) - 1)
      const top = vAt(phi, baseY(phi) + 0.28)
      for (let j = 0; j < 3; j++) {
        crown(phi, (top * j) / 2, p)
        sweat.push(p.clone().addScaledVector(outward(p, n), -0.014))
      }
    }

    this.button = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 12).scale(1, 0.42, 1), fabric)
    this.button.position.set(0, SY - 0.004, APEX_Z)
    this.crown.add(
      crownMesh,
      new THREE.Mesh(mergeGeometries(stitches), thread),
      new THREE.Mesh(mergeGeometries(tapes), tape),
      new THREE.Mesh(grid(sweat, 141, 3), tape),
      new THREE.Mesh(mergeGeometries(eyelets), thread),
      new THREE.Mesh(mergeGeometries(holes), black),
      new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(binding), 60, 0.014, 6, false), tape),
      this.button,
    )

    // Strap across the bottom of the back opening, with a slide buckle.
    const path: THREE.Vector3[] = []
    const across: THREE.Vector3[] = []
    const through: THREE.Vector3[] = []
    for (let i = 0; i <= 40; i++) {
      const phi = Math.PI + (OPEN_HALF + 0.16) * (2 * (i / 40) - 1)
      shell(phi, vAt(phi, 0.1), p)
      outward(p, n)
      n.y = 0
      n.normalize()
      path.push(p.clone().addScaledVector(n, -0.025))
      across.push(new THREE.Vector3(0, 1, 0))
      through.push(n.clone())
    }
    const strapMesh = new THREE.Mesh(band(path, across, through, 0.2, 0.016), fabric)
    const at = path[25].clone().addScaledVector(through[25], 0.022)
    const buckle = new THREE.Mesh(place(new RoundedBoxGeometry(0.12, 0.24, 0.026, 2, 0.01), at, through[25]), metal)
    const slot = new THREE.Mesh(
      place(new THREE.BoxGeometry(0.05, 0.17, 0.006).translate(0, 0, 0.012), at, through[25]),
      black,
    )
    this.strap.add(strapMesh, buckle, slot)
    this.crown.add(this.strap)

    // Bill: curved across, sloping down, with rows of stitching that follow its edge, top and underside.
    const brimMesh = new THREE.Mesh(billGeometry(), fabric)
    const billRows: THREE.BufferGeometry[] = []
    for (let k = 1; k <= 5; k++) {
      const w = 1 - 0.085 * k
      for (const side of [0, 1]) {
        const points: THREE.Vector3[] = []
        for (let i = 0; i <= 48; i++) points.push(bill(0.02 + (i / 48) * 0.96, w, side, new THREE.Vector3()).add(n.set(0, side ? -0.004 : 0.004, 0)))
        billRows.push(stitch(points))
      }
    }
    this.brim.add(brimMesh, new THREE.Mesh(mergeGeometries(billRows), thread))

    // The camera clips onto the bill: a small plate on top, the module underneath.
    const seat = billTop(0, MODULE_Z - SZ * BILL_INSET)
    const tilt = Math.atan(BILL_PITCH)
    this.clipBase.set(0, seat, MODULE_Z)
    this.clip.position.copy(this.clipBase)
    this.clip.rotation.x = tilt
    const plate = new THREE.Mesh(roundedSquare(0.26, 0.06, 0.016, 0.008), plastic)
    const magnet = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 24), metal)
    magnet.position.y = 0.034
    this.clip.add(plate, magnet)
    this.brim.add(this.clip)

    this.moduleBase.set(0, seat - BILL_THICK, MODULE_Z)
    this.module.position.copy(this.moduleBase)
    this.module.rotation.x = tilt
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.22, 0.32, 4, 0.05), plastic)
    body.position.y = -0.114
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.16, 0.03, 3, 0.03), gloss)
    bezel.position.set(0, -0.118, 0.155)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.054, 0.03, 40).rotateX(Math.PI / 2), metal)
    barrel.position.set(0, -0.118, 0.178)
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.008, 40).rotateX(Math.PI / 2), glass)
    lens.position.set(0, -0.118, 0.194)
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), this.led)
    led.position.set(0.105, -0.07, 0.171)
    const port = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.036, 0.09, 2, 0.006), metal)
    port.position.set(-0.17, -0.12, -0.04)
    const socket = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.07), black)
    socket.position.set(-0.177, -0.12, -0.04)

    // USB-C plug on the end of the cable.
    this.plugBase.set(-0.176, -0.12, -0.04)
    this.plug.position.copy(this.plugBase)
    const boot = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.05, 0.075, 2, 0.018), rubber)
    boot.position.x = -0.05
    const relief = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.05, 16).rotateZ(Math.PI / 2), rubber)
    relief.position.x = -0.125
    this.plug.add(boot, relief)
    this.module.add(body, bezel, barrel, lens, led, port, socket, this.plug)

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
    this.cone.position.set(0, -0.118, 0.2)
    this.cone.visible = false
    this.module.add(this.cone)

    // The cable runs back under the bill, into the crown and up its inside wall to a grommet.
    shell(-0.45, 0, p)
    this.cableCrown.push(new THREE.Vector3(p.x * 0.9, p.y - 0.05, p.z * 0.9))
    crown(-0.8, 0.12, p)
    this.cableCrown.push(p.clone().addScaledVector(outward(p, n), -0.03))
    crown(-0.95, 0.3, p)
    outward(p, n)
    this.cableCrown.push(p.clone().addScaledVector(n, -0.014))
    this.crown.add(new THREE.Mesh(place(new THREE.TorusGeometry(0.024, 0.007, 6, 16), p.clone().addScaledVector(n, -0.01), n), metal))
    this.cable = new THREE.Mesh(new THREE.BufferGeometry(), rubber)

    // Centre the whole cap on the origin so the orb's points can flow into it.
    this.inner.position.set(0, -0.5, -0.41)
    this.inner.add(this.crown, this.brim, this.module, this.cable)
    this.group.add(this.inner)
    this.surface.push(crownMesh, brimMesh, this.button, strapMesh, plate, body)

    this.anchors.lens = this.anchor(this.module, 0.18, -0.11, 0.1)
    this.anchors.usb = this.anchor(this.plug, -0.15, 0, 0)
    this.anchors.brim = this.anchor(this.brim, 0.2, seat - BILL_THICK, MODULE_Z)
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

    this.crown.position.y = 0.5 * explode
    this.button.position.y = SY - 0.004 + 0.24 * explode
    this.strap.position.z = -0.14 * explode
    this.brim.position.set(0, -0.03 * explode, 0.16 * explode)
    this.clip.position.copy(this.clipBase).add(this.tmp.set(0, 0.1 * explode, 0))
    this.module.position.copy(this.moduleBase).add(this.tmp.set(0, -0.4 * explode, 0.14 * explode))
    this.plug.position.copy(this.plugBase).add(this.tmp.set(-0.12 * explode, 0, 0))
    if (Math.abs(explode - this.lastExplode) > 0.002) this.rebuildCable(explode)

    const coneOpacity = cone * solid
    this.coneUniforms.uOpacity.value = coneOpacity
    this.coneUniforms.uTime.value = time
    this.cone.visible = coneOpacity > 0.01
    this.led.color.set(Math.sin(time * 4) > 0 ? 0xff6a1a : 0x3a1606)
  }

  private rebuildCable(explode: number): void {
    for (const o of [this.crown, this.brim, this.module, this.plug]) o.updateMatrix()
    const fromPlug = (x: number, y: number, z: number) =>
      new THREE.Vector3(x, y, z).applyMatrix4(this.plug.matrix).applyMatrix4(this.module.matrix)
    const points = [
      fromPlug(-0.15, 0, 0),
      fromPlug(-0.26, 0.01, -0.03),
      new THREE.Vector3(-0.42, billTop(-0.42, 0.15) - BILL_THICK - 0.03, 1.2).applyMatrix4(this.brim.matrix),
      ...this.cableCrown.map((c) => c.clone().applyMatrix4(this.crown.matrix)),
    ]
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
    this.cable.geometry.dispose()
    this.cable.geometry = new THREE.TubeGeometry(curve, 64, 0.015, 8, false)
    this.anchors.cable.position.copy(curve.getPoint(0.8))
    this.lastExplode = explode
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
