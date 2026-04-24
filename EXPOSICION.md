# TruthLens — Guía de Estudio para la Exposición

Este documento tiene todo lo que necesitás saber para exponer TruthLens con confianza.
Está pensado para que lo pegues en Claude Web y puedas estudiar conversando.

---

## QUÉ ES EL PROYECTO (el pitch de 30 segundos)

TruthLens es una aplicación web en la nube que analiza noticias y estima su credibilidad.
El usuario pega el texto de una noticia o una URL, y el sistema devuelve:
- Un score del 1 al 100
- Un nivel: Creíble, Dudoso o Peligroso
- Las señales que encontró (fuentes, tono, conspiración, etc.)
- Una explicación en español generada por IA

**Por qué importa:** la desinformación es un problema real. Antes de compartir una noticia, TruthLens te da una segunda opinión basada en inteligencia artificial y verificación cruzada con otros medios.

**Restricción clave del proyecto:** usa SOLO servicios de AWS. Es un proyecto para AWS Cloud Clubs.

---

## ARQUITECTURA GENERAL

```
[Usuario]
    │ pega texto o URL
    ▼
[Frontend React] ── S3 + CloudFront (HTTPS)
    │ llama al API
    ▼
[API Gateway] ── recibe la solicitud
    │
    ▼
[Lambda Python] ── el cerebro del sistema
    │
    ├── [Comprehend]      → analiza el tono y detecta entidades
    ├── [Brave Search]    → busca el titular en internet
    ├── [Rekognition]     → analiza imágenes si las hay
    ├── [Bedrock/Haiku]   → lee todo y decide el score final
    └── [DynamoDB]        → guarda el historial
```

**Flujo en palabras simples:**
1. Usuario manda texto → Lambda lo recibe
2. Lambda lo analiza con 4 herramientas en paralelo
3. Claude Haiku lee TODO y decide el score
4. El resultado se guarda en DynamoDB y se muestra al usuario

---

## LOS SERVICIOS — QUÉ HACE CADA UNO

### ⭐ Amazon Bedrock (Claude Haiku 4.5) — EL SERVICIO ESTRELLA
**Qué hace:** lee la noticia completa (hasta 1500 palabras) y decide el score final.

**Por qué es el estrella:** es el único que ENTIENDE el contenido. Los demás detectan patrones. Haiku razona. Puede detectar que "neurofluxina" es una sustancia inventada, que "lo que no quieren que sepas" es una frase de manipulación, o que el titular contradice lo que reportan otros medios.

**Cómo funciona técnicamente:** recibe un prompt con el texto + todas las señales pre-calculadas + resultados de búsqueda web + validación de medios. Devuelve JSON con score, nivel y explicación.

**Costo:** ~$0.002 por análisis (fracciones de centavo)

---

### Amazon Comprehend
**Qué hace:** analiza el texto y detecta dos cosas:
- El tono emocional: ¿es negativo, positivo, neutro o mixto?
- Las entidades: personas, organizaciones y lugares mencionados

**Por qué no alcanza solo:** detecta que el texto es "muy negativo", pero no sabe si eso es porque es una noticia triste real o porque es alarmismo fabricado. Por eso necesita a Bedrock.

**Fallback:** si Comprehend falla, el código tiene listas de palabras negativas/positivas en Python que lo reemplazan.

---

### Amazon Rekognition
**Qué hace:** analiza las imágenes de la noticia (si las hay). Detecta:
- Contenido inapropiado o manipulado
- Texto dentro de imágenes (memes, capturas editadas)

**Cómo llegan las imágenes:** el scraper extrae las URLs de imágenes del artículo, Lambda las descarga (hasta 5MB cada una) y las manda a Rekognition en bytes.

---

### AWS Lambda
**Qué hace:** ejecuta todo el código del backend. Es el "cerebro ejecutor".

**Qué es Lambda en simple:** es una función de código que solo existe cuando la llaman. No hay un servidor corriendo todo el tiempo esperando. Llega una solicitud → se activa → procesa → se apaga. AWS cobra solo por el tiempo que corrió.

**Configuración:** Python 3.12, 45 segundos de timeout, 256MB de memoria.

**Por qué 45 segundos:** Bedrock puede tardar hasta 25 segundos, Comprehend ~5 segundos, el scraping hasta 10 segundos. 45 da margen suficiente.

---

### Amazon API Gateway
**Qué hace:** es la "puerta de entrada" al backend. Recibe las solicitudes HTTP del frontend y las pasa a Lambda.

**Endpoints:**
- `POST /analyze` → analiza una noticia
- `GET /history` → devuelve el historial

**Por qué existe si Lambda podría recibir directamente:** API Gateway maneja CORS, autenticación, rate limiting, y da una URL HTTP limpia al mundo. Lambda sola no tiene URL pública.

---

### Amazon DynamoDB
**Qué hace:** guarda el historial de análisis. Cada análisis queda guardado con su score, nivel, señales y explicación.

**Qué es DynamoDB en simple:** una base de datos NoSQL. No tiene tablas con filas y columnas fijas como MySQL. Guarda documentos JSON flexibles. Es perfecta para serverless porque escala sola y cobra por uso, no por capacidad reservada.

**Estructura del dato guardado:**
```json
{
  "id": "uuid-unico",
  "timestamp": "2026-04-23T15:30:00Z",
  "input": "primeros 500 chars de la noticia",
  "score": 12,
  "level": "peligroso",
  "explanation": "El contenido combina...",
  "signals": "[{...señales...}]"
}
```

---

### Amazon S3
**Qué hace:** guarda los archivos del frontend (HTML, JavaScript, CSS). Cuando alguien abre la app, el browser descarga esos archivos de S3.

**Por qué S3 y no un servidor web:** S3 sirve archivos estáticos sin necesidad de un servidor. Es prácticamente gratis para proyectos pequeños y escala automáticamente.

---

### Amazon CloudFront
**Qué hace:** distribuye el frontend globalmente con HTTPS. Es una CDN (Content Delivery Network).

**En simple:** CloudFront tiene "puntos de presencia" en todo el mundo. Cuando alguien abre la app desde Bolivia, CloudFront le sirve los archivos desde el servidor más cercano, no desde us-east-1. Más rápido y con HTTPS automático.

**URL de producción:** `https://dbqzapx3jb9ey.cloudfront.net`

---

### AWS SSM Parameter Store
**Qué hace:** guarda la API key de Brave Search de forma segura (cifrada). Lambda la lee en tiempo de ejecución.

**Por qué no hardcodearla en el código:** si la key está en el código y subís a GitHub, queda expuesta para siempre. SSM la mantiene separada y cifrada.

---

## SERVICIOS IMPLÍCITOS (los que trabajan sin que los configures)

| Servicio | Qué hace en TruthLens |
|---|---|
| **AWS CloudFormation** | Motor real detrás de SAM. Crea todos los recursos cuando hacés deploy |
| **AWS IAM** | Crea el rol de la Lambda con permisos exactos (mínimo privilegio) |
| **Amazon CloudWatch Logs** | Guarda automáticamente todos los logs de la Lambda |
| **AWS KMS** | Cifra la API key en SSM Parameter Store |
| **AWS STS** | Emite credenciales temporales para que Lambda llame a los otros servicios |

---

## SERVICIO EXTERNO

### Brave Search API
**Qué hace:** busca en internet el titular de la noticia. Devuelve hasta 5 resultados de otros medios.

**Por qué no es AWS:** no existe un servicio de búsqueda web general en AWS.

**Cómo se integra:** si Brave no responde en 3 segundos, el análisis continúa sin resultados web. No rompe el sistema.

**Cómo evalúa las diferencias:**
- Sin diferencia → suma puntos a favor
- Diferencia menor (<15% en cifras) → penaliza moderado, recomienda verificar
- Diferencia crítica (>30% o contradicción directa) → penaliza fuerte y explica la contradicción

---

## EL ANÁLISIS EN DETALLE — QUÉ DETECTA

### Señales que calcula Python antes de llamar a Bedrock

| Señal | Cómo | Penalización |
|---|---|---|
| Tono alarmista | Comprehend detecta NEGATIVE con alta confianza | -25 pts |
| Solo fuentes anónimas | Regex detecta "científicos anónimos", "fuentes secretas" | -35 pts |
| Sin fuentes | No hay patrones de citación | -20 pts |
| Sensacionalismo | Lista de palabras + mayúsculas + exclamaciones | -20 pts |
| Lenguaje conspirativo | 16 patrones regex específicos | -35 pts |
| Medio no verificado | Dominio no está en lista de 30+ medios confiables | -5 pts |
| Mención sospechosa | Medio serio mencionado + frase conspirativa | -15 pts |
| Imágenes inapropiadas | Rekognition con confianza mínima 70% | -15 pts |

### Patrones conspirativos que detecta
- "lo que no quieren que sepas"
- "antes de que borren esto"
- "llevan años ocultando"
- "comparte antes de que lo censuren"
- "nuevo orden mundial", "deep state", "plandemia"
- "químtrails", "5G + virus/cáncer", "microchips + vacuna"
- Y 10 más...

### Tipos de noticia
- **Salud/ciencia:** penaliza FUERTE las afirmaciones médicas sin fuente (sustancias inventadas, curas milagrosas)
- **Política/economía:** no penaliza la falta de links directos (es normal en ese tipo de periodismo)
- **General:** criterios estándar

### Medios verificados en la lista
**Bolivia:** El Deber, La Razón, Opinión, Los Tiempos, Erbol, ABI, Unitel, Página Siete, y más.
**Internacionales:** CNN, BBC, Reuters, AP, AFP, El País, Infobae, New York Times, The Guardian.
**Fact-checkers:** Snopes, Chequeado, Maldita.es.

---

## EL PROMPT DE BEDROCK — CÓMO LE HABLAMOS A HAIKU

Le mandamos todo esto en un solo mensaje:

```
Eres un detector experto en desinformación.

TEXTO A ANALIZAR:
[hasta 1500 palabras de la noticia]

TIPO: salud/ciencia/tecnología
⚠️ Las afirmaciones médicas sin fuente son señal GRAVE.

SEÑALES PRE-DETECTADAS:
- Sentimiento: NEGATIVE
- Fuentes verificables: 0
- Fuentes anónimas: 2
- Palabras sensacionalistas: urgente, impactante
- Patrones conspirativos: 3
- Alertas críticas: Fuentes citadas, Lenguaje conspirativo

RESULTADOS DE BÚSQUEDA WEB:
1. [Título del resultado] url.com
   Descripción del resultado...
[evaluación de discrepancias]

VALIDACIÓN DE MEDIOS:
- URL de origen verificada: No aplica (texto directo)
- Medios mencionados: ninguno
- Patrón sospechoso: No

ANALIZA ESPECÍFICAMENTE:
1. ¿Hay términos científicos inventados?
2. ¿Las fuentes son anónimas?
3. ¿Hay lenguaje conspirativo?
...

GUÍA DE SCORE:
- 75-100: creíble
- 45-74: dudoso
- 20-44: baja credibilidad
- 1-19: desinformación clara

Responde SOLO con JSON:
{"score": X, "level": "...", "explanation": "..."}
```

---

## EL FRONTEND

Hecho con **React + Vite + Tailwind CSS v4**.

**Tres pantallas:**
1. **Formulario** (NewsForm.jsx) → donde el usuario pega el texto o URL
2. **Progreso** (AnalysisProgress.jsx) → muestra los pasos del análisis en tiempo real
3. **Resultado** (ScoreDisplay.jsx) → score, nivel, señales y explicación

**Validaciones del formulario:**
- Mínimo 20 caracteres
- Si es URL, debe tener formato válido (http:// o https://)
- Muestra errores solo después de que el usuario interactuó con el campo

**Historial:** los últimos 5 análisis se muestran en la app (en memoria, se pierden al recargar).

---

## INFRAESTRUCTURA COMO CÓDIGO — template.yaml

Todo el proyecto se define en un archivo YAML llamado `template.yaml`. Este archivo le dice a AWS qué crear:
- La función Lambda (con su código, timeout, memoria, permisos)
- La tabla DynamoDB (con su estructura)
- El API Gateway (con sus endpoints y CORS)
- Los permisos IAM de la Lambda

**Ventaja:** si el proyecto se borra, con un solo comando (`sam deploy`) vuelve a existir exactamente igual. La infraestructura está versionada junto al código.

---

## CÓMO SE DEPLOYA

### SAM (Serverless Application Model)
Es una herramienta de AWS que simplifica el deploy de aplicaciones serverless.

```bash
sam build    # empaqueta el código Python + dependencias
sam deploy   # sube todo a AWS y crea/actualiza los recursos
```

Por detrás, SAM convierte el template.yaml en CloudFormation, sube el código Lambda a S3, y CloudFormation crea todos los recursos.

### Frontend
```bash
npm run build                                          # compila React → HTML/JS/CSS estático
aws s3 sync dist/ s3://truthlens-frontend-dev --delete # sube a S3
```

CloudFront sirve esos archivos globalmente con HTTPS.

---

## URLs EN PRODUCCIÓN

| Componente | URL |
|---|---|
| **App (usar esta)** | https://dbqzapx3jb9ey.cloudfront.net |
| API Gateway | https://c973n26u42.execute-api.us-east-1.amazonaws.com/dev |
| Endpoint análisis | POST /analyze |
| Endpoint historial | GET /history |

---

## COSTOS

| Servicio | Por análisis |
|---|---|
| Bedrock (Haiku) | ~$0.002 |
| Comprehend | ~$0.0001 |
| Rekognition | ~$0.001 |
| Lambda + API Gateway + DynamoDB | ~$0.000005 |
| **Total** | **~$0.003** |

Menos de medio centavo por análisis. S3 y CloudFront son prácticamente gratuitos para este volumen.

---

## PREGUNTAS FRECUENTES EN EXPOSICIONES

**¿Por qué AWS y no Google Cloud o Azure?**
Es un proyecto para AWS Cloud Clubs. La restricción de usar solo AWS fue intencional para aprender los servicios nativos de AWS y aprovechar el ecosistema integrado.

**¿Por qué serverless y no un servidor tradicional?**
Tres razones: costo (pagás solo cuando se usa), escalabilidad automática (si vienen 1000 usuarios a la vez, Lambda escala solo), y simplicidad de mantenimiento (no hay servidor que mantener ni actualizar).

**¿Por qué DynamoDB y no MySQL o PostgreSQL?**
DynamoDB es perfecta para serverless: escala automáticamente, cobra por uso, y no necesita una conexión persistente. MySQL requeriría un servidor de base de datos corriendo 24/7.

**¿Cómo sabe el sistema si una noticia es falsa?**
No lo sabe con certeza absoluta. Detecta señales que se asocian con desinformación: lenguaje alarmista, fuentes anónimas, patrones conspirativos, inconsistencias con lo que reportan otros medios. El disclaimer del sistema lo deja claro.

**¿Puede equivocarse?**
Sí. Un medio verificado puede publicar información incorrecta. Una noticia real puede tener un titular sensacionalista. El sistema estima probabilidades, no certezas. Por eso la explicación siempre recomienda verificar.

**¿Qué pasa si Bedrock falla?**
El sistema tiene fallback en cada servicio. Si Bedrock falla, usa el score calculado por Python + una explicación generada con plantillas de texto. Nunca se cae completamente.

**¿Por qué Brave Search y no Google?**
Google no tiene una API de búsqueda web accesible y gratuita para proyectos. Brave Search ofrece 2000 búsquedas/mes gratis con una API limpia.

**¿Cuánto cuesta el proyecto al mes?**
Con uso moderado (500-1000 análisis/mes): menos de $5 al mes. S3 y CloudFront son prácticamente gratuitos. El mayor costo es Bedrock.

**¿Se puede escalar?**
Sí, automáticamente. Lambda puede correr miles de instancias en paralelo. DynamoDB escala sin configuración. API Gateway aguanta millones de solicitudes. Solo habría que revisar los límites de Bedrock y Comprehend.

**¿Qué es un cold start?**
Cuando Lambda no ha sido llamada en un tiempo, AWS "apaga" el contenedor. La próxima vez que se llama, hay un delay extra de 1-3 segundos mientras se "enciende" de nuevo. Se nota como un primer análisis más lento.

**¿Por qué se eligió Claude Haiku y no GPT-4?**
OpenAI no es AWS. La restricción del proyecto es usar solo servicios AWS. Bedrock es el servicio de AWS que da acceso a modelos de IA generativa, incluyendo Claude de Anthropic.

**¿Qué es IAM y por qué importa?**
IAM (Identity and Access Management) controla quién puede hacer qué en AWS. La Lambda de TruthLens solo tiene permiso para llamar a Comprehend, Bedrock, Rekognition y su propia tabla DynamoDB. Si alguien comprometiera la Lambda, no podría hacer nada más en la cuenta. Principio de mínimo privilegio.

---

## DEMO EN VIVO — GUIÓN

### Noticia falsa (debería dar score bajo)
```
¡URGENTE! Gobierno confirma que el agua del grifo causa pérdida de 
memoria en adultos mayores. Científicos anónimos revelaron hoy un 
estudio IMPACTANTE que el gobierno lleva años ocultando. Según fuentes 
secretas, el agua contiene una sustancia llamada "neurofluxina" que 
destruye las neuronas. ¡Esto es lo que NO quieren que sepas! 
¡Comparte antes de que borren esto!
```
**Esperado:** 5-20 / Peligroso

### Noticia neutra (debería dar score alto)
```
El Banco Central de Bolivia informó hoy que la inflación anual 
cerró en 3.2% durante el último trimestre, según datos oficiales 
publicados en su sitio web. El presidente del BCB, Marcelo Montenegro, 
declaró que las reservas internacionales se mantienen estables y que 
se proyecta un crecimiento del PIB del 2.8% para fin de año.
```
**Esperado:** 65-85 / Creíble o Dudoso

---

## CONCEPTOS CLAVE PARA EXPLICAR

### Serverless
No significa "sin servidor". Significa que vos no administrás el servidor. AWS lo maneja por vos. Solo escribís el código y AWS se encarga de correrlo, escalarlo y mantenerlo.

### Lambda
Una función que corre en respuesta a un evento (una solicitud HTTP, en este caso). No corre todo el tiempo — solo cuando la llaman. AWS cobra por milisegundos de ejecución.

### IaC (Infrastructure as Code)
En vez de crear los recursos de AWS a mano en la consola, los definís en un archivo de código (template.yaml). Ventaja: reproducible, versionable, auditable.

### CDN (Content Delivery Network)
Red de servidores distribuidos globalmente. CloudFront cachea el frontend en múltiples ubicaciones. Cuando alguien abre la app desde cualquier parte del mundo, recibe los archivos del servidor más cercano.

### NoSQL
Base de datos que no usa tablas relacionales con esquema fijo. DynamoDB guarda documentos JSON flexibles. No tiene JOIN entre tablas. Escala horizontalmente de forma simple.

### CORS
Cross-Origin Resource Sharing. Una restricción del browser que impide que una página web haga solicitudes a un dominio diferente. API Gateway está configurado para permitir solicitudes desde cualquier origen (`*`).

---

## ESTRUCTURA DE ARCHIVOS (para mostrar en la demo)

```
TruthLens-AWS/
│
├── template.yaml                     ← toda la infraestructura
│
├── backend/functions/analyze/
│   ├── handler.py                    ← entry point de Lambda
│   └── services/
│       ├── text_analyzer.py          ← Comprehend + detección Python
│       ├── score_engine.py           ← Bedrock (el más importante)
│       ├── image_analyzer.py         ← Rekognition
│       ├── scraper.py                ← extrae texto de URLs
│       ├── history.py                ← DynamoDB
│       ├── brave_search.py           ← búsqueda web
│       └── media_validator.py        ← validación de medios
│
└── frontend/src/
    ├── App.jsx
    ├── components/
    │   ├── NewsForm.jsx
    │   ├── AnalysisProgress.jsx
    │   └── ScoreDisplay.jsx
    └── services/api.js
```

---

## CÓMO USAR ESTE DOCUMENTO CON CLAUDE WEB

Pegá este documento completo en Claude Web y luego podés pedirle:

- "Explícame cómo funciona Bedrock en este proyecto"
- "¿Qué preguntas me podrían hacer sobre la arquitectura?"
- "Simula que sos el jurado y hazme preguntas difíciles"
- "Explícame la diferencia entre DynamoDB y MySQL en el contexto de TruthLens"
- "¿Cómo explicarías serverless a alguien que no sabe de tecnología?"
- "Dame un resumen de 2 minutos del proyecto para abrir la exposición"
- "¿Qué es lo más complejo del proyecto y cómo lo explico simple?"
