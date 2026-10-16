import fs from "node:fs";
import path from "node:path";

/** Carga .env.local sin dependencias extra. */
export function cargarEnv(archivo = ".env.local") {
  const ruta = path.resolve(process.cwd(), archivo);
  if (!fs.existsSync(ruta)) {
    console.error(`No encontré ${archivo}. Copiá .env.example y llenalo.`);
    process.exit(1);
  }
  for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
    const m = linea.match(/^\s*([\w.]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    let valor = (m[2] ?? "").trim();
    if (/^".*"$/s.test(valor) || /^'.*'$/s.test(valor)) valor = valor.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = valor;
  }
}
