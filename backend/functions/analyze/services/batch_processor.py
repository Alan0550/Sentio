"""
Procesador de batch — Sentio
Orquesta el análisis de múltiples filas de feedback y calcula el resumen ejecutivo.
"""

import time

from services.score_engine  import analyze_feedback
from services.history       import save_analysis, save_batch_summary


def process_batch(rows: list, org_id: str, batch_id: str) -> dict:
    """
    Procesa una lista de filas de CSV.
    Llama a Comprehend + Bedrock por cada fila, guarda en DynamoDB.
    Nunca aborta — errores individuales se loguean y cuentan como failed.
    """
    total    = len(rows)
    results  = []
    failed   = 0

    # Acumuladores para el resumen
    promoters  = 0
    passives   = 0
    detractors = 0
    high_churn = 0
    urgent     = 0
    aspect_map = {}
    emotion_map = {
        "satisfacción":      0,
        "frustración":       0,
        "enojo":             0,
        "indiferencia":      0,
        "decepción":         0,
        "sorpresa_positiva": 0,
    }
    industry_map = {"telco": 0, "retail": 0, "general": 0}

    print(f"[batch] Iniciando batch_id={batch_id} org={org_id} total={total}")

    for i, row in enumerate(rows):
        feedback    = row.get("feedback", "").strip()
        customer_id = row.get("customer_id", f"AUTO-{i+1}")
        canal       = row.get("canal", "csv_upload")
        row_org     = row.get("org_id") or org_id
        row_number  = row.get("row_number", i + 1)

        print(f"[batch] {i+1}/{total} — customer_id={customer_id}")

        try:
            result = analyze_feedback(feedback)

            result["source"]      = canal
            result["customer_id"] = customer_id
            result["org_id"]      = row_org
            result["input"]       = feedback[:300]
            result["batch_id"]    = batch_id
            result["row_number"]  = row_number

            analysis_id  = save_analysis(feedback, result)
            result["id"] = analysis_id

            # Acumular métricas
            nps = result.get("nps_classification", "pasivo")
            if nps == "promotor":    promoters  += 1
            elif nps == "detractor": detractors += 1
            else:                    passives   += 1

            if result.get("churn_risk") == "alto": high_churn += 1
            if result.get("urgency"):              urgent     += 1

            emotion = result.get("dominant_emotion", "")
            if emotion in emotion_map:
                emotion_map[emotion] += 1

            ind = result.get("industry", "general")
            industry_map[ind] = industry_map.get(ind, 0) + 1

            for aspect in result.get("aspects", []):
                name = aspect.get("aspect", "")
                if not name:
                    continue
                if name not in aspect_map:
                    aspect_map[name] = {"aspect": name, "total_mentions": 0, "negative": 0, "positive": 0}
                aspect_map[name]["total_mentions"] += 1
                if aspect.get("sentiment") == "negativo":
                    aspect_map[name]["negative"] += 1
                elif aspect.get("sentiment") == "positivo":
                    aspect_map[name]["positive"] += 1

            results.append(result)

        except Exception as e:
            print(f"[batch] ERROR en fila {row_number} customer={customer_id}: {e}")
            results.append({
                "row_number":  row_number,
                "customer_id": customer_id,
                "error":       str(e),
            })
            failed += 1

        if i < total - 1:
            time.sleep(0.3)

    processed = total - failed
    nps_score = 0
    if processed > 0:
        nps_score = round(((promoters - detractors) / processed) * 100)

    # Top 10 aspectos por menciones
    top_aspects = sorted(aspect_map.values(), key=lambda x: x["total_mentions"], reverse=True)[:10]
    for a in top_aspects:
        t = a["total_mentions"]
        a["negative_pct"] = round(a["negative"] / t * 100) if t else 0
        a["positive_pct"] = round(a["positive"] / t * 100) if t else 0

    promoters_pct  = round(promoters  / processed * 100, 1) if processed else 0
    passives_pct   = round(passives   / processed * 100, 1) if processed else 0
    detractors_pct = round(detractors / processed * 100, 1) if processed else 0

    summary = {
        "nps_score":        nps_score,
        "promoters":        promoters,
        "promoters_pct":    promoters_pct,
        "passives":         passives,
        "passives_pct":     passives_pct,
        "detractors":       detractors,
        "detractors_pct":   detractors_pct,
        "high_churn_count": high_churn,
        "urgent_count":     urgent,
        "top_aspects":      top_aspects,
        "dominant_emotions": emotion_map,
        "industry_breakdown": industry_map,
    }

    print(f"[batch] Completado — procesados={processed} fallidos={failed} nps={nps_score}")

    batch_result = {
        "batch_id":  batch_id,
        "org_id":    org_id,
        "total":     total,
        "processed": processed,
        "failed":    failed,
        "results":   results,
        "summary":   summary,
    }

    save_batch_summary(batch_id, org_id, batch_result)

    # Evaluar alertas — nunca falla el batch
    try:
        from datetime import datetime, timezone
        from services.aggregator    import get_period_metrics
        from services.alert_manager import evaluate_alerts

        cur_period  = datetime.now(timezone.utc).strftime("%Y-%m")
        prev_dt     = datetime.now(timezone.utc).replace(day=1)
        from datetime import timedelta
        prev_period = (prev_dt - timedelta(days=1)).strftime("%Y-%m")

        pm_cur  = get_period_metrics(org_id, cur_period)
        pm_prev = get_period_metrics(org_id, prev_period)

        current_metrics = {
            "nps_score":          pm_cur.get("nps_score"),
            "previous_nps_score": pm_prev.get("nps_score"),
            "urgent_count_today": pm_cur.get("urgent_count", 0),
            "high_churn_count":   pm_cur.get("high_churn_count", 0),
            "aspects":            pm_cur.get("top_aspects", []),
        }
        triggered = evaluate_alerts(org_id, cur_period, current_metrics)
        if triggered:
            print(f"[batch] {len(triggered)} alertas disparadas")
    except Exception as e:
        print(f"[batch] Error evaluando alertas: {e}")

    return batch_result
