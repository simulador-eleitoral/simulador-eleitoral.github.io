// Recalcula o resultado REAL (federações reais) com o motor do site e compara
// com os eleitos oficiais informados pelo TSE.
// Uso:  node scripts/conferir.mjs [pasta]      (padrão: docs/data/2026)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { simularCargo } from '../docs/js/calculo.js';
import { carregarCargo } from '../docs/js/dados.js';

const pasta = process.argv[2] || 'docs/data/2026';
if (!existsSync(join(pasta, 'index.json'))) {
  console.log(`Sem dados em ${pasta}. Rode antes: python scripts/preparar_dados.py`);
  process.exit(0);
}
const indice = JSON.parse(readFileSync(join(pasta, 'index.json'), 'utf8'));
const fedDe = {};
for (const f of indice.federacoes) for (const p of f.partidos) fedDe[p] = f.id;
const grupo = (sg) => fedDe[sg] || `P:${sg}`;

let total = 0, iguais = 0, divergentes = [];
for (const { uf } of indice.ufs) {
  const dados = JSON.parse(readFileSync(join(pasta, `${uf}.json`), 'utf8'));
  for (const [cod, bruto] of Object.entries(dados.cargos)) {
    const cargo = carregarCargo(bruto);
    const oficiais = new Set(cargo.candidatos.filter((c) => c.eleitoOficial).map((c) => c.id));
    if (!oficiais.size) continue;
    const r = simularCargo(cargo, grupo, {});
    const calc = new Set(r.eleitos.map((e) => e.cand.id));
    total++;
    const falta = [...oficiais].filter((x) => !calc.has(x));
    if (!falta.length && calc.size === oficiais.size) iguais++;
    else divergentes.push(`${uf} ${bruto.cargo}: ${falta.length} eleito(s) oficial(is) não reproduzido(s)`);
  }
}
console.log(`Conferência: ${iguais} de ${total} disputas reproduzidas exatamente.`);
for (const d of divergentes) console.log('  - ' + d);
process.exit(divergentes.length ? 1 : 0);
