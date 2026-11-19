// teste-overpass-erro.mjs — caso V12: resposta da Overpass com erro de execução.
//
// Verifica que uma resposta HTTP 200 com "remark" de erro de execução
//   (1) NÃO é tratada como lista válida de POIs (a API não devolve nota 0 como se fosse válida) e
//   (2) NÃO fica armazenada em cache (depois que o servidor "volta ao normal", a mesma
//       consulta vem como X-Cache: MISS e com a nota correta, e não como HIT).
//
// Como executar (app e este script na mesma máquina, sem Docker):
//   1) Em um terminal:  OVERPASS_SERVERS=http://localhost:8089/api/interpreter npm run dev
//      (PowerShell: $env:OVERPASS_SERVERS="http://localhost:8089/api/interpreter"; npm run dev)
//   2) Em outro terminal: node teste-overpass-erro.mjs
// Duração: cerca de 20 s (a API tenta 3 rodadas, com esperas de 3 s e 6 s, antes de responder 502).
// Gera: teste-overpass-erro.csv
//
// Variáveis opcionais: BASE (padrão http://localhost:3000), MOCK_PORT (padrão 8089).

import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 8089);

// Ponto de teste (um ponto qualquer; o servidor simulado devolve POIs fictícios em volta dele).
const LAT = -21.7946, LON = -48.1756;

let modo = "erro";          // "erro" -> HTTP 200 com remark de erro | "ok" -> resposta válida
let chamadasAoMock = 0;

const mock = createServer((req, res) => {
  req.resume();
  chamadasAoMock++;
  res.setHeader("Content-Type", "application/json");
  if (modo === "erro") {
    res.end(JSON.stringify({
      version: 0.6, generator: "Overpass API (simulado)",
      elements: [],
      remark: 'runtime error: Query timed out in "query" at line 4 after 61 seconds.',
    }));
  } else {
    // Uma farmácia a ~56 m do ponto: saúde = 1/6*50 + 50 = 58,3333; nota final = 58,3333 * 0,206 = 12,0167
    res.end(JSON.stringify({
      version: 0.6, generator: "Overpass API (simulado)",
      elements: [{ type: "node", id: 1, lat: LAT + 0.0005, lon: LON, tags: { amenity: "pharmacy", name: "Farmácia (simulada)" } }],
    }));
  }
});
await new Promise((r) => mock.listen(MOCK_PORT, r));

async function chamar() {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/score?lat=${LAT}&lon=${LON}&radius=1000`);
  const ms = Math.round(performance.now() - t0);
  let body = null; try { body = await res.json(); } catch {}
  return { status: res.status, xcache: res.headers.get("x-cache"), ms, body };
}

const linhas = [["etapa", "esperado", "obtido", "resultado"]];
const reg = (etapa, esperado, obtido, ok) => {
  console.log(`${ok ? "OK    " : "FALHOU"} ${etapa} | esperado: ${esperado} | obtido: ${obtido}`);
  linhas.push([etapa, esperado, obtido, ok ? "aprovado" : "reprovado"]);
};

try {
  // Etapa 1: servidor simulado devolve HTTP 200 + remark de erro de execução.
  modo = "erro";
  const a = await chamar();
  reg("1a consulta (remark de erro)", "HTTP 502 (nenhuma nota válida)", `HTTP ${a.status}`, a.status === 502);
  reg("1a consulta não devolve nota", "sem overallScore", a.body?.overallScore === undefined ? "sem overallScore" : `overallScore=${a.body.overallScore}`, a.body?.overallScore === undefined);
  reg("Servidor simulado foi consultado", "pelo menos 1 chamada", `${chamadasAoMock} chamada(s)`, chamadasAoMock >= 1);

  // Etapa 2: o servidor volta ao normal. Se o erro tivesse ido para o cache, viria HIT (ou nota 0).
  modo = "ok";
  const b = await chamar();
  reg("2a consulta (servidor normalizado) não veio do cache", "X-Cache: MISS", `X-Cache: ${b.xcache}`, b.xcache === "MISS");
  const nota = b.body?.overallScore;
  reg("2a consulta tem a nota calculada", "12,0167", nota === undefined ? "sem nota" : nota.toFixed(4), nota !== undefined && Math.abs(nota - 12.01667) < 1e-3);

  // Etapa 3: agora o resultado válido deve ficar em cache.
  const c = await chamar();
  reg("3a consulta (resultado válido) vem do cache", "X-Cache: HIT", `X-Cache: ${c.xcache}`, c.xcache === "HIT");
} finally {
  writeFileSync("teste-overpass-erro.csv", linhas.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"));
  console.log("\nGerado: teste-overpass-erro.csv");
  mock.close();
}
