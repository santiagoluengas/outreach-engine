/** Obtiene el refresh token de Gmail para tu cuenta.
 *  Requiere GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en .env.local, y que
 *  http://localhost:53682 esté como URI de redirección autorizada en Google Cloud.
 *  Uso: npm run gmail-auth */
import http from "node:http";
import { google } from "googleapis";
import { cargarEnv } from "./env.mjs";

cargarEnv();

const REDIRECT = "http://localhost:53682";
const oauth2 = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  REDIRECT
);

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
});

console.log("\nAbrí esta URL en el navegador y autorizá con la cuenta que envía:\n");
console.log(url + "\n");

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, REDIRECT).searchParams.get("code");
  if (!code) { res.end("Sin code."); return; }
  try {
    const { tokens } = await oauth2.getToken(code);
    res.end("Listo. Volvé a la terminal.");
    console.log("\nGMAIL_REFRESH_TOKEN=" + tokens.refresh_token + "\n");
    console.log("Pegá esa línea en .env.local (y en las variables de entorno de Vercel).");
  } catch (e) {
    res.end("Error: " + e.message);
    console.error(e);
  }
  server.close();
});
server.listen(53682, () => console.log("Esperando la redirección en", REDIRECT, "...\n"));
