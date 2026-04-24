# TruthLens — Documentación Completa del Proyecto

> Aplicación serverless de análisis de credibilidad de noticias, desarrollada para AWS Cloud Clubs.
> Detecta señales de desinformación combinando NLP, IA generativa, visión por computadora y verificación web.

---

## Índice

1. [Descripción general](#descripción-general)
2. [Arquitectura](#arquitectura)
3. [Flujo de datos](#flujo-de-datos)
4. [Servicios AWS — Explícitos](#servicios-aws--explícitos)
5. [Servicios AWS — Implícitos](#servicios-aws--implícitos)
6. [Servicios externos](#servicios-externos)
7. [Stack tecnológico](#stack-tecnológico)
8. [Estructura de archivos](#estructura-de-archivos)
9. [Análisis en detalle](#análisis-en-detalle)
10. [Endpoints de la API](#endpoints-de-la-api)
11. [Variables de entorno](#variables-de-entorno)
12. [Costos estimados](#costos-estimados)
13. [URLs de producción](#urls-de-producción)
14. [Comandos de deploy](#comandos-de-deploy)

---

## Descripción general

TruthLens recibe una URL o texto de una noticia y devuelve:

- **Score de credibilidad** (1–100)
- **Nivel**: Creíble / Dudoso / Peligroso
- **Señales detectadas**: tono, fuentes, sensacionalismo, conspiración, medios, imágenes
- **Explicación en español** generada por IA

El sistema no determina la verdad absoluta — estima señales de desinformación mediante análisis multicapa.

---

## Arquitectura

```
Usuario
   │
   ▼
[CloudFront] ──HTTPS──► [S3 - Frontend React]
   │
   ▼ (llamada al API)
[API Gateway]
   │
   ▼
[Lambda — Python 3.12]
   │
   ├──► [Comprehend]         → Sentimiento + entidades
   ├──► [Brave Search API]   → Verificación web (titular)
   ├──► [Rekognition]        → Análisis de imágenes
   ├──► [Bedrock / Haiku]    → Score + explicación final
   └──► [DynamoDB]           → Guardar historial
```

---

## Flujo de datos

### Paso 1 — Entrada del usuario
El usuario pega texto o una URL en el frontend React. El frontend valida:
- Mínimo 20 caracteres
- Si es URL, formato válido

### Paso 2 — Obtener contenido
- **URL**: Lambda hace scraping con `urllib` + `html.parser` (stdlib Python). Extrae texto limpio (hasta 8.000 chars) e imágenes (hasta 10 URLs).
- **Texto directo**: se usa tal cual. Se extraen URLs de imágenes con regex.

### Paso 3 — Análisis de texto (Comprehend + Python)
`text_analyzer.py` ejecuta en paralelo:
- **Comprehend** → sentimiento (POSITIVE/NEGATIVE/NEUTRAL/MIXED) + entidades (personas, organizaciones, lugares)
- **Python regex** → fuentes verificables vs anónimas, sensacionalismo, lenguaje conspirativo

### Paso 4 — Búsqueda web (Brave Search)
`brave_search.py` extrae las primeras 12 palabras como titular y consulta Brave Search API. Devuelve hasta 5 resultados con título, URL y descripción. Timeout de 3 segundos — si falla, continúa sin romper el flujo.

### Paso 5 — Validación de medios
`media_validator.py` ejecuta dos verificaciones:
- Si la URL de origen pertenece a un medio de la lista confiable (bolivianos + internacionales)
- Si el texto menciona medios conocidos y si esa mención es legítima o sospechosa

### Paso 6 — Análisis de imágenes (Rekognition)
`image_analyzer.py` descarga cada imagen (hasta 5MB) y llama a Rekognition para detectar contenido inapropiado (`DetectModerationLabels`) y texto dentro de imágenes (`DetectText`).

### Paso 7 — Score y explicación (Bedrock)
`score_engine.py` calcula un score preliminar con Python, luego le manda a Claude Haiku:
- Texto completo (hasta 1.500 palabras)
- Tipo de noticia detectado (salud/ciencia, política/economía, general)
- Todas las señales pre-calculadas
- Resultados de Brave Search
- Validación de medios

Haiku devuelve JSON con `score`, `level` y `explanation`. Si falla, se usa el score Python + fallback de texto.

### Paso 8 — Guardar en DynamoDB
`history.py` guarda el análisis completo con UUID + timestamp UTC. El frontend muestra el historial de los últimos 10 análisis.

---

## Servicios AWS — Explícitos

### Amazon Bedrock (Claude Haiku 4.5)
- **Modelo**: `us.anthropic.claude-haiku-4-5-20251001-v1:0`
- **Rol**: Scorer y explicador primario. Recibe el texto completo + todas las señales y devuelve el score final.
- **Por qué es el servicio estrella**: Es el único que *razona* sobre el contenido en vez de solo detectar patrones.
- **Timeout configurado**: 25 segundos (read), 5 segundos (connect)
- **Max tokens de salida**: 600
- **Costo**: ~$0.80/1M tokens de entrada, ~$4.00/1M tokens de salida
- **Costo por análisis**: ~$0.002 (fracciones de centavo)

### Amazon Comprehend
- **Operaciones**: `DetectSentiment`, `DetectEntities`
- **Idioma**: español (`LanguageCode: "es"`)
- **Límite**: primeros 4.900 caracteres del texto
- **Rol**: Análisis lingüístico — tono emocional y entidades mencionadas
- **Fallback**: Si falla, Python usa listas de palabras locales (NEGATIVE_WORDS, POSITIVE_WORDS)
- **Costo**: ~$0.0001 por unidad de texto

### Amazon Rekognition
- **Operaciones**: `DetectModerationLabels` (confianza mínima 70%), `DetectText`
- **Rol**: Analiza imágenes extraídas del artículo. Detecta contenido inapropiado y texto dentro de imágenes.
- **Límite de imagen**: 5MB por imagen, hasta 5 imágenes por análisis
- **Descarga**: `urllib.request` con User-Agent personalizado, timeout 5s
- **Costo**: ~$0.001 por imagen

### AWS Lambda
- **Nombre**: `truthlens-analyze-dev`
- **Runtime**: Python 3.12
- **Handler**: `handler.lambda_handler`
- **Timeout**: 45 segundos (Bedrock ~25s + Comprehend ~5s + scraping ~10s + margen)
- **Memoria**: 256 MB
- **Dependencias**: solo `boto3==1.38.0` (el resto es stdlib Python)
- **Endpoints que maneja**: `POST /analyze`, `GET /history`

### Amazon API Gateway
- **Nombre**: `truthlens-api-dev`
- **Tipo**: REST API (AWS SAM `AWS::Serverless::Api`)
- **CORS**: habilitado para `*` (todos los orígenes)
- **Métodos**: POST, GET, OPTIONS
- **URL**: `https://c973n26u42.execute-api.us-east-1.amazonaws.com/dev`

### Amazon DynamoDB
- **Tabla**: `truthlens-analysis-dev`
- **Modo de facturación**: PAY_PER_REQUEST (sin capacidad fija)
- **Clave primaria**: `id` (UUID, HASH) + `timestamp` (ISO 8601 UTC, RANGE)
- **Campos almacenados**: id, timestamp, input, input_type, score, level, explanation, signals (JSON string)
- **Operaciones usadas**: `PutItem`, `Scan`
- **Costo**: centavos por millones de lecturas/escrituras

### Amazon S3
- **Bucket frontend**: `truthlens-frontend-dev`
- **Región**: us-east-1
- **Uso**: hosting del frontend estático (React compilado)
- **Configuración**: static website hosting, acceso público de lectura
- **Archivos**: `index.html`, `assets/index-*.js`, `assets/index-*.css`, `favicon.svg`
- **Bucket de SAM** (implícito): `aws-sam-cli-managed-default-samclisourcebucket-*` — SAM sube aquí el código Lambda durante el deploy

### Amazon CloudFront
- **Distribution ID**: `E1Y0OZK7ETW5B5`
- **Dominio**: `dbqzapx3jb9ey.cloudfront.net`
- **Origen**: S3 website endpoint (`http-only`)
- **Protocolo**: redirige HTTP → HTTPS automáticamente
- **Price Class**: PriceClass_100 (solo edge locations de Norteamérica y Europa — más barato)
- **Error handling**: errores 404 → `index.html` con código 200 (necesario para React SPA)
- **Cache policy**: `658327ea-f89d-4fab-a63d-7e88639e58f6` (CachingOptimized)

### AWS SSM Parameter Store
- **Parámetro**: `/truthlens/brave-api-key`
- **Tipo**: SecureString (cifrado con KMS)
- **Uso**: almacena la API key de Brave Search de forma segura, sin exponerla en código ni comandos
- **Costo**: gratis para parámetros estándar

---

## Servicios AWS — Implícitos

Estos servicios operan en segundo plano sin que los configures directamente:

### AWS CloudFormation
- **Rol**: Motor de infraestructura detrás de SAM. Cuando corrés `sam deploy`, SAM convierte el `template.yaml` en un stack de CloudFormation que crea/actualiza todos los recursos.
- **Stack**: `truthlens-dev`
- **Por qué importa**: CloudFormation es quien realmente crea la Lambda, la tabla DynamoDB, el API Gateway, etc. SAM es solo una capa de abstracción encima.

### AWS IAM (Identity and Access Management)
- **Rol de Lambda**: creado automáticamente por SAM con los permisos exactos definidos en `template.yaml`:
  - `comprehend:DetectSentiment`, `comprehend:DetectEntities`
  - `bedrock:InvokeModel`
  - `rekognition:DetectModerationLabels`, `rekognition:DetectText`
  - `dynamodb:PutItem`, `dynamodb:Query`, `dynamodb:Scan` (solo en la tabla del proyecto)
  - `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` (via `AWSLambdaBasicExecutionRole`)
- **Principio de mínimo privilegio**: la Lambda solo puede hacer exactamente lo que necesita.

### Amazon CloudWatch Logs
- **Log group**: `/aws/lambda/truthlens-analyze-dev`
- **Rol**: almacena automáticamente todos los `print()` de la Lambda. Cada análisis genera logs con:
  - Tokens consumidos por Bedrock
  - Tiempo de respuesta de Bedrock
  - Score pre-calculado por Python vs score final de Bedrock
  - Resultados de Brave Search
  - Errores de cualquier servicio
- **Retención**: indefinida por defecto (configurable)

### AWS KMS (Key Management Service)
- **Rol**: cifra el parámetro `/truthlens/brave-api-key` en SSM Parameter Store cuando se crea como `SecureString`. Completamente transparente.
- **Costo**: primeras 20.000 solicitudes de API gratuitas por mes

### AWS STS (Security Token Service)
- **Rol**: emite credenciales temporales cuando la Lambda asume su rol IAM para llamar a Comprehend, Bedrock, Rekognition y DynamoDB. Completamente automático e invisible.

---

## Servicios externos

### Brave Search API
- **URL base**: `https://api.search.brave.com/res/v1/web/search`
- **Autenticación**: header `X-Subscription-Token`
- **Parámetros**: `q` (query), `count=5`, `search_lang=es`
- **Timeout**: 3 segundos — si no responde, el análisis continúa sin resultados web
- **Rol**: busca el titular de la noticia en internet para detectar si otros medios lo reportan y si hay contradicciones
- **Plan gratuito**: 2.000 búsquedas/mes
- **Por qué no es AWS**: no existe un servicio de búsqueda web general en AWS. Amazon Kendra es para búsqueda interna de documentos propios.

---

## Stack tecnológico

### Backend
| Componente | Tecnología |
|---|---|
| Lenguaje | Python 3.12 |
| Framework de deploy | AWS SAM (Serverless Application Model) |
| IaC | AWS CloudFormation (via SAM) |
| Dependencias | `boto3==1.38.0` (solo una) |
| HTTP / Scraping | `urllib` (stdlib) |
| HTML parsing | `html.parser` (stdlib) |

### Frontend
| Componente | Tecnología |
|---|---|
| Framework | React 18 |
| Build tool | Vite |
| CSS | Tailwind CSS v4 (con plugin `@tailwindcss/vite`) |
| HTTP client | `fetch` nativo del browser |

---

## Estructura de archivos

```
TruthLens-AWS/
│
├── template.yaml                     # Infraestructura completa (SAM/CloudFormation)
│
├── backend/
│   └── functions/
│       └── analyze/
│           ├── handler.py            # Entry point Lambda — orquesta el análisis
│           ├── requirements.txt      # Solo boto3
│           └── services/
│               ├── text_analyzer.py  # Comprehend + detección de señales Python
│               ├── score_engine.py   # Bedrock — score final y explicación
│               ├── image_analyzer.py # Rekognition — análisis de imágenes
│               ├── scraper.py        # Extracción de texto/imágenes de URLs
│               ├── history.py        # DynamoDB — guardar y consultar historial
│               ├── brave_search.py   # Brave Search API — verificación web
│               └── media_validator.py# Validación de medios confiables
│
└── frontend/
    ├── src/
    │   ├── App.jsx                   # Componente raíz — estado global, historial
    │   ├── components/
    │   │   ├── NewsForm.jsx           # Formulario con validación
    │   │   ├── AnalysisProgress.jsx   # Indicador de pasos durante análisis
    │   │   └── ScoreDisplay.jsx       # Muestra score, señales y explicación
    │   └── services/
    │       └── api.js                # Cliente HTTP — llama al API Gateway
    ├── .env.local                    # URL del API local (SAM local)
    ├── .env.production               # URL del API en producción
    └── vite.config.js
```

---

## Análisis en detalle

### Señales que detecta el sistema

| Señal | Cómo se detecta | Penalización máx. |
|---|---|---|
| Tono alarmista | Comprehend `DetectSentiment` | -25 pts |
| Solo fuentes anónimas | Regex sobre patrones ("científicos anónimos") | -35 pts |
| Sin fuentes | Ausencia de patrones de citación | -20 pts |
| Sensacionalismo | Lista de palabras + caps ratio + exclamaciones | -20 pts |
| Lenguaje conspirativo | 16 patrones regex (2+ patrones detectados) | -35 pts |
| Medio no verificado | Lista de 30+ dominios confiables | -5 pts |
| Mención sospechosa | Medio serio + frase conspirativa en el texto | -15 pts |
| Imágenes inapropiadas | Rekognition MinConfidence 70% | -15 pts |

### Medios verificados

**Bolivia**: El Deber, La Razón, Opinión, Los Tiempos, Erbol, ABI, Red Uno, Unitel, El Día, Página Siete, Correo del Sur, EJU, Fides.

**Latinoamérica**: Infobae, Semana, Clarín, La Nación, El Tiempo, El Universal, Emol, La Tercera.

**Internacionales**: CNN, BBC, Reuters, AP, AFP, France 24, DW, El País, New York Times, The Guardian, Bloomberg.

**Fact-checkers**: Snopes, FactCheck.org, PolitiFact, Chequeado, Maldita.es, Colombia Check.

### Clasificación de tipo de noticia
- **salud/ciencia/tecnología** → penaliza fuerte afirmaciones médicas o científicas sin fuente nombrada
- **económica/política** → no penaliza la falta de links directos (es normal en ese tipo de periodismo)
- **general** → criterios estándar de verificación

### Evaluación de discrepancias con Brave Search

| Situación | Acción |
|---|---|
| Los resultados confirman la noticia | Suma puntos a favor |
| Diferencia menor (<15% en cifras) | Penaliza 8-12 pts, recomienda verificar |
| Diferencia crítica (>30% o contradicción directa) | Penaliza 20-25 pts, explica la contradicción y nombra los medios |
| Ningún medio reportó lo mismo | Señal de alerta moderada |

---

## Endpoints de la API

### POST /analyze
Analiza una noticia y devuelve el score de credibilidad.

**Request:**
```json
{ "input": "texto o URL de la noticia" }
```

**Response:**
```json
{
  "score": 12,
  "level": "peligroso",
  "explanation": "El contenido combina fuentes anónimas...",
  "input_type": "text",
  "id": "uuid-del-analisis",
  "signals": [
    { "id": "sentiment",  "label": "Tono del lenguaje",        "detail": "...", "status": "danger" },
    { "id": "sources",    "label": "Fuentes citadas",           "detail": "...", "status": "danger" },
    { "id": "entities",   "label": "Entidades identificadas",   "detail": "...", "status": "ok" },
    { "id": "clickbait",  "label": "Titular sensacionalista",   "detail": "...", "status": "danger" },
    { "id": "conspiracy", "label": "Lenguaje conspirativo",     "detail": "...", "status": "danger" },
    { "id": "media",      "label": "Validación de medios",      "detail": "...", "status": "warning" }
  ],
  "disclaimer": "TruthLens estima señales de desinformación..."
}
```

**Códigos de error**: 400 (input inválido), 422 (URL inaccesible o texto insuficiente)

### GET /history
Devuelve los últimos 10 análisis guardados, ordenados por fecha descendente.

---

## Variables de entorno

| Variable | Servicio | Valor en producción |
|---|---|---|
| `TABLE_NAME` | DynamoDB | `truthlens-analysis-dev` |
| `BRAVE_API_KEY` | Brave Search | Guardado en SSM Parameter Store |
| `STAGE` | General | `dev` |

---

## Costos estimados

| Servicio | Costo por análisis | Costo por 1.000 análisis |
|---|---|---|
| Bedrock (Haiku) | ~$0.002 | ~$2.00 |
| Comprehend | ~$0.0001 | ~$0.10 |
| Rekognition | ~$0.001 (si hay imágenes) | ~$1.00 |
| Lambda | ~$0.000002 | ~$0.002 |
| API Gateway | ~$0.0000035 | ~$0.0035 |
| DynamoDB | ~$0.0000013 | ~$0.0013 |
| Brave Search | Gratis (hasta 2.000/mes) | Gratis |

**Total estimado por análisis: ~$0.003** (menos de medio centavo)

S3 y CloudFront tienen costo prácticamente cero para el volumen de un proyecto académico.

---

## URLs de producción

| Componente | URL |
|---|---|
| Frontend (HTTPS) | `https://dbqzapx3jb9ey.cloudfront.net` |
| API base | `https://c973n26u42.execute-api.us-east-1.amazonaws.com/dev` |
| Endpoint análisis | `POST /analyze` |
| Endpoint historial | `GET /history` |

---

## Comandos de deploy

### Primera vez
```bash
sam build
sam deploy --guided
```

### Actualizaciones de código (deploy normal)
```bash
sam build
sam deploy
```

### Actualizar solo el frontend
```bash
cd frontend
npm run build
aws s3 sync dist/ s3://truthlens-frontend-dev --delete
```

### Ver logs en tiempo real
```bash
sam logs -n truthlens-analyze-dev --tail
```

### Probar la API localmente
```bash
sam local start-api --skip-pull-image
```
