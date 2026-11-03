import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { arcFromBulge, bulgeOf } from '../engine/geom'
import { placementMatrix } from '../engine/solids'
import type { PartGeometry, PartInstance, Polygon } from '../engine/types'

export interface Solid {
  key: string
  name: string
  geometry: PartGeometry
  thickness: number
  placement: PartInstance
  color: string
  /** Direção (mm) para onde a peça se afasta na vista explodida. */
  explode?: [number, number, number]
}

function addContour(path: THREE.Path, poly: Polygon) {
  path.moveTo(poly[0].x, poly[0].y)
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const bulge = bulgeOf(a)
    if (bulge) {
      const arc = arcFromBulge(a, b, bulge)
      path.absarc(arc.cx, arc.cy, arc.r, arc.a0, arc.a0 + arc.sweep, arc.sweep < 0)
    } else {
      path.lineTo(b.x, b.y)
    }
  }
}

/** Sólido extrudado a partir do mesmo contorno que vai para o DXF. */
function solidGeometry(g: PartGeometry, thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  addContour(shape, g.outer)
  for (const c of g.cutouts) {
    const p = new THREE.Path()
    addContour(p, c)
    shape.holes.push(p)
  }
  for (const h of g.holes) {
    const p = new THREE.Path()
    p.absarc(h.x, h.y, h.r, 0, Math.PI * 2, true)
    shape.holes.push(p)
  }
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 10 })
}

export default function Viewer3D({ solids, fitKey }: { solids: Solid[]; fitKey: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [explode, setExplode] = useState(0)
  const [animating, setAnimating] = useState(false)
  const anim = useRef(0)
  const scene = useRef<{ group: THREE.Group; fit: () => void; render: () => void } | null>(null)

  // cena, câmera e controles (uma vez)
  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0xf4f6f8)
    el.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    const sc = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 100000)
    camera.up.set(0, 0, 1)
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8a94a3, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.8)
    sun.position.set(-0.6, -1, 1.4)
    sc.add(sun)
    const group = new THREE.Group()
    sc.add(group)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    const render = () => renderer.render(sc, camera)
    controls.addEventListener('change', render)

    const fit = () => {
      const box = new THREE.Box3().setFromObject(group)
      if (box.isEmpty()) return render()
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3()).length()
      sun.position.copy(center).add(new THREE.Vector3(-0.6, -1, 1.4).multiplyScalar(size))
      sun.target.position.copy(center)
      sun.target.updateMatrixWorld()
      // distância para a esfera envolvente caber no menor ângulo de visão (vertical ou horizontal)
      const vFov = THREE.MathUtils.degToRad(camera.fov)
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
      const dist = (size / 2 / Math.sin(Math.min(vFov, hFov) / 2)) * 1.05
      const dir = new THREE.Vector3(0.9, -1.4, 1.25).normalize()
      camera.position.copy(center).addScaledVector(dir, dist)
      camera.near = size / 100
      camera.far = size * 20
      camera.updateProjectionMatrix()
      controls.target.copy(center)
      controls.update()
      render()
    }
    let fitted = false
    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
      // o primeiro enquadramento espera a área ter tamanho real
      if (!fitted && w > 0 && h > 0 && group.children.length) {
        fitted = true
        fit()
      } else render()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    scene.current = { group, fit, render }
    return () => {
      ro.disconnect()
      controls.dispose()
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        }
      })
      renderer.dispose()
      el.removeChild(renderer.domElement)
      scene.current = null
    }
  }, [])

  // malhas das peças
  const geometries = useMemo(() => solids.map((s) => ({ s, geo: solidGeometry(s.geometry, s.thickness) })), [solids])
  useEffect(() => {
    const ctx = scene.current
    if (!ctx) return
    for (const child of [...ctx.group.children]) {
      ctx.group.remove(child)
      child.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        }
      })
    }
    for (const { s, geo } of geometries) {
      const holder = new THREE.Group()
      holder.name = s.key
      holder.userData.explode = s.explode ?? [0, 0, 0]
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: s.color, metalness: 0.25, roughness: 0.65, side: THREE.DoubleSide }))
      mesh.matrixAutoUpdate = false
      mesh.matrix.fromArray(placementMatrix(s.placement))
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x2b3138, transparent: true, opacity: 0.35 }))
      edges.matrixAutoUpdate = false
      edges.matrix.copy(mesh.matrix)
      holder.add(mesh, edges)
      ctx.group.add(holder)
    }
    ctx.render()
  }, [geometries])

  // vista explodida
  useEffect(() => {
    const ctx = scene.current
    if (!ctx) return
    for (const h of ctx.group.children) {
      const [x, y, z] = h.userData.explode as number[]
      h.position.set(x * explode, y * explode, z * explode)
    }
    ctx.render()
  }, [explode, geometries])

  // animação: desmonta e monta de novo, com aceleração suave (ida e volta em ~3,6 s)
  useEffect(() => {
    if (!animating) return
    const start = performance.now()
    const from = explode
    const period = 3600
    const step = (now: number) => {
      const t = ((now - start) / period) % 1
      // começa do estado atual e oscila entre montado (0) e desmontado (1)
      const phase = (Math.acos(1 - 2 * from) / Math.PI + 2 * t) % 2
      setExplode((1 - Math.cos(Math.PI * phase)) / 2)
      anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(anim.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animating])

  const toggleAnimation = () => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // sem animação: só alterna entre montado e desmontado
      setExplode((e) => (e > 0.5 ? 0 : 1))
      return
    }
    setAnimating((a) => !a)
  }

  // reenquadra quando o conjunto muda de tamanho
  useEffect(() => {
    scene.current?.fit()
  }, [fitKey])

  return (
    <div className="relative h-full w-full" data-testid="viewer-3d">
      <div ref={host} className="absolute inset-0" aria-label="Visualização 3D da montagem. Arraste para girar, use a roda para zoom e o botão direito para mover." role="img" />
      <div className="absolute left-3 top-3 flex items-center gap-3 rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs text-ink-soft shadow-sm">
        <label htmlFor="explode" className="font-medium">
          Vista explodida
        </label>
        <input
          id="explode"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={explode}
          onChange={(e) => {
            setAnimating(false)
            setExplode(Number(e.target.value))
          }}
          className="w-28 accent-accent"
        />
        <button type="button" className="font-medium text-accent hover:underline" onClick={toggleAnimation} aria-pressed={animating} data-testid="animate-assembly">
          {animating ? 'Parar' : 'Animar montagem'}
        </button>
        <button type="button" className="font-medium text-accent hover:underline" onClick={() => scene.current?.fit()}>
          Enquadrar
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-surface/90 px-2 py-1 text-[11px] text-muted">Arraste para girar · roda ou pinça para zoom · botão direito ou dois dedos para mover</p>
    </div>
  )
}
