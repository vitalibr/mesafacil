# Inspeção SOMENTE LEITURA do projeto "Mesa de Solda" no Fusion 360.
# Para cada corpo em chapa: espessura, normal, e o contorno da maior face plana
# em coordenadas 2D locais (mm), além da posição no mundo.
import adsk.core, adsk.fusion, math

def v3(p): return (p.x*10, p.y*10, p.z*10)
def sub(a,b): return (a[0]-b[0],a[1]-b[1],a[2]-b[2])
def dot(a,b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
def cross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def norm(a):
    l = math.sqrt(dot(a,a)); return (a[0]/l,a[1]/l,a[2]/l)

def describe(body, label, only=None):
    planar = [f for f in body.faces if f.geometry.surfaceType == adsk.core.SurfaceTypes.PlaneSurfaceType]
    planar.sort(key=lambda f: -f.area)
    top = planar[0]
    ok, nvec = top.evaluator.getNormalAtPoint(top.pointOnFace)
    n = norm((nvec.x, nvec.y, nvec.z))
    p0 = v3(top.pointOnFace)
    th = None
    for f in planar[1:]:
        ok2, m = f.evaluator.getNormalAtPoint(f.pointOnFace)
        mm = norm((m.x,m.y,m.z))
        if dot(mm, n) < -0.9999:
            th = abs(dot(sub(v3(f.pointOnFace), p0), n)); break
    # eixo u: maior aresta reta do laço externo
    outer = [l for l in top.loops if l.isOuter][0]
    best = None
    for e in outer.edges:
        if e.geometry.curveType == adsk.core.Curve3DTypes.Line3DCurveType:
            a, b = v3(e.startVertex.geometry), v3(e.endVertex.geometry)
            L = math.sqrt(dot(sub(b,a),sub(b,a)))
            if best is None or L > best[0]: best = (L, a, b)
    u = norm(sub(best[2], best[1]))
    v = cross(n, u)
    # origem: mínimo de u e v entre os vértices
    verts = [v3(vx.geometry) for vx in top.vertices]
    us = [dot(p,u) for p in verts]; vs = [dot(p,v) for p in verts]
    ou, ov = min(us), min(vs)
    to2 = lambda p: (round(dot(p,u)-ou,3), round(dot(p,v)-ov,3))
    print(f'== {label}: thickness={th and round(th,3)} n={tuple(round(x,4) for x in n)} u={tuple(round(x,4) for x in u)} size=({round(max(us)-ou,3)} x {round(max(vs)-ov,3)}) facePlane={round(dot(p0,n),3)}')
    print(f'   origin(world)={tuple(round(x,3) for x in (ou*u[0]+ov*v[0]+dot(p0,n)*n[0], ou*u[1]+ov*v[1]+dot(p0,n)*n[1], ou*u[2]+ov*v[2]+dot(p0,n)*n[2]))}')
    for li, loop in enumerate(top.loops):
        print(f'   loop {li} outer={loop.isOuter} edges={loop.edges.count}')
        for e in loop.coEdges:
            g = e.edge.geometry
            ct = g.curveType
            sv, ev = (e.edge.startVertex, e.edge.endVertex)
            if e.isOpposedToEdge: sv, ev = ev, sv
            if ct == adsk.core.Curve3DTypes.Line3DCurveType:
                print(f'     L {to2(v3(sv.geometry))} -> {to2(v3(ev.geometry))}')
            elif ct == adsk.core.Curve3DTypes.Arc3DCurveType:
                print(f'     A c={to2(v3(g.center))} r={round(g.radius*10,3)} {to2(v3(sv.geometry))} -> {to2(v3(ev.geometry))}')
            elif ct == adsk.core.Curve3DTypes.Circle3DCurveType:
                print(f'     C c={to2(v3(g.center))} r={round(g.radius*10,3)}')
            else:
                print(f'     ? type={ct}')

def run(_context: str):
    d = adsk.fusion.Design.cast(adsk.core.Application.get().activeProduct)
    root = d.rootComponent
    for oc in root.occurrences:
        if WANT and oc.name not in WANT: continue
        for b in oc.bRepBodies:
            describe(b, f'{oc.name}/{b.name}')
