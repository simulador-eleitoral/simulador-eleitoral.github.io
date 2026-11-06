// Testes do motor de cálculo. Rodar com:  node --test tests/teste_calculo.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quocienteEleitoral, distribuirCadeiras, selecionarChapa, compararCandidatos, simularCargo,
} from '../docs/js/calculo.js';

const ag = (id, legenda, votos) => ({
  id, legenda, candidatos: votos.map((v, i) => ({ id: `${id}${i}`, nome: `${id}${i}`, votos: v })),
});
const cadeiras = (res) => Object.fromEntries(res.ags.map((a) => [a.id, a.eleitos.length]));

test('arredondamento do quociente eleitoral (art. 106)', () => {
  assert.equal(quocienteEleitoral(10, 4), 2);   // 2,5  -> despreza (igual a meio)
  assert.equal(quocienteEleitoral(11, 4), 3);   // 2,75 -> arredonda para cima
  assert.equal(quocienteEleitoral(9, 4), 2);    // 2,25 -> despreza
  assert.equal(quocienteEleitoral(10050, 5), 2010);
});

test('cenário A: sem agremiação apta no 80/20, sobra vai para a maior média geral', () => {
  const r = distribuirCadeiras(5, [
    ag('A', 100, [3000, 2000, 900, 100]),
    ag('B', 0, [2500, 400]),
    ag('C', 0, [700, 300]),
    ag('D', 0, [50]),
  ]);
  assert.equal(r.qe, 2010);
  assert.deepEqual(cadeiras(r), { A: 4, B: 1, C: 0, D: 0 });
  assert.equal(r.eventos.at(-1).fase, 'SOBRA_TODOS');
});

test('cenário B: partido abaixo de 80% do QE ganha cadeira na 3ª fase (decisão do STF)', () => {
  const r = distribuirCadeiras(5, [
    ag('A', 100, [3000, 2000, 900, 100]),
    ag('B', 0, [2500, 400]),
    ag('C', 0, [1500, 100]),
    ag('D', 0, [50]),
  ]);
  assert.equal(r.qe, 2130);
  assert.deepEqual(cadeiras(r), { A: 3, B: 1, C: 1, D: 0 });
  assert.deepEqual(r.eventos.map((e) => e.fase), ['QP', 'QP', 'QP', 'SOBRA_80_20', 'SOBRA_TODOS']);
});

test('piso de 10% do QE impede eleição pelo QP, mas não na 3ª fase', () => {
  const r = distribuirCadeiras(2, [ag('A', 1800, [150, 10]), ag('B', 0, [40])]);
  assert.equal(r.qe, 1000);
  assert.equal(r.ags[0].qp, 1);
  assert.deepEqual(cadeiras(r), { A: 2, B: 0 });
  assert.equal(r.ags[0].eleitos[1].fase, 'SOBRA_TODOS');
});

test('empate entre candidatos: o mais idoso vence (art. 110)', () => {
  const a = { votos: 100, nasc: 19800101 };
  const b = { votos: 100, nasc: 19700101 };
  assert.ok(compararCandidatos(b, a) < 0);
});

test('corte da chapa: elimina os menos votados até vagas + 1', () => {
  const cands = [50, 40, 30, 20, 10].map((v, i) => ({ id: i, votos: v, genero: i >= 3 ? 'F' : 'M' }));
  const s = selecionarChapa(cands, 3, false);
  assert.deepEqual(s.mantidos.map((c) => c.votos), [50, 40, 30]);
  const g = selecionarChapa(cands, 3, true); // cota: ao menos 1 mulher em 3
  assert.deepEqual(g.mantidos.map((c) => c.votos), [50, 40, 20]);
});

test('simularCargo: federação nova soma votos e corta chapa; votos cortados viram legenda', () => {
  const cargo = {
    vagas: 2,
    partidos: { X: { legenda: 10 }, Y: { legenda: 0 } },
    candidatos: [
      { id: 1, partido: 'X', votos: 500 }, { id: 2, partido: 'X', votos: 100 },
      { id: 3, partido: 'Y', votos: 300 }, { id: 4, partido: 'Y', votos: 50 },
    ],
  };
  const r = simularCargo(cargo, () => 'FED', { votosCortados: 'legenda' });
  assert.equal(r.limite, 3);
  assert.equal(r.cortes.length, 1);
  assert.equal(r.cortes[0].cand.id, 4);
  assert.equal(r.validos, 960); // nenhum voto perdido
  const d = simularCargo(cargo, () => 'FED', { votosCortados: 'descartar' });
  assert.equal(d.validos, 910);
});
