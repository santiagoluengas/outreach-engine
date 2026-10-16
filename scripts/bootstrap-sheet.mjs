/** Crea las pestañas, encabezados y plantillas de ejemplo en el Google Sheet.
 *  Uso: npm run bootstrap */
import { google } from "googleapis";
import { cargarEnv } from "./env.mjs";

cargarEnv();

const SHEET_ID = process.env.SHEET_ID;
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const ESQUEMA = {
  Leads: ["id","nombre","empresa","cargo","email","telefono","industria","contexto","fuente","estado","paso_actual","opt_in_whatsapp","ultimo_envio_at","creado_at","notas"],
  Cola: ["id","lead_id","canal","paso","estado","asunto","cuerpo","programado_at","enviado_at","mensaje_id","hilo_id","error"],
  Eventos: ["ts","lead_id","tipo","canal","detalle"],
  Plantillas: ["paso","canal","delay_dias","asunto","cuerpo","wa_template","wa_idioma","activa"],
};

// paso, canal, delay_dias, asunto, cuerpo, wa_template, wa_idioma, activa
const PLANTILLAS_EJEMPLO = [
  ["1","whatsapp","0",
   "Hola {{primer_nombre}}, soy Santiago Luengas. Vi que en {{empresa}} {{contexto}} y trabajo automatizando procesos comerciales con IA en {{industria}}. ¿Te sirve que te cuente en 15 min? Si no te interesa respondeme BAJA y no te escribo más.",
   "{{primer_nombre}}|{{empresa}}|{{contexto}}|{{industria}}",
   "presentacion_agencia_ia","es","si"],
  ["2","email","2",
   "{{empresa}}: lo que te comentaba por WhatsApp",
   "Hola {{primer_nombre}},\n\nTe escribí por WhatsApp hace un par de días. Te dejo el detalle por acá.\n\nVi que en {{empresa}} {{contexto}}. Automatizo procesos comerciales con IA para empresas de {{industria}}, y normalmente ahí hay entre 5 y 10 horas semanales que se pueden recuperar.\n\n¿Te sirve una llamada de 15 minutos esta semana?\n\nSantiago",
   "","","si"],
  ["3","whatsapp","4",
   "{{primer_nombre}}, te dejo un caso concreto: en una empresa de {{industria}} pasamos un proceso manual de 8 horas semanales a 20 minutos de revisión. ¿Lo vemos?",
   "{{primer_nombre}}|{{industria}}",
   "seguimiento_caso_exito","es","si"],
  ["4","email","7",
   "Cierro el tema, {{primer_nombre}}",
   "Hola {{primer_nombre}},\n\nNo quiero seguir insistiendo. Cierro por acá y quedo atento si más adelante quieren revisarlo.\n\nGracias por el tiempo,\nSantiago",
   "","","si"],
];

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
const existentes = new Set(meta.data.sheets.map((s) => s.properties.title));

const aCrear = Object.keys(ESQUEMA).filter((t) => !existentes.has(t));
if (aCrear.length) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: aCrear.map((title) => ({ addSheet: { properties: { title } } })) },
  });
  console.log("Pestañas creadas:", aCrear.join(", "));
}

for (const [pestana, encabezados] of Object.entries(ESQUEMA)) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${pestana}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [encabezados] },
  });
}
console.log("Encabezados escritos.");

const plantillas = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID, range: "Plantillas!A2:A",
});
if (!(plantillas.data.values ?? []).length) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Plantillas!A:A",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: PLANTILLAS_EJEMPLO },
  });
  console.log("Plantillas de ejemplo cargadas (editalas antes de enviar nada).");
}

console.log(`Listo: https://docs.google.com/spreadsheets/d/${SHEET_ID}`);
