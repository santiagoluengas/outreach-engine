# Outreach Engine

Automatiza los primeros 4 mensajes a un lead, alternando correo y WhatsApp.
Los leads y el estado viven en un Google Sheet; el motor corre como cron en Vercel.

**Modo de operación (mixto):** el paso 1 lo aprobás vos en `/`; los pasos 2-4 salen
solos según la cadencia. Cualquier respuesta del lead detiene la secuencia.

---

## Cómo funciona

Cada ejecución del cron (`/api/cron`) hace tres cosas, en orden:

1. **Detecta respuestas.** Revisa los hilos de Gmail de correos ya enviados y el webhook
   de WhatsApp. Si el lead contestó, pasa a `respondio` y se cancela lo pendiente.
2. **Planifica.** Para cada lead vivo crea el borrador del siguiente paso según la
   pestaña `Plantillas` (canal y `delay_dias`). Un lead nunca tiene dos pendientes a la vez.
3. **Envía.** Manda lo que está `aprobado` y ya le llegó la hora, respetando ventana
   horaria, topes diarios y máximo por ejecución.

Es idempotente: correrlo dos veces seguidas no duplica mensajes.

### Reglas que frenan un envío

| Regla | Dónde se configura |
|---|---|
| Solo lun-vie, 8:00-18:00 Bogotá | `VENTANA` en `lib/config.ts` |
| Tope diario: 40 correos / 25 WhatsApp | `MAX_EMAIL_DIA`, `MAX_WA_DIA` |
| Máximo 6 envíos por ejecución (5 ticks/día ≈ 30 máx) | `MAX_POR_TICK` |
| Variables `{{...}}` sin resolver → no sale, queda en borrador con aviso | `lib/guards.ts` |
| Filtro de opt-in de WhatsApp (apagado por defecto) | `EXIGIR_OPT_IN_WA` |
| Lead que responde o pide baja → secuencia cancelada | `lib/scheduler.ts` |

Si un paso no aplica a un lead (sin opt-in de WhatsApp, sin correo válido), el motor
lo salta y sigue con el paso siguiente en vez de trabarse.

---

## El Google Sheet

`npm run bootstrap` crea las 4 pestañas con sus encabezados. **El orden de las columnas
es contrato**: si lo cambiás en el Sheet, hay que cambiarlo en `lib/repo.ts`.

- **Leads** — `id, nombre, empresa, cargo, email, telefono, industria, contexto, fuente, estado, paso_actual, opt_in_whatsapp, ultimo_envio_at, creado_at, notas`
  - `telefono`: E.164 sin `+` → `573001234567`
  - `contexto`: el gancho específico del lead. Es lo único que hace que el mensaje no parezca masivo — vale la pena llenarlo a mano.
  - `estado`: `nuevo` para arrancar. El motor lo mueve a `en_secuencia` → `respondio` / `terminado` / `opt_out`.
- **Cola** — los mensajes generados, con su estado (`borrador`, `aprobado`, `enviado`, `cancelado`, `error`).
- **Eventos** — bitácora append-only de todo lo que pasó.
- **Plantillas** — la cadencia. `paso, canal, delay_dias, asunto, cuerpo, wa_template, wa_idioma, activa`
  - `delay_dias` cuenta desde el envío del paso anterior.
  - Cadencia por defecto: **WhatsApp(0) → email(+2) → WhatsApp(+4) → email(+7)**. Dos toques de WhatsApp es el techo razonable: el segundo template a alguien que no contestó es donde aparecen los bloqueos.
  - Variables: `{{nombre}} {{primer_nombre}} {{empresa}} {{cargo}} {{industria}} {{contexto}}`
  - **Para WhatsApp:** `asunto` = la vista previa legible del template, y `cuerpo` = los
    parámetros del template de Meta separados por `|`, en orden: `{{primer_nombre}}|{{empresa}}`.

---

## Setup

### 1. Google Sheet + service account
Reusá la service account del dashboard IMC o creá una nueva en Google Cloud
(API de Sheets habilitada). Compartí el Sheet con el email de la service account
como **Editor**. Llená `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY`
en `.env.local` (copiá `.env.example`), y corré:

```bash
npm run bootstrap
```

### 2. Gmail
En Google Cloud, credenciales OAuth tipo **Aplicación de escritorio**, con
`http://localhost:53682` como URI de redirección. Habilitá la Gmail API. Poné
`GMAIL_CLIENT_ID` y `GMAIL_CLIENT_SECRET` en `.env.local` y corré:

```bash
npm run gmail-auth
```

Autorizá en el navegador y pegá el `GMAIL_REFRESH_TOKEN` que imprime.

### 3. WhatsApp Cloud API
1. Meta Business verificado + app de WhatsApp → tomá `WA_PHONE_NUMBER_ID` y un token
   permanente (`WA_TOKEN`) de una system user, no el token temporal de 24h.
2. Creá y hacé aprobar la plantilla de seguimiento (categoría MARKETING). El nombre
   aprobado va en la columna `wa_template`. Aprobación: de 1 a 24 horas.
3. Webhook: `https://TU-DOMINIO/api/webhooks/whatsapp`, con `WA_VERIFY_TOKEN` como
   verify token y el campo `messages` suscrito. Sin esto no se detectan las respuestas.

> **Calidad del número.** Meta exige opt-in por política, pero en la práctica la
> sanción llega por otro lado: te asigna un *quality rating* por número que baja cuando
> la gente te **bloquea o reporta**. En rojo te bajan el tier de envío; si persiste,
> restringen el número. Números nuevos arrancan en **250 conversaciones iniciadas por
> 24h** y suben a 1.000 / 10.000 según volumen y calidad.
>
> Por eso, con WhatsApp como canal de apertura:
> - Usá un **número dedicado**, nunca tu personal. Si lo restringen, no perdés tu WhatsApp.
> - **Calentá el volumen**: arrancá en 20-30/día (`MAX_WA_DIA=25`) y subí de a poco.
> - El template lleva **salida de baja explícita**. El motor detecta "baja", "stop" o
>   "no me escribás" y marca `opt_out` cancelando todo lo pendiente.
> - `EXIGIR_OPT_IN_WA=si` en `.env.local` vuelve al modo estricto (solo leads con
>   `opt_in_whatsapp = si`). Está en `no` para permitir apertura en frío.
> - Si tu mercado incluye Estados Unidos, verificá antes el estado actual de las
>   plantillas de marketing hacia números US: Meta ha tenido pausas ahí.

### 4. Local

```bash
npm run dev
```

`http://localhost:3002` es la bandeja de aprobación. Para disparar el motor a mano:

```bash
npm run tick -- --dry
```

`--dry` simula todo (planifica y calcula envíos) sin escribir ni mandar nada. Sacá
`--dry` para que corra de verdad.

### 5. Deploy en Vercel
Importá el repo, pegá todas las variables de `.env.example` en Environment Variables
(incluido un `CRON_SECRET` random) y deployá. `vercel.json` ya deja el cron cada 2 horas
de 8am a 4pm Bogotá, lun-vie.

> El plan Hobby de Vercel limita los crons a **1 ejecución diaria**. Si estás en Hobby,
> o pasás a Pro, o disparás `/api/cron` desde afuera (cron-job.org, GitHub Actions)
> mandando el header `Authorization: Bearer $CRON_SECRET`.

---

## Operación diaria

1. Pegás leads nuevos en la pestaña `Leads` con `estado = nuevo`.
2. En el próximo tick aparecen los borradores del paso 1 en la bandeja.
3. Los revisás, editás si hace falta, aprobás.
4. El resto de la secuencia corre sola hasta que el lead responde o se acaban los pasos.

## Qué falta (siguientes iteraciones)

- Personalización del paso 1 con LLM a partir de `contexto` (hoy es plantilla + variables).
- Detección de rebotes duros en Gmail para marcar el correo como inválido.
- Métricas: tasa de respuesta por paso, por plantilla y por industria.
