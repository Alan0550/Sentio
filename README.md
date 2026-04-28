# Sentio

**Plataforma de análisis de voz del cliente con IA para empresas de retail, telco y banca en Latinoamérica.**

Sentio convierte el feedback de tus clientes en decisiones. Sin leer un solo comentario manualmente.

## Qué hace

- Analiza feedback de clientes en volumen (CSV) o individualmente
- Infiere el NPS automáticamente sin encuestas numéricas
- Detecta aspectos específicos con su sentimiento (precio, atención, entrega, etc.)
- Identifica riesgo de churn y casos urgentes que requieren atención inmediata
- Muestra la evolución del NPS en el tiempo y compara períodos
- Gestiona urgentes con estados, responsable y notas internas
- Historial por cliente: evolución del NPS a lo largo del tiempo
- Alertas configurables: Sentio avisa cuando algo importante sucede
- Benchmark interno: NPS actual vs propio historial
- Genera reportes PDF ejecutivos mensuales

## Stack técnico

**Backend — AWS serverless:**
- AWS Lambda (Python 3.12) — lógica de análisis
- Amazon Bedrock (Claude Haiku 4.5) — IA generativa para análisis de feedback
- Amazon DynamoDB — persistencia de análisis y configuraciones
- Amazon API Gateway — endpoints HTTP
- AWS SAM — infraestructura como código

**Frontend:**
- React 18 + Vite
- Tailwind CSS v4
- S3 + CloudFront — hosting y distribución global

## Arquitectura

```
Usuario → CloudFront → S3 (React)
               ↓
          API Gateway
               ↓
          AWS Lambda
          ├── score_engine.py     (Bedrock)
          ├── batch_processor.py
          ├── aggregator.py
          ├── urgent_manager.py
          ├── customer_manager.py
          ├── benchmark.py
          └── alert_manager.py
               ↓
          DynamoDB
```

## Endpoints

| Método | Path | Descripción |
|--------|------|-------------|
| POST | /analyze | Analizar un feedback individual |
| GET | /history | Historial de análisis |
| POST | /upload/csv | Carga masiva de CSV |
| GET | /batch/{id} | Estado de un batch |
| GET | /dashboard | Métricas por período |
| GET | /dashboard/compare | Comparar dos períodos |
| GET | /home | Resumen ejecutivo |
| GET | /urgents | Listar urgentes |
| GET | /urgents/metrics | Métricas de resolución |
| PATCH | /urgents/{id} | Actualizar estado de urgente |
| GET | /customers | Listar clientes |
| GET | /customers/{id} | Historial de un cliente |
| GET | /customers/{id}/summary | Resumen rápido de cliente |
| GET | /benchmark | Benchmark histórico |
| GET | /alerts | Alertas disparadas |
| POST | /alerts/config | Crear configuración de alerta |
| DELETE | /alerts/config/{id} | Eliminar configuración |
| PATCH | /alerts/{id}/read | Marcar alerta como leída |

## Despliegue

**Backend:**
```bash
sam build
sam deploy --guided
```

**Frontend:**
```bash
cd frontend
npm install
npm run build
aws s3 sync dist/ s3://TU-BUCKET --delete
aws cloudfront create-invalidation --distribution-id TU-ID --paths "/*"
```

## Desarrollo local

```bash
# Backend
cd backend/functions/analyze
python local_server.py   # servidor local sin SAM ni Docker

# Frontend
cd frontend
echo "VITE_API_URL=http://localhost:8787" > .env.local
npm run dev
```

## CSV de demo

El archivo `demo/sentio-demo-data.csv` contiene 50 feedbacks reales con:
- Mix de telco y retail
- Urgentes con señales claras
- Clientes con historial de múltiples interacciones
- Distribución realista de NPS (~+10 a +15)

Subir este CSV desde la sección "Carga CSV" para ver la plataforma completa en acción.
