"""
Tests de integracion -- Sentio analisis de feedback.
Llama directamente a analyze_text() y analyze_feedback() sin pasar por Lambda.

Ejecutar desde backend/functions/analyze/:
    python -m tests.test_prompt
o:
    cd backend/functions/analyze && python tests/test_prompt.py
"""

import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import sys
import os
import json

# Asegurar que el directorio raíz del módulo esté en el path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.text_analyzer import analyze_text
from services.score_engine  import analyze_feedback

# ── Casos de prueba ───────────────────────────────────────────────────────────

CASOS = [
    {
        "id": 1,
        "nombre": "Detractor telco con churn alto",
        "texto": (
            "Llevo 3 semanas sin internet y nadie me da solución. "
            "Llamé 5 veces al call center y cada vez me dicen algo diferente. "
            "Voy a cancelar el contrato esta semana y me paso a la competencia. "
            "Nunca más Tigo."
        ),
        "esperado": {
            "nps_classification": "detractor",
            "inferred_score_max": 3,
            "churn_risk": "alto",
            "urgency": True,
            "industry": "telco",
        },
    },
    {
        "id": 2,
        "nombre": "Promotor retail",
        "texto": (
            "Pedí un producto el lunes y llegó el martes. El empaque estaba perfecto "
            "y el producto exactamente como lo describían. Ya es la tercera vez que "
            "compro y siempre igual de rápido. Lo recomiendo sin dudarlo."
        ),
        "esperado": {
            "nps_classification": "promotor",
            "inferred_score_min": 9,
            "churn_risk": "bajo",
            "urgency": False,
            "industry": "retail",
        },
    },
    {
        "id": 3,
        "nombre": "Pasivo con aspecto negativo específico",
        "texto": (
            "El servicio en general está bien pero el precio subió mucho este mes "
            "sin aviso. La atención cuando llamé fue buena, me atendieron rápido. "
            "Pero si siguen subiendo los precios voy a evaluar otras opciones."
        ),
        "esperado": {
            "nps_classification": "pasivo",
            "inferred_score_min": 6,
            "inferred_score_max": 7,
            "churn_risk": "medio",
            "urgency": False,
        },
    },
    {
        "id": 4,
        "nombre": "Urgencia con señal legal",
        "texto": (
            "El producto que me enviaron estaba dañado y al abrirlo me corté la mano. "
            "Voy a hacer una denuncia formal al Ministerio de Defensa del Consumidor. "
            "Esto es inaceptable y peligroso."
        ),
        "esperado": {
            "nps_classification": "detractor",
            "urgency": True,
            "churn_risk": "alto",
        },
    },
    {
        "id": 5,
        "nombre": "Feedback muy corto pero válido",
        "texto": "Pésimo servicio.",
        "esperado": {
            "nps_classification": "detractor",
            "inferred_score_max": 4,
        },
    },
    {
        "id": 6,
        "nombre": "Promotor con emoción fuerte y entidad PERSON",
        "texto": (
            "No puedo creer lo bien que me atendieron hoy. Tenía un problema con mi "
            "factura y en 10 minutos ya estaba resuelto. El agente Juan fue "
            "increíblemente amable y profesional. Esto es lo que se llama "
            "servicio de calidad."
        ),
        "esperado": {
            "nps_classification": "promotor",
            "inferred_score_min": 9,
            "dominant_emotion": ["satisfacción", "sorpresa_positiva"],
        },
    },
]

REQUIRED_FIELDS = [
    "nps_classification",
    "inferred_score",
    "overall_sentiment",
    "sentiment_breakdown",
    "aspects",
    "dominant_emotion",
    "churn_risk",
    "urgency",
    "urgency_reason",
    "industry",
    "summary",
    "recommended_action",
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def _check_estructura(result: dict) -> list:
    """Retorna lista de campos faltantes."""
    return [f for f in REQUIRED_FIELDS if f not in result]


def _check_esperado(result: dict, esperado: dict) -> list:
    """Retorna lista de validaciones fallidas."""
    fallos = []

    if "nps_classification" in esperado:
        if result.get("nps_classification") != esperado["nps_classification"]:
            fallos.append(
                f"nps_classification: esperado={esperado['nps_classification']}, "
                f"obtenido={result.get('nps_classification')}"
            )

    if "inferred_score_max" in esperado:
        score = result.get("inferred_score", 999)
        if score > esperado["inferred_score_max"]:
            fallos.append(
                f"inferred_score: esperado <= {esperado['inferred_score_max']}, "
                f"obtenido={score}"
            )

    if "inferred_score_min" in esperado:
        score = result.get("inferred_score", 0)
        if score < esperado["inferred_score_min"]:
            fallos.append(
                f"inferred_score: esperado >= {esperado['inferred_score_min']}, "
                f"obtenido={score}"
            )

    if "churn_risk" in esperado:
        if result.get("churn_risk") != esperado["churn_risk"]:
            fallos.append(
                f"churn_risk: esperado={esperado['churn_risk']}, "
                f"obtenido={result.get('churn_risk')}"
            )

    if "urgency" in esperado:
        if bool(result.get("urgency")) != bool(esperado["urgency"]):
            fallos.append(
                f"urgency: esperado={esperado['urgency']}, "
                f"obtenido={result.get('urgency')}"
            )

    if "industry" in esperado:
        if result.get("industry") != esperado["industry"]:
            fallos.append(
                f"industry: esperado={esperado['industry']}, "
                f"obtenido={result.get('industry')}"
            )

    if "dominant_emotion" in esperado:
        allowed = esperado["dominant_emotion"]
        if isinstance(allowed, list):
            if result.get("dominant_emotion") not in allowed:
                fallos.append(
                    f"dominant_emotion: esperado uno de {allowed}, "
                    f"obtenido={result.get('dominant_emotion')}"
                )
        else:
            if result.get("dominant_emotion") != allowed:
                fallos.append(
                    f"dominant_emotion: esperado={allowed}, "
                    f"obtenido={result.get('dominant_emotion')}"
                )

    return fallos


def _imprimir_resultado(caso: dict, result: dict, campos_faltantes: list, fallos_semanticos: list):
    sep = "─" * 65
    print(f"\n{sep}")
    print(f"CASO {caso['id']}: {caso['nombre']}")
    print(sep)
    print(f"Texto: {caso['texto'][:80]}{'...' if len(caso['texto']) > 80 else ''}")
    print()
    print(f"  NPS:        {result.get('nps_classification', 'N/A')} "
          f"(score {result.get('inferred_score', 'N/A')}/10)")
    print(f"  Sentimiento:{result.get('overall_sentiment', 'N/A')}")
    print(f"  Emoción:    {result.get('dominant_emotion', 'N/A')}")
    print(f"  Churn:      {result.get('churn_risk', 'N/A')}")
    urgency_str = str(result.get('urgency', 'N/A'))
    urgency_reason = result.get('urgency_reason') or ''
    print(f"  Urgencia:   {urgency_str}  {urgency_reason}")
    print(f"  Industria:  {result.get('industry', 'N/A')}")

    aspects = result.get("aspects", [])
    if aspects:
        print(f"  Aspectos ({len(aspects)}):")
        for a in aspects:
            sentiment_icon = "+" if a.get("sentiment") == "positivo" else (
                "-" if a.get("sentiment") == "negativo" else "~")
            print(f"    [{sentiment_icon}] {a.get('aspect', '?')} "
                  f"(conf={a.get('confidence', '?')}) — \"{a.get('quote', '')[:60]}\"")
    else:
        print("  Aspectos:   (ninguno detectado)")

    print(f"  Resumen:    {result.get('summary', 'N/A')}")
    print(f"  Acción:     {result.get('recommended_action', 'N/A')}")

    breakdown = result.get("sentiment_breakdown", {})
    if breakdown:
        print(f"  Breakdown:  pos={breakdown.get('positive', 0)}% "
              f"neg={breakdown.get('negative', 0)}% "
              f"neu={breakdown.get('neutral', 0)}% "
              f"mix={breakdown.get('mixed', 0)}%")

    print()
    if campos_faltantes:
        print(f"  ⚠ CAMPOS FALTANTES: {', '.join(campos_faltantes)}")
    if fallos_semanticos:
        print(f"  ✗ VALIDACIONES FALLIDAS:")
        for f in fallos_semanticos:
            print(f"      - {f}")
    if not campos_faltantes and not fallos_semanticos:
        print("  ✓ Estructura correcta y valores esperados OK")


# ── Runner principal ──────────────────────────────────────────────────────────

def run_tests():
    print("=" * 65)
    print("SENTIO — TEST DE INTEGRACIÓN (6 CASOS)")
    print("Llamando a analyze_text() + analyze_feedback() directamente")
    print("=" * 65)

    estructura_ok = 0
    semantica_ok  = 0
    total         = len(CASOS)
    errores_criticos = []

    for caso in CASOS:
        print(f"\n[Caso {caso['id']}/{total}] Analizando...")
        try:
            comprehend_result = analyze_text(caso["texto"])
            result            = analyze_feedback(caso["texto"], comprehend_result)

            campos_faltantes  = _check_estructura(result)
            fallos_semanticos = _check_esperado(result, caso["esperado"])

            if not campos_faltantes:
                estructura_ok += 1
            if not campos_faltantes and not fallos_semanticos:
                semantica_ok += 1

            _imprimir_resultado(caso, result, campos_faltantes, fallos_semanticos)

        except Exception as e:
            errores_criticos.append(f"Caso {caso['id']}: {e}")
            print(f"\n  ✗ ERROR CRÍTICO en caso {caso['id']}: {e}")

    print("\n" + "=" * 65)
    print("RESUMEN FINAL")
    print("=" * 65)
    print(f"  Estructura correcta : {estructura_ok}/{total}")
    print(f"  Semántica correcta  : {semantica_ok}/{total}")

    if errores_criticos:
        print(f"\n  Errores críticos ({len(errores_criticos)}):")
        for e in errores_criticos:
            print(f"    - {e}")

    if estructura_ok == total and semantica_ok == total:
        print("\n  ✓ Todos los casos pasaron correctamente.")
    elif estructura_ok == total:
        print("\n  ~ Estructura OK en todos, pero algunos valores semánticos difieren.")
        print("    Revisar el prompt de Bedrock para mayor precisión.")
    else:
        print("\n  ✗ Hay problemas de estructura. Revisar score_engine.py.")

    print("=" * 65)
    return estructura_ok, semantica_ok, total


if __name__ == "__main__":
    run_tests()
