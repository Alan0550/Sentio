"""
Tests de csv_processor.py — 6 casos.

Ejecutar desde backend/functions/analyze/:
    python -m tests.test_csv
"""

import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.csv_processor import parse_csv

# ── Casos ─────────────────────────────────────────────────────────────────────

CASO1 = b"""customer_id,feedback,fecha,canal
C001,"Excelente servicio muy rapido",2026-04-01,encuesta
C002,"Pesimo nunca mas vuelvo",2026-04-01,chat
C003,"Esta bien pero el precio es alto",2026-04-02,resena
"""

CASO2 = b"""feedback
"Muy buena atencion al cliente hoy"
"Tardaron demasiado en responder"
"""

CASO3 = b"""customer_id;feedback;canal
C001;Buen servicio en general;encuesta
C002;Malo todo muy malo siempre;chat
"""

CASO4 = b"""customer_id,comentario,fecha
C001,"texto aqui",2026-04-01
"""

CASO5 = b"""customer_id,feedback
C001,Bien
C002,
C003,ok
C004,Excelente servicio al cliente muy satisfecho con todo
"""

# Caso 6: Latin-1 con caracteres especiales
CASO6 = "customer_id,feedback\nC001,\"Excelente atenci\xf3n, muy r\xe1pidos y amables\"\n".encode("latin-1")

# ── Runner ────────────────────────────────────────────────────────────────────

def run():
    casos = [
        {
            "id": 1,
            "nombre": "CSV valido estandar",
            "data": CASO1,
            "check": lambda r: (
                r["success"] is True
                and r["total_rows"] == 3
                and len(r["errors"]) == 0
            ),
            "desc": "success=True, 3 filas, 0 errores",
        },
        {
            "id": 2,
            "nombre": "Solo columna feedback — customer_id autogenerado",
            "data": CASO2,
            "check": lambda r: (
                r["success"] is True
                and r["total_rows"] == 2
                and r["rows"][0]["customer_id"] == "AUTO-1"
                and r["rows"][1]["customer_id"] == "AUTO-2"
            ),
            "desc": "success=True, 2 filas, customer_id = AUTO-1 y AUTO-2",
        },
        {
            "id": 3,
            "nombre": "Separador punto y coma",
            "data": CASO3,
            "check": lambda r: (
                r["success"] is True
                and r["total_rows"] == 2
            ),
            "desc": "success=True, 2 filas detectadas con separador ;",
        },
        {
            "id": 4,
            "nombre": "Sin columna feedback",
            "data": CASO4,
            "check": lambda r: (
                r["success"] is False
                and len(r["errors"]) > 0
                and "feedback" in r["errors"][0].lower()
            ),
            "desc": "success=False, error menciona 'feedback'",
        },
        {
            "id": 5,
            "nombre": "Filas vacias y feedback corto — solo 1 valida",
            "data": CASO5,
            "check": lambda r: (
                r["success"] is True
                and r["total_rows"] == 1
                and r["rows"][0]["customer_id"] == "C004"
            ),
            "desc": "success=True, 1 fila valida (C004), resto skippeado",
        },
        {
            "id": 6,
            "nombre": "Encoding Latin-1 con caracteres especiales",
            "data": CASO6,
            "check": lambda r: (
                r["success"] is True
                and r["total_rows"] == 1
                and ("ó" in r["rows"][0]["feedback"] or "á" in r["rows"][0]["feedback"])
            ),
            "desc": "success=True, caracteres decodificados correctamente",
        },
    ]

    ok    = 0
    total = len(casos)

    print("=" * 60)
    print("SENTIO — TEST csv_processor.py (6 CASOS)")
    print("=" * 60)

    for caso in casos:
        result = parse_csv(caso["data"])
        passed = False
        try:
            passed = caso["check"](result)
        except Exception as e:
            passed = False

        status = "OK" if passed else "FAIL"
        if passed:
            ok += 1

        print(f"\nCaso {caso['id']}: {caso['nombre']}")
        print(f"  Esperado : {caso['desc']}")
        print(f"  Obtenido : success={result['success']}, rows={result['total_rows']}, errors={result['errors']}")
        if result["rows"]:
            r0 = result["rows"][0]
            print(f"  Primera fila: customer_id={r0['customer_id']} feedback='{r0['feedback'][:50]}'")
        print(f"  [{status}]")

    print("\n" + "=" * 60)
    print(f"RESULTADO: {ok}/{total} tests pasando")
    if ok == total:
        print("Todos los tests pasaron.")
    else:
        print("Hay tests fallando — revisar csv_processor.py antes de continuar.")
    print("=" * 60)
    return ok, total


if __name__ == "__main__":
    run()
