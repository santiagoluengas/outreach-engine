import { google, sheets_v4 } from "googleapis";
import { GOOGLE, SHEET_ID } from "./config";

let _sheets: sheets_v4.Sheets | null = null;

function client(): sheets_v4.Sheets {
  if (_sheets) return _sheets;
  const auth = new google.auth.JWT({
    email: GOOGLE.serviceAccountEmail,
    key: GOOGLE.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _sheets = google.sheets({ version: "v4", auth });
  return _sheets;
}

/** Índice 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function col(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

/** Devuelve las filas de datos (sin encabezado) junto con su número de fila real. */
export async function leerFilas(
  pestana: string
): Promise<{ valores: string[]; fila: number }[]> {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${pestana}!A:ZZ`,
  });
  const filas = res.data.values ?? [];
  return filas.slice(1).map((valores, i) => ({
    valores: (valores ?? []).map((v) => (v == null ? "" : String(v))),
    fila: i + 2,
  }));
}

export async function agregarFilas(pestana: string, filas: string[][]): Promise<void> {
  if (filas.length === 0) return;
  await client().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${pestana}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: filas },
  });
}

/** Reescribe una fila completa. */
export async function escribirFila(
  pestana: string,
  fila: number,
  valores: string[]
): Promise<void> {
  await client().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${pestana}!A${fila}:${col(valores.length - 1)}${fila}`,
    valueInputOption: "RAW",
    requestBody: { values: [valores] },
  });
}

/** Actualiza celdas sueltas en un solo round-trip. */
export async function escribirCeldas(
  updates: { pestana: string; fila: number; columna: number; valor: string }[]
): Promise<void> {
  if (updates.length === 0) return;
  await client().spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: updates.map((u) => ({
        range: `${u.pestana}!${col(u.columna)}${u.fila}`,
        values: [[u.valor]],
      })),
    },
  });
}
