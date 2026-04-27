"""
Procesador de CSV — Sentio
Lee, valida y normaliza archivos CSV de feedback de clientes.
Solo usa stdlib de Python (csv, io). Sin dependencias externas.
"""

import csv
import io
from datetime import datetime, timezone


MAX_ROWS    = 5000
MIN_CHARS   = 10
MAX_CHARS   = 5000


def parse_csv(file_content: bytes) -> dict:
    """
    Parsea un CSV de feedback. Intenta UTF-8, UTF-8-BOM y Latin-1.
    Autodetecta separador coma o punto y coma.
    Retorna dict con success, rows, total_rows, errors.
    """
    text = _decode(file_content)
    if text is None:
        return _fail(["No se pudo decodificar el archivo. Usá UTF-8 o Latin-1."])

    sep      = _detect_separator(text)
    reader   = csv.DictReader(io.StringIO(text), delimiter=sep)

    # Normalizar headers a minúsculas para comparación case-insensitive
    try:
        raw_fields = reader.fieldnames or []
    except Exception:
        return _fail(["El archivo no tiene un formato CSV válido."])

    field_map = {f.strip().lower(): f for f in raw_fields}

    if "feedback" not in field_map:
        return _fail(["Columna 'feedback' no encontrada. Es obligatoria."])

    rows      = []
    skipped   = 0
    row_num   = 0
    today_iso = datetime.now(timezone.utc).date().isoformat()

    try:
        all_rows = list(reader)
    except Exception as e:
        return _fail([f"Error al leer el CSV: {e}"])

    if len(all_rows) > MAX_ROWS:
        return _fail([f"El archivo supera el límite de {MAX_ROWS} filas ({len(all_rows)} encontradas)."])

    for raw in all_rows:
        row_num += 1

        # Leer usando el nombre real de la columna (case-insensitive)
        feedback = _get(raw, field_map, "feedback", "").strip()

        if not feedback or len(feedback) < MIN_CHARS:
            skipped += 1
            continue

        if len(feedback) > MAX_CHARS:
            feedback = feedback[:MAX_CHARS]

        customer_id = _get(raw, field_map, "customer_id", "").strip() or f"AUTO-{row_num}"
        fecha       = _get(raw, field_map, "fecha", "").strip() or today_iso
        canal       = _get(raw, field_map, "canal", "").strip() or "csv_upload"
        org_id      = _get(raw, field_map, "org_id", "").strip() or None

        rows.append({
            "row_number":  row_num,
            "customer_id": customer_id,
            "feedback":    feedback,
            "fecha":       fecha,
            "canal":       canal,
            "org_id":      org_id,
        })

    return {
        "success":    True,
        "rows":       rows,
        "total_rows": len(rows),
        "skipped":    skipped,
        "errors":     [],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _decode(content: bytes) -> str | None:
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return content.decode(enc)
        except (UnicodeDecodeError, AttributeError):
            continue
    return None


def _detect_separator(text: str) -> str:
    first_line = text.split("\n")[0] if "\n" in text else text
    return ";" if first_line.count(";") > first_line.count(",") else ","


def _get(row: dict, field_map: dict, key: str, default: str) -> str:
    real_key = field_map.get(key)
    if real_key is None:
        return default
    return (row.get(real_key) or default)


def _fail(errors: list) -> dict:
    return {"success": False, "rows": [], "total_rows": 0, "skipped": 0, "errors": errors}
