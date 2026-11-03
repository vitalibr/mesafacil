"""Auditoria independente dos DXF gerados, usando ezdxf.

Uso: DXF_OUT=test-output/dxf npx vitest run src/export && python scripts/verify_dxf.py test-output/dxf

Confere, para cada arquivo: leitura sem erros, auditoria do ezdxf sem erros,
unidades em milímetros, somente entidades LWPOLYLINE fechadas e CIRCLE na
camada CORTE, sem entidades duplicadas e sem cotas ou textos.
"""
import sys
from pathlib import Path

import ezdxf
from ezdxf import recover


def check(path: Path) -> list[str]:
    problems = []
    doc, auditor = recover.readfile(path)
    if auditor.has_errors:
        problems.append(f"auditoria: {[str(e.message) for e in auditor.errors]}")
    if doc.header.get("$INSUNITS") != 4:
        problems.append(f"$INSUNITS = {doc.header.get('$INSUNITS')} (esperado 4 = mm)")
    msp = doc.modelspace()
    seen = set()
    counts = {}
    for e in msp:
        t = e.dxftype()
        counts[t] = counts.get(t, 0) + 1
        if e.dxf.layer != "CORTE":
            problems.append(f"{t} fora da camada CORTE")
        if t == "LWPOLYLINE":
            if not e.closed:
                problems.append("LWPOLYLINE aberta")
            key = ("P", tuple((round(x, 4), round(y, 4)) for x, y, *_ in e.get_points()))
        elif t == "CIRCLE":
            c = e.dxf.center
            key = ("C", round(c.x, 4), round(c.y, 4), round(e.dxf.radius, 4))
        else:
            problems.append(f"entidade inesperada {t}")
            continue
        if key in seen:
            problems.append(f"entidade duplicada {key[:4]}")
        seen.add(key)
    if counts.get("LWPOLYLINE", 0) < 1:
        problems.append("sem contorno externo")
    print(f"{path}: {counts} {'OK' if not problems else 'FALHOU'}")
    return problems


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "test-output/dxf")
    files = sorted(root.rglob("*.dxf"))
    if not files:
        print(f"nenhum DXF em {root}")
        return 1
    failed = 0
    for f in files:
        for p in check(f):
            print(f"  - {p}")
            failed += 1
    print(f"{len(files)} arquivo(s), ezdxf {ezdxf.__version__}, {failed} problema(s)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
