/*
 * Motor de cálculo das eleições proporcionais brasileiras (2026).
 *
 * Regras implementadas (Código Eleitoral, Lei 4.737/1965, com a redação da
 * Lei 14.211/2021, e decisão do STF nas ADIs 7228, 7263 e 7325):
 *
 *  - Votos válidos = votos nominais válidos + votos de legenda válidos
 *    (brancos e nulos NÃO entram – art. 5º da Lei 9.504/1997).
 *  - Quociente eleitoral (QE, art. 106): válidos ÷ vagas, desprezando a
 *    fração igual ou inferior a meio e arredondando para 1 se superior.
 *  - Quociente partidário (QP, art. 107): votos válidos da agremiação ÷ QE,
 *    desprezada a fração.
 *  - 1ª fase (art. 108): cada agremiação elege, em ordem de votação, até QP
 *    candidatos que tenham votos >= 10% do QE.
 *  - 2ª fase (art. 109, I e II, e §2º): sobras pelo método das maiores médias
 *    (votos ÷ (cadeiras obtidas + 1)) apenas entre agremiações com votos
 *    >= 80% do QE e que tenham candidato com votos >= 20% do QE.
 *  - 3ª fase (art. 109, III, conforme STF): esgotadas as agremiações que
 *    atendem ao 80/20, as cadeiras restantes vão às maiores médias entre
 *    TODAS as agremiações, sem exigência mínima. (O STF também afastou a
 *    regra do art. 111; o caso "nenhum partido atinge o QE" cai aqui.)
 *  - Empates: entre candidatos, o mais idoso (art. 110); entre médias, a
 *    agremiação com mais votos e, persistindo, a do candidato mais idoso.
 *
 * Federação partidária = uma única agremiação para todos esses cálculos
 * (art. 11-A da Lei 9.096/1995).
 *
 * Este arquivo não depende do navegador: é usado também pelos testes (Node).
 */

export const FASES = {
  QP: 'Quociente partidário',
  SOBRA_80_20: 'Sobras (80% / 20%)',
  SOBRA_TODOS: 'Sobras (todas as agremiações)',
};

/** Quociente eleitoral com o arredondamento do art. 106. */
export function quocienteEleitoral(validos, vagas) {
  if (!vagas || vagas <= 0) return 0;
  const q = Math.floor(validos / vagas);
  const resto = validos - q * vagas;
  return 2 * resto > vagas ? q + 1 : q;
}

/** Ordem de classificação dentro de uma lista: mais votos; empate -> mais idoso. */
export function compararCandidatos(a, b) {
  if (b.votos !== a.votos) return b.votos - a.votos;
  const na = a.nasc || 99999999;
  const nb = b.nasc || 99999999;
  if (na !== nb) return na - nb; // data menor (AAAAMMDD) = mais idoso
  return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt');
}

/**
 * Distribui as cadeiras de uma casa legislativa em uma UF.
 * @param {number} vagas
 * @param {Array<{id:string, legenda:number, candidatos:Array<{id, nome, votos, nasc?}>}>} agremiacoes
 */
export function distribuirCadeiras(vagas, agremiacoes) {
  const ags = agremiacoes.map((a) => {
    const cands = [...a.candidatos].sort(compararCandidatos);
    const nominais = cands.reduce((s, c) => s + c.votos, 0);
    return {
      id: a.id,
      legenda: a.legenda,
      nominais,
      votos: a.legenda + nominais,
      cands,
      prox: 0, // índice do próximo candidato ainda não eleito
      qp: 0,
      eleitos: [],
      porFase: { QP: 0, SOBRA_80_20: 0, SOBRA_TODOS: 0 },
    };
  });

  const validos = ags.reduce((s, a) => s + a.votos, 0);
  const qe = quocienteEleitoral(validos, vagas);
  const eventos = [];
  let restantes = vagas;

  const eleger = (ag, fase, media) => {
    const cand = ag.cands[ag.prox++];
    ag.eleitos.push({ cand, fase });
    ag.porFase[fase]++;
    restantes--;
    eventos.push({ ordem: vagas - restantes, fase, ag: ag.id, media, cand });
  };

  // 1ª fase – quociente partidário + votação nominal mínima de 10% do QE
  if (qe > 0) {
    for (const ag of ags) {
      ag.qp = Math.floor(ag.votos / qe);
      let n = 0;
      while (
        n < ag.qp &&
        restantes > 0 &&
        ag.prox < ag.cands.length &&
        ag.cands[ag.prox].votos * 10 >= qe
      ) {
        eleger(ag, 'QP', null);
        n++;
      }
    }
  }

  // Comparação de médias sem erro de ponto flutuante (multiplicação cruzada)
  const melhor = (lista) => {
    let best = lista[0];
    for (let i = 1; i < lista.length; i++) {
      const a = lista[i];
      const lhs = a.votos * (best.eleitos.length + 1);
      const rhs = best.votos * (a.eleitos.length + 1);
      if (lhs > rhs) best = a;
      else if (lhs === rhs) {
        if (a.votos > best.votos) best = a;
        else if (a.votos === best.votos) {
          if (compararCandidatos(a.cands[a.prox], best.cands[best.prox]) < 0) best = a;
        }
      }
    }
    return best;
  };
  const media = (ag) => ag.votos / (ag.eleitos.length + 1);

  // 2ª fase – sobras entre quem tem 80% do QE e candidato com 20% do QE
  while (restantes > 0) {
    const aptas = ags.filter(
      (ag) =>
        ag.votos * 10 >= qe * 8 &&
        ag.prox < ag.cands.length &&
        ag.cands[ag.prox].votos * 5 >= qe
    );
    if (!aptas.length) break;
    const ag = melhor(aptas);
    eleger(ag, 'SOBRA_80_20', media(ag));
  }

  // 3ª fase – sobras entre todas as agremiações (STF, ADIs 7228/7263/7325)
  while (restantes > 0) {
    const aptas = ags.filter((ag) => ag.votos > 0 && ag.prox < ag.cands.length);
    if (!aptas.length) break;
    const ag = melhor(aptas);
    eleger(ag, 'SOBRA_TODOS', media(ag));
  }

  return { vagas, validos, qe, ags, eventos, vagasNaoPreenchidas: restantes };
}

/**
 * Escolhe quem fica na chapa quando ela excede o limite legal
 * (100% das vagas + 1 – art. 10 da Lei 9.504/1997).
 * Critério pedido: eliminar os menos votados. Com `cotaGenero`, garante o
 * mínimo de 30% de cada sexo (art. 10, §3º); se não houver mulheres (ou
 * homens) suficientes, a chapa encolhe, como exigiria a lei.
 */
export function selecionarChapa(candidatos, limite, cotaGenero = false) {
  const ord = [...candidatos].sort(compararCandidatos);
  if (ord.length <= limite) return { mantidos: ord, cortados: [] };
  if (!cotaGenero) return { mantidos: ord.slice(0, limite), cortados: ord.slice(limite) };

  const F = ord.filter((c) => c.genero === 'F');
  const M = ord.filter((c) => c.genero !== 'F');
  for (let n = limite; n > 0; n--) {
    const min = Math.ceil(0.3 * n - 1e-9);
    if (F.length >= min && M.length >= min) {
      const escolhidos = new Set([...F.slice(0, min), ...M.slice(0, min)]);
      for (const c of ord) {
        if (escolhidos.size >= n) break;
        escolhidos.add(c);
      }
      return {
        mantidos: ord.filter((c) => escolhidos.has(c)),
        cortados: ord.filter((c) => !escolhidos.has(c)),
      };
    }
  }
  return { mantidos: ord.slice(0, limite), cortados: ord.slice(limite) };
}

/**
 * Monta as agremiações (partidos isolados ou federações) de um cargo numa UF.
 * @param {object} cargo  dados do cargo: {vagas, partidos:{SG:{legenda}}, candidatos:[...]}
 * @param {(sg:string)=>string} grupoDoPartido  devolve o id da agremiação de um partido
 * @param {{votosCortados?:'legenda'|'descartar', cotaGenero?:boolean}} opcoes
 */
export function montarAgremiacoes(cargo, grupoDoPartido, opcoes = {}) {
  const limite = cargo.vagas + 1;
  const grupos = new Map();
  const g = (id) => {
    if (!grupos.has(id)) grupos.set(id, { id, partidos: new Set(), legenda: 0, candidatos: [], votosCortados: 0 });
    return grupos.get(id);
  };
  for (const [sg, p] of Object.entries(cargo.partidos)) {
    const gr = g(grupoDoPartido(sg));
    gr.partidos.add(sg);
    gr.legenda += p.legenda || 0;
  }
  for (const c of cargo.candidatos) {
    const gr = g(grupoDoPartido(c.partido));
    gr.partidos.add(c.partido);
    gr.candidatos.push(c);
  }
  const cortes = [];
  for (const gr of grupos.values()) {
    if (gr.candidatos.length > limite) {
      const { mantidos, cortados } = selecionarChapa(gr.candidatos, limite, opcoes.cotaGenero);
      gr.candidatos = mantidos;
      const soma = cortados.reduce((s, c) => s + c.votos, 0);
      gr.votosCortados = soma;
      if (opcoes.votosCortados !== 'descartar') gr.legenda += soma;
      for (const c of cortados) cortes.push({ cand: c, ag: gr.id });
    }
    gr.partidos = [...gr.partidos].sort();
  }
  return { agremiacoes: [...grupos.values()], cortes, limite };
}

/** Atalho: monta as chapas e distribui as cadeiras de um cargo. */
export function simularCargo(cargo, grupoDoPartido, opcoes = {}) {
  const { agremiacoes, cortes, limite } = montarAgremiacoes(cargo, grupoDoPartido, opcoes);
  const res = distribuirCadeiras(cargo.vagas, agremiacoes);
  const info = new Map(agremiacoes.map((a) => [a.id, a]));
  for (const ag of res.ags) {
    ag.partidos = info.get(ag.id).partidos;
    ag.votosCortados = info.get(ag.id).votosCortados;
  }
  res.cortes = cortes;
  res.limite = limite;
  res.eleitos = res.ags.flatMap((ag) => ag.eleitos.map((e) => ({ ...e, ag: ag.id })));
  return res;
}
