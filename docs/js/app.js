import { simularCargo, FASES } from './calculo.js';
import { carregarCargo } from './dados.js';

// ------------------------------------------------------------------ utilidades
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n ?? 0).toLocaleString('pt-BR');
const pct = (a, b, casas = 2) => (b ? `${((100 * a) / b).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%` : '–');
const delta = (d) => (d > 0 ? `<span class="mais">+${d}</span>` : d < 0 ? `<span class="menos">−${-d}</span>` : '<span class="zero">0</span>');
const casaDe = (cod) => (cod === '6' ? 'federal' : 'estadual');
const NOME_CASA = { federal: 'Câmara dos Deputados', estadual: 'Assembleias + Câmara Legislativa (DF)' };

const exemplo = new URLSearchParams(location.search).get('dados') === 'exemplo';
const PASTA = exemplo ? 'data/exemplo' : 'data/2026';

const E = {
  indice: null,
  dados: {},          // uf -> { codCargo -> cargo }
  partidos: [],       // siglas
  fedReal: {},        // sigla -> id da federação real
  grupos: [],         // federações da simulação: {id, nome, partidos, origem}
  opcoes: { votosCortados: 'legenda', cotaGenero: false, base: 'oficial' },
  res: null,
  aba: 'federacoes',
  uf: null, cargo: '6', comp: null,
  seq: 1,
  votosNac: {}, totalNac: 0,
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2600);
}

// ------------------------------------------------------------------ carga
async function iniciar() {
  ligarAbas();
  try {
    const r = await fetch(`${PASTA}/index.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    E.indice = await r.json();
  } catch {
    semDados();
    return;
  }
  $('#aviso-exemplo').hidden = !exemplo;
  $('#info-dados').textContent = `Fonte: ${E.indice.fonte} · dados preparados em ${new Date(E.indice.gerado_em).toLocaleString('pt-BR')}`;
  $('#aba-federacoes').innerHTML = '<p class="carregando">Carregando resultados das 27 UFs…</p>';
  const lista = await Promise.all(
    E.indice.ufs.map(async ({ uf }) => [uf, await (await fetch(`${PASTA}/${uf}.json`, { cache: 'no-cache' })).json()])
  );
  for (const [uf, d] of lista) {
    E.dados[uf] = {};
    for (const [cod, b] of Object.entries(d.cargos)) E.dados[uf][cod] = carregarCargo(b);
  }
  const usados = new Set();
  for (const uf in E.dados) for (const c of Object.values(E.dados[uf])) {
    Object.keys(c.partidos).forEach((p) => usados.add(p));
    c.candidatos.forEach((x) => usados.add(x.partido));
  }
  E.partidos = [...usados].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt'));
  for (const f of E.indice.federacoes) for (const p of f.partidos) E.fedReal[p] = f.id;
  for (const uf in E.dados) {
    const c = E.dados[uf]['6'];
    if (!c) continue;
    for (const [p, v] of Object.entries(c.partidos)) E.votosNac[p] = (E.votosNac[p] || 0) + v.legenda;
    for (const x of c.candidatos) E.votosNac[x.partido] = (E.votosNac[x.partido] || 0) + x.votos;
  }
  E.totalNac = Object.values(E.votosNac).reduce((a, b) => a + b, 0);
  E.uf = E.dados.SP ? 'SP' : Object.keys(E.dados)[0];

  restaurarReais();
  if (!lerLink()) toast('Federações reais de 2026 carregadas. Monte as suas!');
  atualizar();
}

function semDados() {
  $('#info-dados').textContent = 'Dados ainda não preparados.';
  $('#aba-federacoes').innerHTML = `<div class="aviso erro"><strong>Os dados do TSE ainda não foram carregados neste site.</strong><br>
  Quem administra o site precisa rodar <code>python scripts/preparar_dados.py</code> (ou o botão “Atualizar dados do TSE” na aba Actions do GitHub).
  Para testar com dados fictícios, acrescente <code>?dados=exemplo</code> ao endereço depois de gerá-los (veja o README).</div>`;
}

// ------------------------------------------------------------------ federações
const fedPorId = (id) => E.indice.federacoes.find((f) => f.id === id);
const nomeFedReal = (f) => f.nome || f.sigla || f.partidos.join('/');

function restaurarReais() {
  E.grupos = E.indice.federacoes.map((f) => ({ id: `G${E.seq++}`, nome: nomeFedReal(f), partidos: [...f.partidos], origem: f.id }));
}

function mapaSim() {
  const m = {};
  for (const g of E.grupos) if (g.partidos.length >= 2) for (const p of g.partidos) m[p] = g.id;
  return (sg) => m[sg] || `P:${sg}`;
}
const grupoReal = (sg) => E.fedReal[sg] || `P:${sg}`;

function nomeAg(id, tipo = 'sim') {
  if (id.startsWith('P:')) return id.slice(2);
  if (tipo === 'real') return nomeFedReal(fedPorId(id) || { partidos: [id] });
  return E.grupos.find((g) => g.id === id)?.nome || id;
}
function membros(id, tipo = 'sim') {
  if (id.startsWith('P:')) return [id.slice(2)];
  if (tipo === 'real') return fedPorId(id)?.partidos || [];
  return E.grupos.find((g) => g.id === id)?.partidos || [];
}

function statusGrupo(g) {
  if (g.partidos.length < 2) return ['alerta', 'precisa de 2+ partidos'];
  const f = g.origem && fedPorId(g.origem);
  if (f && [...f.partidos].sort().join() === [...g.partidos].sort().join()) return ['', 'real'];
  return f ? ['nova', 'alterada'] : ['nova', 'nova'];
}

// compartilhamento por link
function gravarLink() {
  const obj = { g: E.grupos.map((g) => [g.nome, g.partidos]), v: E.opcoes.votosCortados[0], c: E.opcoes.cotaGenero ? 1 : 0, b: E.opcoes.base[0] };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  history.replaceState(null, '', `${location.pathname}${location.search}#s=${b64}`);
  return location.href;
}
function lerLink() {
  const m = location.hash.match(/#s=([\w-]+)/);
  if (!m) return false;
  try {
    const obj = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    const validos = new Set(E.partidos);
    E.grupos = obj.g.map(([nome, ps]) => {
      const partidos = ps.filter((p) => validos.has(p));
      const orig = E.indice.federacoes.find((f) => [...f.partidos].sort().join() === [...partidos].sort().join());
      return { id: `G${E.seq++}`, nome: String(nome).slice(0, 60), partidos, origem: orig?.id || null };
    });
    E.opcoes.votosCortados = obj.v === 'd' ? 'descartar' : 'legenda';
    E.opcoes.cotaGenero = !!obj.c && E.indice.tem_genero;
    E.opcoes.base = obj.b === 'r' ? 'recalculado' : 'oficial';
    toast('Simulação carregada a partir do link.');
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ simulação
function simular() {
  const gSim = mapaSim();
  const res = { porCargo: [], partidos: {}, cortesTotal: 0, cortadosEleitos: 0 };
  for (const p of E.partidos) res.partidos[p] = { federal: { base: 0, sim: 0 }, estadual: { base: 0, sim: 0 } };
  const inc = (p, casa, k) => { (res.partidos[p] ||= { federal: { base: 0, sim: 0 }, estadual: { base: 0, sim: 0 } })[casa][k]++; };

  for (const uf of Object.keys(E.dados).sort()) {
    for (const [cod, cargo] of Object.entries(E.dados[uf])) {
      const real = simularCargo(cargo, grupoReal, {});
      const sim = simularCargo(cargo, gSim, E.opcoes);
      const oficiais = cargo.candidatos.filter((c) => c.eleitoOficial);
      const usarOficial = E.opcoes.base === 'oficial' && oficiais.length === cargo.vagas;
      const base = usarOficial ? oficiais : real.eleitos.map((e) => e.cand);
      const casa = casaDe(cod);
      base.forEach((c) => inc(c.partido, casa, 'base'));
      sim.eleitos.forEach((e) => inc(e.cand.partido, casa, 'sim'));
      const idsBase = new Set(base.map((c) => c.id));
      res.cortesTotal += sim.cortes.length;
      res.cortadosEleitos += sim.cortes.filter((x) => idsBase.has(x.cand.id)).length;
      res.porCargo.push({ uf, cod, casa, cargo, real, sim, base, idsBase, usarOficial, oficiais });
    }
  }
  res.gSim = gSim;
  E.res = res;
}

function agregados() {
  // agremiações da simulação com soma de base (real) e simulado dos partidos-membros
  const ags = new Map();
  for (const p of E.partidos) {
    const id = E.res.gSim(p);
    if (!ags.has(id)) ags.set(id, { id, partidos: [], federal: { base: 0, sim: 0 }, estadual: { base: 0, sim: 0 }, votosFed: 0 });
    const a = ags.get(id);
    a.partidos.push(p);
    for (const casa of ['federal', 'estadual']) for (const k of ['base', 'sim']) a[casa][k] += E.res.partidos[p][casa][k];
    a.votosFed += E.votosNac[p] || 0;
  }
  return [...ags.values()];
}

/** Cláusula de desempenho 2026 (EC 97/2017, art. 3º, parágrafo único, II). */
function clausula(tipo) {
  const por = {};
  let total = 0;
  for (const pc of E.res.porCargo) {
    if (pc.cod !== '6') continue;
    const r = tipo === 'sim' ? pc.sim : pc.real;
    total += r.validos;
    for (const ag of r.ags) {
      const o = (por[ag.id] ||= { id: ag.id, votos: 0, ufs15: 0, deps: 0, ufsDeps: 0 });
      o.votos += ag.votos;
      if (r.validos && ag.votos * 1000 >= 15 * r.validos) o.ufs15++;
      o.deps += ag.eleitos.length;
      if (ag.eleitos.length) o.ufsDeps++;
    }
  }
  const minUfs = Math.ceil(27 / 3);
  for (const o of Object.values(por)) {
    o.pct = total ? o.votos / total : 0;
    o.porVotos = o.pct >= 0.025 && o.ufs15 >= minUfs;
    o.porDeps = o.deps >= 13 && o.ufsDeps >= minUfs;
    o.passa = o.porVotos || o.porDeps;
  }
  return por;
}

function atualizar() {
  simular();
  gravarLink();
  render();
}

// ------------------------------------------------------------------ abas
function ligarAbas() {
  document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));
}
function mostrarAba(aba) {
  E.aba = aba;
  document.querySelectorAll('.abas button').forEach((b) => b.setAttribute('aria-selected', b.dataset.aba === aba));
  document.querySelectorAll('.aba').forEach((s) => (s.hidden = s.id !== `aba-${aba}`));
  render();
  window.scrollTo({ top: Math.min(window.scrollY, $('.abas').offsetTop - 10) });
}
function render() {
  if (!E.res) return;
  ({ federacoes: renderFederacoes, resultado: renderResultado, estado: renderEstado, comparar: renderComparar, metodo: renderMetodo })[E.aba]();
}

// ------------------------------------------------------------------ aba 1
function renderFederacoes() {
  const el = $('#aba-federacoes');
  const grupoDe = new Map();
  E.grupos.forEach((g) => g.partidos.forEach((p) => grupoDe.set(p, g)));
  const isolados = E.partidos.filter((p) => !grupoDe.has(p));
  const nomeP = (p) => E.indice.partidos[p]?.nome || p;
  const votoP = (ps) => pct(ps.reduce((s, p) => s + (E.votosNac[p] || 0), 0), E.totalNac, 1);

  const card = (g) => {
    const [cls, txt] = statusGrupo(g);
    const opcoes = E.partidos.filter((p) => !g.partidos.includes(p)).map((p) => {
      const atual = grupoDe.get(p);
      return `<option value="${esc(p)}">${esc(p)}${atual ? ` (sai de ${esc(atual.nome)})` : ''}</option>`;
    }).join('');
    return `<div class="fed ${cls === 'nova' ? 'nova' : ''}">
      <div class="fed-cab">
        <input data-nome="${g.id}" value="${esc(g.nome)}" aria-label="Nome da federação" maxlength="60">
        <span class="selo ${cls}">${txt}</span>
        <button class="btn discreto" data-acao="excluir" data-g="${g.id}" title="Desfazer esta federação">✕</button>
      </div>
      <div class="chips">${g.partidos.map((p) => `<span class="chip" title="${esc(nomeP(p))}">${esc(p)}<button data-acao="remover" data-g="${g.id}" data-p="${esc(p)}" aria-label="Tirar ${esc(p)}">×</button></span>`).join('') || '<span class="ajuda">Nenhum partido ainda.</span>'}</div>
      <select data-add="${g.id}"><option value="">+ adicionar partido…</option>${opcoes}</select>
      <small class="ajuda">${votoP(g.partidos)} dos votos válidos para deputado federal no país</small>
    </div>`;
  };

  el.innerHTML = `
    <h2>Monte as federações</h2>
    <p class="ajuda">As federações abaixo são as que disputaram 2026 de verdade. Você pode alterá-las, desfazê-las ou criar novas.
      Uma federação vale em todo o país, para deputado federal, estadual e distrital. Partidos fora de federação concorrem sozinhos.
      A simulação é refeita automaticamente a cada mudança.</p>
    <div class="barra">
      <button class="btn principal" data-acao="nova">+ Nova federação</button>
      <button class="btn" data-acao="restaurar">Restaurar federações reais</button>
      <button class="btn" data-acao="dissolver">Desfazer todas</button>
      <button class="btn" data-acao="link">Copiar link desta simulação</button>
    </div>
    <div class="grade-feds">
      ${E.grupos.map(card).join('')}
      <div class="fed isolados"><div class="fed-cab"><strong>Partidos concorrendo sozinhos (${isolados.length})</strong></div>
        <div class="chips">${isolados.map((p) => `<span class="chip sem-x" title="${esc(nomeP(p))} · ${votoP([p])} dos votos federais">${esc(p)}</span>`).join('')}</div>
      </div>
    </div>
    <div class="opcoes">
      <fieldset><legend>Votos dos candidatos cortados da chapa</legend>
        <label><input type="radio" name="vc" value="legenda" ${E.opcoes.votosCortados === 'legenda' ? 'checked' : ''}> Ficam com a federação (como voto de legenda)</label>
        <label><input type="radio" name="vc" value="descartar" ${E.opcoes.votosCortados === 'descartar' ? 'checked' : ''}> São descartados</label>
        <small>Quem foi cortado não teria sido candidato; não há como saber em quem o eleitor votaria.</small>
      </fieldset>
      <fieldset><legend>Ao cortar a chapa</legend>
        <label><input type="checkbox" name="cota" ${E.opcoes.cotaGenero ? 'checked' : ''} ${E.indice.tem_genero ? '' : 'disabled'}> Respeitar a cota mínima de 30% de cada gênero</label>
        <small>${E.indice.tem_genero ? 'Sem a cota, ficam simplesmente os mais votados (até vagas + 1).' : 'Indisponível: o cadastro de candidatos não foi baixado.'}</small>
      </fieldset>
      <fieldset><legend>Comparar com</legend>
        <label><input type="radio" name="base" value="oficial" ${E.opcoes.base === 'oficial' ? 'checked' : ''}> Eleitos oficiais do TSE</label>
        <label><input type="radio" name="base" value="recalculado" ${E.opcoes.base === 'recalculado' ? 'checked' : ''}> Resultado real recalculado por este simulador</label>
        <small>Os dois devem coincidir; veja a conferência na aba Metodologia.</small>
      </fieldset>
    </div>
    <div class="barra"><button class="btn principal grande" data-acao="ver">Ver resultado →</button></div>`;

  el.onclick = (ev) => {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const g = E.grupos.find((x) => x.id === b.dataset.g);
    switch (b.dataset.acao) {
      case 'nova': E.grupos.push({ id: `G${E.seq++}`, nome: `Nova federação ${E.grupos.filter((x) => !x.origem).length + 1}`, partidos: [], origem: null }); break;
      case 'restaurar': restaurarReais(); break;
      case 'dissolver': E.grupos = []; break;
      case 'excluir': E.grupos = E.grupos.filter((x) => x !== g); break;
      case 'remover': g.partidos = g.partidos.filter((p) => p !== b.dataset.p); break;
      case 'link': navigator.clipboard?.writeText(gravarLink()).then(() => toast('Link copiado!'), () => prompt('Copie o link:', gravarLink())); return;
      case 'ver': mostrarAba('resultado'); return;
    }
    atualizar();
  };
  el.onchange = (ev) => {
    const t = ev.target;
    if (t.dataset.add && t.value) {
      for (const x of E.grupos) x.partidos = x.partidos.filter((p) => p !== t.value);
      E.grupos.find((x) => x.id === t.dataset.add).partidos.push(t.value);
    } else if (t.name === 'vc') E.opcoes.votosCortados = t.value;
    else if (t.name === 'cota') E.opcoes.cotaGenero = t.checked;
    else if (t.name === 'base') E.opcoes.base = t.value;
    else if (t.dataset.nome) { E.grupos.find((x) => x.id === t.dataset.nome).nome = t.value.trim() || 'Sem nome'; }
    else return;
    atualizar();
  };
}

// ------------------------------------------------------------------ aba 2
function linhaCasas(o) {
  return ['federal', 'estadual'].map((c) => `<td class="num">${o[c].base}</td><td class="num"><strong>${o[c].sim}</strong></td><td class="num">${delta(o[c].sim - o[c].base)}</td>`).join('');
}
const cabCasas = `<tr class="grupo"><th></th><th colspan="3">${NOME_CASA.federal}</th><th colspan="3">${NOME_CASA.estadual}</th><th colspan="2"></th></tr>`;
const subCasas = '<th class="num">Real</th><th class="num">Simulado</th><th class="num">Δ</th>'.repeat(2);

function renderResultado() {
  const el = $('#aba-resultado');
  const ags = agregados().sort((a, b) => b.federal.sim - a.federal.sim || b.estadual.sim - a.estadual.sim || b.votosFed - a.votosFed);
  const cl = clausula('sim');
  const clR = clausula('real');
  const mov = (casa) => Object.values(E.res.partidos).reduce((s, p) => s + Math.max(0, p[casa].sim - p[casa].base), 0);
  const comCadeira = (k) => ags.filter((a) => a.federal[k] > 0).length;
  const partidos = E.partidos.map((p) => ({ p, ...E.res.partidos[p] }))
    .filter((x) => x.federal.base || x.federal.sim || x.estadual.base || x.estadual.sim)
    .sort((a, b) => b.federal.sim - a.federal.sim || b.estadual.sim - a.estadual.sim);
  const realDe = (p) => (E.fedReal[p] ? nomeFedReal(fedPorId(E.fedReal[p])) : '—');

  el.innerHTML = `
    <h2>Resultado nacional da simulação</h2>
    <div class="kpis">
      <div class="kpi"><div class="v">${mov('federal')}</div><div class="r">cadeiras da Câmara mudam de partido (de 513)</div></div>
      <div class="kpi"><div class="v">${mov('estadual')}</div><div class="r">cadeiras nas Assembleias mudam de partido</div></div>
      <div class="kpi"><div class="v">${fmt(E.res.cortesTotal)}</div><div class="r">candidaturas cortadas ao refazer as chapas${E.res.cortadosEleitos ? ` (${E.res.cortadosEleitos} delas eleitas de verdade)` : ''}</div></div>
      <div class="kpi"><div class="v">${comCadeira('sim')}</div><div class="r">agremiações com deputado federal (real: ${comCadeira('base')})</div></div>
    </div>
    <h3>Por agremiação simulada</h3>
    <p class="ajuda">“Real” soma as cadeiras que os partidos da agremiação conquistaram em 2026. A cláusula de desempenho considera a agremiação simulada (federação conta como um todo).</p>
    <div class="tabela-wrap"><table>
      <thead>${cabCasas}<tr><th>Agremiação</th>${subCasas}<th class="num">Votos federais</th><th>Cláusula de desempenho</th></tr></thead>
      <tbody>${ags.map((a) => {
        const c = cl[a.id];
        const antes = a.partidos.map((p) => clR[grupoReal(p)]?.passa);
        const mudou = c && antes.some((x) => x !== c.passa);
        return `<tr><td><strong>${esc(nomeAg(a.id))}</strong>${a.partidos.length > 1 ? `<br><small class="ajuda">${esc(a.partidos.join(' · '))}</small>` : ''}</td>${linhaCasas(a)}
          <td class="num">${pct(a.votosFed, E.totalNac)}</td>
          <td>${c ? (c.passa ? '✅ supera' : '❌ não supera') : '–'}${mudou ? ' <span class="tag novo">muda</span>' : ''}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <h3>Por partido</h3>
    <div class="barra"><button class="btn" id="csv">Baixar tabela (CSV)</button></div>
    <div class="tabela-wrap"><table>
      <thead>${cabCasas}<tr><th>Partido</th>${subCasas}<th>Federação real</th><th>Na simulação</th></tr></thead>
      <tbody>${partidos.map((x) => `<tr><td><strong>${esc(x.p)}</strong></td>${linhaCasas(x)}<td>${esc(realDe(x.p))}</td><td>${esc(E.res.gSim(x.p).startsWith('P:') ? 'sozinho' : nomeAg(E.res.gSim(x.p)))}</td></tr>`).join('')}</tbody>
    </table></div>
    <details><summary>Como a cláusula de desempenho é calculada</summary>
      <p class="ajuda">Para a legislatura que começa em 2027, a agremiação precisa de 2,5% dos votos válidos para a Câmara, distribuídos em ao menos 9 UFs com 1,5% em cada uma; ou eleger 13 deputados federais em ao menos 9 UFs (EC 97/2017). A cláusula não altera a distribuição de cadeiras: ela define o acesso ao fundo partidário e ao tempo de rádio e TV.</p>
    </details>`;

  $('#csv').onclick = () => {
    const linhas = [['partido', 'federacao_real', 'agremiacao_simulada', 'camara_real', 'camara_simulada', 'camara_delta', 'assembleias_real', 'assembleias_simulada', 'assembleias_delta']];
    for (const x of partidos) linhas.push([x.p, realDe(x.p), E.res.gSim(x.p).startsWith('P:') ? 'sozinho' : nomeAg(E.res.gSim(x.p)), x.federal.base, x.federal.sim, x.federal.sim - x.federal.base, x.estadual.base, x.estadual.sim, x.estadual.sim - x.estadual.base]);
    baixarCsv(linhas, 'simulacao-federacoes-2026.csv');
  };
}

function baixarCsv(linhas, nome) {
  const txt = '﻿' + linhas.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = nome;
  a.click();
}

// ------------------------------------------------------------------ aba 3
function renderEstado() {
  const el = $('#aba-estado');
  const ufs = Object.keys(E.dados).sort();
  if (!E.dados[E.uf][E.cargo]) E.cargo = Object.keys(E.dados[E.uf])[0];
  const pc = E.res.porCargo.find((x) => x.uf === E.uf && x.cod === E.cargo);
  const { sim, cargo } = pc;
  const ev = cargo.eleitorado || {};
  const qe = sim.qe;
  const baseDoAg = (id) => pc.base.filter((c) => E.res.gSim(c.partido) === id).length;
  const idsSim = new Set(sim.eleitos.map((e) => e.cand.id));
  const cortados = new Set(sim.cortes.map((x) => x.cand.id));
  const saem = pc.base.filter((c) => !idsSim.has(c.id)).sort((a, b) => b.votos - a.votos);
  const ags = [...sim.ags].sort((a, b) => b.votos - a.votos);
  const validosReais = pc.real.validos;

  el.innerHTML = `
    <h2>Detalhe por estado</h2>
    <div class="filtros">
      <label>UF<select id="sel-uf">${ufs.map((u) => `<option ${u === E.uf ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label>Cargo<select id="sel-cargo">${Object.entries(E.dados[E.uf]).map(([c, v]) => `<option value="${c}" ${c === E.cargo ? 'selected' : ''}>${esc(v.cargo)}</option>`).join('')}</select></label>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="v">${cargo.vagas}</div><div class="r">vagas · chapa máxima de ${sim.limite} candidatos</div></div>
      <div class="kpi"><div class="v">${fmt(sim.validos)}</div><div class="r">votos válidos na simulação${sim.validos !== validosReais ? ` (real: ${fmt(validosReais)})` : ''}</div></div>
      <div class="kpi"><div class="v">${fmt(qe)}</div><div class="r">quociente eleitoral${qe !== pc.real.qe ? ` (real: ${fmt(pc.real.qe)})` : ''}</div></div>
      <div class="kpi"><div class="v">${fmt(Math.ceil(qe * 0.1))}</div><div class="r">piso individual (10% do QE) · 20% = ${fmt(Math.ceil(qe * 0.2))} · 80% = ${fmt(Math.ceil(qe * 0.8))}</div></div>
    </div>
    ${ev.comparecimento ? `<p class="ajuda">Aptos: ${fmt(ev.aptos)} · comparecimento: ${fmt(ev.comparecimento)} (${pct(ev.comparecimento, ev.aptos, 1)}) · abstenções: ${fmt(ev.abstencoes)} ·
      brancos: ${fmt(ev.brancos)} · nulos: ${fmt(ev.nulos)} · anulados (candidaturas inaptas/sub judice): ${fmt((ev.anulados_subjudice || 0) || ev.anulados || 0)} ·
      nominais válidos: ${fmt(ev.nominais_validos)} · legenda válidos: ${fmt(ev.legenda_validos)}. Brancos, nulos e anulados não entram no quociente eleitoral.</p>` : ''}
    <h3>Distribuição das cadeiras</h3>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Agremiação</th><th class="num">Votos</th><th class="num">%</th><th class="num">QP</th><th class="num">Pelo QP</th><th class="num">Sobras 80/20</th><th class="num">Sobras (todas)</th><th class="num">Simulado</th><th class="num">Real</th><th class="num">Δ</th><th class="num">Candidatos (cortados)</th></tr></thead>
      <tbody>${ags.map((a) => {
        const b = baseDoAg(a.id);
        const nc = sim.cortes.filter((x) => x.ag === a.id).length;
        return `<tr><td><strong>${esc(nomeAg(a.id))}</strong>${a.partidos.length > 1 ? `<br><small class="ajuda">${esc(a.partidos.join(' · '))}</small>` : ''}</td>
        <td class="num">${fmt(a.votos)}</td><td class="num">${pct(a.votos, sim.validos)}</td><td class="num">${a.qp}</td>
        <td class="num">${a.porFase.QP}</td><td class="num">${a.porFase.SOBRA_80_20}</td><td class="num">${a.porFase.SOBRA_TODOS}</td>
        <td class="num"><strong>${a.eleitos.length}</strong></td><td class="num">${b}</td><td class="num">${delta(a.eleitos.length - b)}</td>
        <td class="num">${a.cands.length}${nc ? ` (${nc})` : ''}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="duas-col">
      <div>
        <h3>Eleitos na simulação (${sim.eleitos.length})</h3>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Candidato</th><th>Partido</th><th class="num">Votos</th><th>Como</th></tr></thead>
          <tbody>${[...sim.eleitos].sort((a, b) => b.cand.votos - a.cand.votos).map((e) => `<tr><td>${esc(e.cand.nome)} ${pc.idsBase.has(e.cand.id) ? '' : '<span class="tag novo">entra</span>'}</td><td>${esc(e.cand.partido)}</td><td class="num">${fmt(e.cand.votos)}</td><td><span class="tag ${e.fase}">${FASES[e.fase]}</span></td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div>
        <h3>Perdem a vaga (${saem.length})</h3>
        ${saem.length ? `<div class="tabela-wrap"><table>
          <thead><tr><th>Candidato</th><th>Partido</th><th class="num">Votos</th><th>Motivo</th></tr></thead>
          <tbody>${saem.map((c) => `<tr><td>${esc(c.nome)} <span class="tag saiu">sai</span></td><td>${esc(c.partido)}</td><td class="num">${fmt(c.votos)}</td><td>${cortados.has(c.id) ? 'cortado da chapa' : 'superado na nova distribuição'}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="ajuda">Ninguém perde a vaga nesta UF.</p>'}
        <h3>Ordem de distribuição das sobras</h3>
        <div class="tabela-wrap"><table>
          <thead><tr><th class="num">#</th><th>Fase</th><th>Agremiação</th><th class="num">Média</th><th>Eleito</th></tr></thead>
          <tbody>${sim.eventos.filter((e) => e.fase !== 'QP').map((e) => `<tr><td class="num">${e.ordem}</td><td><span class="tag ${e.fase}">${FASES[e.fase]}</span></td><td>${esc(nomeAg(e.ag))}</td><td class="num">${fmt(Math.floor(e.media))}</td><td>${esc(e.cand.nome)}</td></tr>`).join('') || '<tr><td colspan="5" class="ajuda">Todas as vagas foram preenchidas pelo quociente partidário.</td></tr>'}</tbody>
        </table></div>
        ${sim.vagasNaoPreenchidas ? `<div class="aviso erro">${sim.vagasNaoPreenchidas} vaga(s) sem candidato disponível.</div>` : ''}
      </div>
    </div>
    ${sim.cortes.length ? `<details><summary>Candidaturas cortadas ao refazer as chapas (${sim.cortes.length})</summary>
      <div class="tabela-wrap"><table><thead><tr><th>Candidato</th><th>Partido</th><th>Agremiação</th><th class="num">Votos</th></tr></thead>
      <tbody>${sim.cortes.sort((a, b) => b.cand.votos - a.cand.votos).map((x) => `<tr><td>${esc(x.cand.nome)}</td><td>${esc(x.cand.partido)}</td><td>${esc(nomeAg(x.ag))}</td><td class="num">${fmt(x.cand.votos)}</td></tr>`).join('')}</tbody></table></div>
    </details>` : ''}`;

  $('#sel-uf').onchange = (e) => { E.uf = e.target.value; renderEstado(); };
  $('#sel-cargo').onchange = (e) => { E.cargo = e.target.value; renderEstado(); };
}

// ------------------------------------------------------------------ aba 4
function renderComparar() {
  const el = $('#aba-comparar');
  const ags = agregados().filter((a) => a.partidos.length > 1).sort((a, b) => b.votosFed - a.votosFed);
  const opcoesAg = ags.map((a) => `<option value="A|${a.id}">${esc(nomeAg(a.id))} (${esc(a.partidos.join('/'))})</option>`).join('');
  const opcoesP = E.partidos.map((p) => `<option value="P|${esc(p)}">${esc(p)}</option>`).join('');
  if (!E.comp) E.comp = ags[0] ? `A|${ags[0].id}` : `P|${E.partidos[0]}`;
  const [tipo, id] = E.comp.split('|');
  if (tipo === 'A' && !ags.find((a) => a.id === id)) E.comp = `P|${E.partidos[0]}`;
  const [t2, id2] = E.comp.split('|');
  const conj = new Set(t2 === 'A' ? membros(id2) : [id2]);
  const titulo = t2 === 'A' ? nomeAg(id2) : id2;

  const porUf = {};
  const entram = [];
  const saem = [];
  for (const pc of E.res.porCargo) {
    const o = (porUf[pc.uf] ||= { federal: { base: 0, sim: 0 }, estadual: { base: 0, sim: 0 } });
    const idsSim = new Set(pc.sim.eleitos.map((e) => e.cand.id));
    for (const c of pc.base) if (conj.has(c.partido)) { o[pc.casa].base++; if (!idsSim.has(c.id)) saem.push({ ...c, uf: pc.uf, casa: pc.casa }); }
    for (const e of pc.sim.eleitos) if (conj.has(e.cand.partido)) { o[pc.casa].sim++; if (!pc.idsBase.has(e.cand.id)) entram.push({ ...e.cand, uf: pc.uf, casa: pc.casa }); }
  }
  const total = { federal: { base: 0, sim: 0 }, estadual: { base: 0, sim: 0 } };
  for (const o of Object.values(porUf)) for (const c of ['federal', 'estadual']) for (const k of ['base', 'sim']) total[c][k] += o[c][k];
  const lista = (arr, vazio) => (arr.length ? `<div class="tabela-wrap"><table><thead><tr><th>Candidato</th><th>Partido</th><th>UF</th><th>Casa</th><th class="num">Votos</th></tr></thead><tbody>${arr.sort((a, b) => b.votos - a.votos).map((c) => `<tr><td>${esc(c.nome)}</td><td>${esc(c.partido)}</td><td>${c.uf}</td><td>${c.casa === 'federal' ? 'Câmara' : 'Assembleia'}</td><td class="num">${fmt(c.votos)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="ajuda">${vazio}</p>`);

  el.innerHTML = `
    <h2>Ganhos e perdas</h2>
    <div class="filtros"><label>Partido ou federação simulada
      <select id="sel-comp">${opcoesAg ? `<optgroup label="Federações da simulação">${opcoesAg}</optgroup>` : ''}<optgroup label="Partidos">${opcoesP}</optgroup></select></label></div>
    <div class="kpis">
      <div class="kpi"><div class="v">${total.federal.sim} ${delta(total.federal.sim - total.federal.base)}</div><div class="r">deputados federais de ${esc(titulo)} (real: ${total.federal.base})</div></div>
      <div class="kpi"><div class="v">${total.estadual.sim} ${delta(total.estadual.sim - total.estadual.base)}</div><div class="r">deputados estaduais/distritais (real: ${total.estadual.base})</div></div>
      <div class="kpi"><div class="v">${entram.length}</div><div class="r">candidatos entram</div></div>
      <div class="kpi"><div class="v">${saem.length}</div><div class="r">eleitos de verdade perdem a vaga</div></div>
    </div>
    <div class="tabela-wrap"><table>
      <thead>${cabCasas.replace('<th colspan="2"></th>', '')}<tr><th>UF</th>${subCasas}</tr></thead>
      <tbody>${Object.keys(porUf).sort().map((uf) => `<tr><td>${uf}</td>${linhaCasas(porUf[uf])}</tr>`).join('')}
      <tr><td><strong>Total</strong></td>${linhaCasas(total)}</tr></tbody>
    </table></div>
    <div class="duas-col">
      <div><h3>Entram (${entram.length})</h3>${lista(entram, 'Ninguém novo é eleito.')}</div>
      <div><h3>Saem (${saem.length})</h3>${lista(saem, 'Nenhum eleito perde a vaga.')}</div>
    </div>`;
  $('#sel-comp').value = E.comp;
  $('#sel-comp').onchange = (e) => { E.comp = e.target.value; renderComparar(); };
}

// ------------------------------------------------------------------ aba 5
function renderMetodo() {
  const el = $('#aba-metodo');
  const linhas = E.res.porCargo.map((pc) => {
    const calc = new Set(pc.real.eleitos.map((e) => e.cand.id));
    const ok = pc.oficiais.filter((c) => calc.has(c.id)).length;
    return { pc, ok };
  });
  const exatos = linhas.filter((l) => l.pc.oficiais.length && l.ok === l.pc.oficiais.length && l.pc.oficiais.length === l.pc.cargo.vagas).length;
  const comOficiais = linhas.filter((l) => l.pc.oficiais.length).length;
  el.innerHTML = `<div class="metodo">
    <h2>Como o cálculo é feito</h2>
    <ol>
      <li><strong>Chapas.</strong> Os candidatos de cada partido são agrupados conforme as federações escolhidas. Se uma agremiação passar do limite legal de candidatos (vagas + 1, art. 10 da Lei 9.504/1997), saem os menos votados${E.indice.tem_genero ? ', com a opção de manter 30% de cada gênero' : ''}.</li>
      <li><strong>Votos válidos</strong> = votos nominais válidos + votos de legenda. Brancos, nulos e votos anulados (candidaturas indeferidas) não contam.</li>
      <li><strong>Quociente eleitoral (QE)</strong> = válidos ÷ vagas, desprezando fração igual ou menor que meio (art. 106 do Código Eleitoral).</li>
      <li><strong>Quociente partidário (QP)</strong> = votos da agremiação ÷ QE, sem a fração (art. 107). A agremiação elege até QP candidatos, desde que cada um tenha ao menos 10% do QE (art. 108).</li>
      <li><strong>Sobras, 1ª etapa</strong>: maiores médias (votos ÷ cadeiras já obtidas + 1), só entre agremiações com 80% do QE e com candidato que tenha 20% do QE (art. 109, I, II e §2º).</li>
      <li><strong>Sobras, 2ª etapa</strong>: quando ninguém mais cumpre o 80/20, as vagas restantes vão às maiores médias entre <em>todas</em> as agremiações, conforme o STF (ADIs 7228, 7263 e 7325, 2024), que também afastou o art. 111.</li>
      <li><strong>Empates</strong>: entre candidatos, o mais idoso (art. 110); entre médias, a agremiação mais votada.</li>
    </ol>
    <h3>Conferência com o resultado oficial</h3>
    <p class="ajuda">Recalculando 2026 com as federações reais, o simulador reproduz exatamente os eleitos oficiais em <strong>${exatos} de ${comOficiais}</strong> disputas.
      Diferenças normalmente vêm de candidaturas sub judice ou de retotalizações posteriores à data dos dados.</p>
    <details ${exatos !== comOficiais ? 'open' : ''}><summary>Ver conferência por UF</summary>
    <div class="tabela-wrap"><table><thead><tr><th>UF</th><th>Cargo</th><th class="num">Vagas</th><th class="num">Eleitos oficiais</th><th class="num">Reproduzidos</th><th></th></tr></thead>
      <tbody>${linhas.map(({ pc, ok }) => `<tr><td>${pc.uf}</td><td>${esc(pc.cargo.cargo)}</td><td class="num">${pc.cargo.vagas}</td><td class="num">${pc.oficiais.length}</td><td class="num">${ok}</td><td>${ok === pc.oficiais.length && pc.oficiais.length === pc.cargo.vagas ? '✅' : '⚠️'}</td></tr>`).join('')}</tbody></table></div></details>
    ${E.indice.avisos?.length ? `<h3>Avisos gerados ao preparar os dados</h3><ul>${E.indice.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    <h3>Limitações (leia antes de tirar conclusões)</h3>
    <ul>
      <li>A simulação supõe que cada eleitor votaria no mesmo candidato ou legenda. Na vida real, federações diferentes mudariam candidaturas, campanhas e votos.</li>
      <li>Um partido que sai de uma federação fica apenas com os candidatos que de fato teve; sozinho, ele poderia ter lançado mais nomes.</li>
      <li>Candidatos cortados da chapa não existiriam; o destino dos seus votos é uma escolha sua (opção acima).</li>
      <li>Federações valem em todo o país e por 4 anos; aqui elas se aplicam a todas as UFs ao mesmo tempo.</li>
      <li>Dados do TSE na data indicada no topo. Decisões judiciais posteriores podem mudar votos válidos e eleitos.</li>
    </ul>
    <p class="ajuda">Arquivos usados: ${esc((E.indice.arquivos || []).join(', '))}.</p>
  </div>`;
}

iniciar();
