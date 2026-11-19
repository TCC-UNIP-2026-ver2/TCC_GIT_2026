// teste-fronteira.mjs — testa a função calculateDistanceScore (lib/scoring.ts)
// nos pontos de transição da Equação 3.3 (0, 99, 100, 101, 999, 1000 e 1001 m).
// Uso (Node 22+), na raiz do projeto:
//   node --experimental-strip-types teste-fronteira.mjs
import { calculateDistanceScore } from "./lib/scoring.ts";

const DMAX_KM = 1.0;            // raio da interface (1.000 m)
const TOL = 1e-4;
// Valores esperados calculados diretamente da Equação 3.3:
// 50 se d <= 100 m; senão 50 * (Dmax - d) / (Dmax - 0,1), limitado a 0.
const esperado = (m) => (m <= 100 ? 50 : Math.max(0, (1 - m / 1000) / 0.9) * 50);

const casos = [["T01", 0], ["T02", 99], ["T03", 100], ["T04", 101], ["T05", 999], ["T06", 1000], ["T07", 1001]];
let falhas = 0;
console.log("ID | dist (m) | esperado | obtido | status");
for (const [id, m] of casos) {
  const esp = esperado(m);
  const obt = calculateDistanceScore(m / 1000, DMAX_KM);
  const ok = Math.abs(esp - obt) < TOL;
  if (!ok) falhas++;
  console.log(`${id} | ${m} | ${esp.toFixed(4)} | ${obt.toFixed(4)} | ${ok ? "aprovado" : "reprovado"}`);
}
console.log(falhas === 0 ? "\nTodos os casos aprovados." : `\n${falhas} caso(s) reprovado(s).`);
process.exit(falhas === 0 ? 0 : 1);
