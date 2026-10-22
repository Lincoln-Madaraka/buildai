import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

export interface SurfaceSamples {
  pos: Float32Array
  nrm: Float32Array
}

/** Area-weighted random points (and normals) on a set of meshes, expressed in `root`'s local space. */
export function sampleSurface(meshes: THREE.Mesh[], root: THREE.Object3D, count: number): SurfaceSamples {
  root.updateMatrixWorld(true)
  const toRoot = root.matrixWorld.clone().invert()

  const parts = meshes.map((mesh) => {
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    g.clearGroups()
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld))
    return g
  })

  const merged = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  if (!merged) throw new Error('sampleSurface: could not merge geometries')

  const sampler = new MeshSurfaceSampler(new THREE.Mesh(merged)).build()
  const pos = new Float32Array(count * 3)
  const nrm = new Float32Array(count * 3)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    sampler.sample(p, n)
    p.toArray(pos, i * 3)
    n.toArray(nrm, i * 3)
  }
  merged.dispose()
  return { pos, nrm }
}
