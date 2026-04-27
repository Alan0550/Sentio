"""
Tests de aggregator.py — 4 casos (sin DynamoDB, usando mocks).

Ejecutar desde backend/functions/analyze/:
    python -m tests.test_aggregator
"""

import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Mock de history.get_analyses_by_period ────────────────────────────────────

_mock_data = {}

def _mock_get_analyses(org_id, period):
    return _mock_data.get((org_id, period), [])

import services.aggregator as aggregator_module
aggregator_module.get_analyses_by_period = _mock_get_analyses

from services.aggregator import get_period_metrics, get_trend, compare_periods

# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_item(nps, emotion="satisfacción", churn="bajo", urgency=False, aspects=None, industry="general"):
    return {
        "nps_classification": nps,
        "dominant_emotion":   emotion,
        "churn_risk":         churn,
        "urgency":            urgency,
        "industry":           industry,
        "aspects": aspects or [],
    }

# ── Casos ─────────────────────────────────────────────────────────────────────

def caso1():
    """Período con datos mixtos — NPS y porcentajes correctos."""
    items = [
        _make_item("promotor",  aspects=[{"aspect": "atención al cliente", "sentiment": "positivo"}]),
        _make_item("promotor",  aspects=[{"aspect": "atención al cliente", "sentiment": "positivo"}]),
        _make_item("promotor",  aspects=[{"aspect": "precio", "sentiment": "negativo"}]),
        _make_item("pasivo",    aspects=[{"aspect": "precio", "sentiment": "negativo"}]),
        _make_item("pasivo",    aspects=[{"aspect": "atención al cliente", "sentiment": "neutro"}]),
        _make_item("detractor", aspects=[{"aspect": "precio", "sentiment": "negativo"}], churn="alto", urgency=True),
        _make_item("detractor", aspects=[{"aspect": "precio", "sentiment": "negativo"}], churn="alto"),
        _make_item("promotor"),
        _make_item("pasivo"),
        _make_item("detractor", urgency=True),
    ]
    _mock_data[("org1", "2026-04")] = items
    r = get_period_metrics("org1", "2026-04")

    assert r["total_analyzed"]  == 10,  f"total={r['total_analyzed']}"
    assert r["promoters"]       == 4,   f"promotores={r['promoters']}"
    assert r["detractors"]      == 3,   f"detractores={r['detractors']}"
    assert r["nps_score"]       == 10,  f"nps={r['nps_score']}"   # (4-3)/10*100 = 10
    assert r["urgent_count"]    == 2,   f"urgentes={r['urgent_count']}"
    assert r["high_churn_count"] == 2,  f"churn_alto={r['high_churn_count']}"
    assert any(a["aspect"] == "precio" for a in r["top_aspects"])
    return True


def caso2():
    """Período sin datos — devuelve total_analyzed=0 y nps_score=None."""
    _mock_data[("org1", "2025-01")] = []
    r = get_period_metrics("org1", "2025-01")

    assert r["total_analyzed"] == 0,   f"total={r['total_analyzed']}"
    assert r["nps_score"]      is None, f"nps={r['nps_score']}"
    assert "error" in r
    return True


def caso3():
    """Comparación de períodos — nps_change y aspects_comparison correctos."""
    items_a = [
        _make_item("promotor",  aspects=[{"aspect": "atención al cliente", "sentiment": "negativo"}]),
        _make_item("promotor",  aspects=[{"aspect": "atención al cliente", "sentiment": "negativo"}]),
        _make_item("detractor", aspects=[{"aspect": "atención al cliente", "sentiment": "negativo"}]),
        _make_item("detractor", aspects=[{"aspect": "precio",              "sentiment": "negativo"}]),
    ]
    items_b = [
        _make_item("promotor",  aspects=[{"aspect": "atención al cliente", "sentiment": "positivo"}]),
        _make_item("promotor",  aspects=[{"aspect": "atención al cliente", "sentiment": "positivo"}]),
        _make_item("promotor",  aspects=[{"aspect": "precio",              "sentiment": "negativo"}]),
        _make_item("detractor", aspects=[{"aspect": "precio",              "sentiment": "negativo"}]),
    ]
    _mock_data[("org2", "2026-03")] = items_a
    _mock_data[("org2", "2026-04")] = items_b

    r = compare_periods("org2", "2026-03", "2026-04")

    # NPS_A = (2-2)/4*100 = 0, NPS_B = (3-1)/4*100 = 50 → change = +50
    assert r["nps_change"]    == 50,   f"nps_change={r['nps_change']}"
    assert r["nps_direction"] == "up", f"nps_dir={r['nps_direction']}"
    # Atención al cliente mejoró (de 100% neg a 0% neg)
    ac = next(a for a in r["aspects_comparison"] if a["aspect"] == "atención al cliente")
    assert ac["direction"] == "improved", f"ac direction={ac['direction']}"
    return True


def caso4():
    """Tendencia de 3 períodos — ordenados ascendentemente, vacíos con nps_score=None."""
    _mock_data[("org3", "2026-02")] = [_make_item("promotor"), _make_item("detractor")]
    _mock_data[("org3", "2026-03")] = []
    _mock_data[("org3", "2026-04")] = [_make_item("promotor"), _make_item("promotor")]

    r = get_trend("org3", ["2026-04", "2026-02", "2026-03"])  # desordenados a propósito

    assert len(r) == 3
    assert r[0]["period"] == "2026-02"
    assert r[1]["period"] == "2026-03"
    assert r[2]["period"] == "2026-04"
    assert r[1]["nps_score"] is None   # período vacío
    assert r[2]["nps_score"] == 100    # 2 promotores, 0 detractores
    return True

# ── Runner ────────────────────────────────────────────────────────────────────

def run():
    casos = [
        ("Caso 1: Período con datos mixtos — NPS y porcentajes", caso1),
        ("Caso 2: Período sin datos — total=0 y nps_score=None",  caso2),
        ("Caso 3: Comparación de períodos — nps_change y aspectos", caso3),
        ("Caso 4: Tendencia 3 períodos — orden y vacíos",          caso4),
    ]

    ok = 0
    print("=" * 60)
    print("SENTIO — TEST aggregator.py (4 CASOS)")
    print("=" * 60)

    for nombre, fn in casos:
        try:
            fn()
            print(f"  [OK]  {nombre}")
            ok += 1
        except Exception as e:
            print(f"  [FAIL] {nombre}")
            print(f"         {e}")

    print()
    print(f"RESULTADO: {ok}/{len(casos)} tests pasando")
    if ok == len(casos):
        print("Todos los tests pasaron.")
    print("=" * 60)
    return ok, len(casos)

if __name__ == "__main__":
    run()
