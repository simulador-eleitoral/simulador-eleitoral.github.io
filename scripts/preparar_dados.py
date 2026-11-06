#!/usr/bin/env python3
"""
Baixa os resultados das eleições proporcionais de 2026 do Portal de Dados
Abertos do TSE e gera os arquivos JSON compactos usados pelo site.

Uso (na pasta do projeto):
    python scripts/preparar_dados.py

Opções úteis:
    --forcar          baixa de novo, mesmo que os ZIPs já estejam em dados_brutos/
    --pasta-zips P    usa ZIPs que você já baixou manualmente (pasta P)
    --saida P         pasta de saída (padrão: docs/data/2026)
    --sem-cand        não baixa o cadastro de candidatos (sem gênero/idade)

Não precisa instalar nenhuma biblioteca: só Python 3.9+.
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import zipfile

ANO = 2026
UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
       "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"]
CARGOS = {6: "Deputado Federal", 7: "Deputado Estadual", 8: "Deputado Distrital"}

CDN = "https://cdn.tse.jus.br/estatistica/sead/odsele"
CKAN = "https://dadosabertos.tse.jus.br/api/3/action/package_show?id={}"
# chave: (conjunto no portal de dados abertos, prefixo do arquivo, obrigatório?)
ARQUIVOS = {
    "candidato": (f"resultados-{ANO}", "votacao_candidato_munzona", True),
    "partido":   (f"resultados-{ANO}", "votacao_partido_munzona", True),
    "detalhe":   (f"resultados-{ANO}", "detalhe_votacao_munzona", False),
    "vagas":     (f"candidatos-{ANO}", "consulta_vagas", False),
    "cand":      (f"candidatos-{ANO}", "consulta_cand", False),
}

# Distribuição de vagas da Câmara mantida para 2026 (igual a 2022; STF, set/2025).
# Usada só se o arquivo consulta_vagas não estiver disponível.
VAGAS_FEDERAIS = {"AC": 8, "AL": 9, "AM": 8, "AP": 8, "BA": 39, "CE": 22, "DF": 8, "ES": 10,
                  "GO": 17, "MA": 18, "MG": 53, "MS": 8, "MT": 8, "PA": 17, "PB": 12, "PE": 25,
                  "PI": 10, "PR": 30, "RJ": 46, "RN": 8, "RO": 8, "RR": 8, "RS": 31, "SC": 16,
                  "SE": 8, "SP": 70, "TO": 8}


def vagas_estaduais(federais):  # art. 27 da Constituição
    return 3 * federais if federais <= 12 else 36 + (federais - 12)


AVISOS = []


def aviso(msg):
    AVISOS.append(msg)
    print("  ! " + msg)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def inteiro(v):
    try:
        return int(str(v).strip().replace(".", "").replace(",", "")) if str(v).strip() else 0
    except ValueError:
        return 0


# ---------------------------------------------------------------- download

def abrir_url(url, tentativas=4):
    req = urllib.request.Request(url, headers={"User-Agent": "simulador-federacoes/1.0"})
    for i in range(tentativas):
        try:
            return urllib.request.urlopen(req, timeout=120)
        except Exception as e:  # noqa: BLE001
            if i == tentativas - 1:
                raise
            print(f"    falhou ({e}); tentando de novo em {5 * (i + 1)}s...")
            time.sleep(5 * (i + 1))


def descobrir_url(conjunto, prefixo):
    """Pergunta à API do portal de dados abertos (CKAN) onde está o arquivo."""
    alvo = f"{prefixo}_{ANO}.zip"
    try:
        with abrir_url(CKAN.format(conjunto), tentativas=2) as r:
            pacote = json.load(r)
        for rec in pacote.get("result", {}).get("resources", []):
            url = rec.get("url", "")
            if url.endswith("/" + alvo):
                return url
    except Exception as e:  # noqa: BLE001
        print(f"    (API do portal indisponível: {e}; usando endereço padrão)")
    return f"{CDN}/{prefixo}/{alvo}"


def baixar(chave, pasta, forcar):
    conjunto, prefixo, _ = ARQUIVOS[chave]
    destino = os.path.join(pasta, f"{prefixo}_{ANO}.zip")
    if os.path.exists(destino) and os.path.getsize(destino) > 0 and not forcar:
        print(f"  - {os.path.basename(destino)} já existe (use --forcar para baixar de novo)")
        return destino
    url = descobrir_url(conjunto, prefixo)
    print(f"  - baixando {url}")
    tmp = destino + ".parcial"
    with abrir_url(url) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        feito = 0
        while True:
            bloco = r.read(1 << 20)
            if not bloco:
                break
            f.write(bloco)
            feito += len(bloco)
            if total:
                print(f"\r    {feito / 1e6:7.1f} de {total / 1e6:.1f} MB", end="", flush=True)
        print()
    os.replace(tmp, destino)
    return destino


# ---------------------------------------------------------------- leitura

def linhas(caminho_zip):
    """Percorre as linhas dos CSVs de um ZIP do TSE (latin-1, separador ';')."""
    with zipfile.ZipFile(caminho_zip) as z:
        nomes = [n for n in z.namelist() if n.lower().endswith((".csv", ".txt"))]
        por_uf = [n for n in nomes if (m := re.search(r"_([A-Z]{2})\.(csv|txt)$", n, re.I))
                  and m.group(1).upper() in UFS]
        escolhidos = por_uf or [n for n in nomes if "BRASIL" in n.upper()] or nomes
        for nome in escolhidos:
            with z.open(nome) as f:
                leitor = csv.reader(io.TextIOWrapper(f, encoding="latin-1", newline=""),
                                    delimiter=";", quotechar='"')
                cab = next(leitor, None)
                if not cab:
                    continue
                idx = {c.strip().strip('"').upper(): i for i, c in enumerate(cab)}
                for row in leitor:
                    yield Linha(idx, row)


class Linha:
    __slots__ = ("idx", "row")

    def __init__(self, idx, row):
        self.idx, self.row = idx, row

    def tem(self, nome):
        return nome in self.idx

    def get(self, *nomes, padrao=""):
        for n in nomes:
            i = self.idx.get(n)
            if i is not None and i < len(self.row):
                return self.row[i].strip()
        return padrao

    def num(self, *nomes):
        return inteiro(self.get(*nomes))


def filtro(l):
    """Devolve (uf, cargo) se a linha for de deputado no 1º turno de 2026."""
    uf = l.get("SG_UF").upper()
    cargo = l.num("CD_CARGO")
    if uf not in UFS or cargo not in CARGOS:
        return None
    if l.tem("NR_TURNO") and l.num("NR_TURNO") not in (0, 1):
        return None
    if l.tem("ANO_ELEICAO") and l.num("ANO_ELEICAO") not in (0, ANO):
        return None
    return uf, cargo


def sit_oficial(txt):
    t = norm(txt)
    if "qp" in t:
        return "QP"
    if "media" in t:
        return "MEDIA"
    if t.startswith("eleito"):
        return "E"
    if "suplente" in t:
        return "SUP"
    if "nao eleito" in t:
        return "NE"
    return ""


# ---------------------------------------------------------------- principal

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--forcar", action="store_true")
    ap.add_argument("--pasta-zips", default="dados_brutos")
    ap.add_argument("--saida", default=os.path.join("docs", "data", str(ANO)))
    ap.add_argument("--sem-cand", action="store_true")
    ap.add_argument("--sem-download", action="store_true", help="só usa ZIPs já presentes")
    a = ap.parse_args()

    os.makedirs(a.pasta_zips, exist_ok=True)
    print(f"1/4  Obtendo arquivos do TSE (pasta {a.pasta_zips})")
    zips = {}
    for chave, (_, prefixo, obrig) in ARQUIVOS.items():
        if chave == "cand" and a.sem_cand:
            continue
        caminho = os.path.join(a.pasta_zips, f"{prefixo}_{ANO}.zip")
        try:
            zips[chave] = caminho if a.sem_download else baixar(chave, a.pasta_zips, a.forcar)
            if not os.path.exists(zips[chave]):
                raise FileNotFoundError(caminho)
        except Exception as e:  # noqa: BLE001
            zips.pop(chave, None)
            if obrig:
                sys.exit(f"\nERRO: não consegui obter {prefixo}_{ANO}.zip ({e}).\n"
                         f"Baixe manualmente em https://dadosabertos.tse.jus.br (Resultados {ANO}) "
                         f"e coloque o ZIP na pasta '{a.pasta_zips}'. Depois rode de novo.")
            aviso(f"arquivo opcional {prefixo}_{ANO}.zip indisponível ({e})")

    dados = {uf: {} for uf in UFS}
    partidos_info, federacoes, partido_fed = {}, {}, {}

    def cargo_de(uf, cargo):
        d = dados[uf].get(cargo)
        if d is None:
            d = dados[uf][cargo] = {"vagas": 0, "eleitorado": {}, "partidos": {}, "cands": {},
                                    "convertidos": {}, "anulados": 0}
        return d

    def registra_partido(l):
        sg = l.get("SG_PARTIDO")
        if not sg:
            return sg
        if sg not in partidos_info:
            partidos_info[sg] = {"nr": l.num("NR_PARTIDO"), "nome": l.get("NM_PARTIDO")}
        nr_fed = l.num("NR_FEDERACAO")
        if nr_fed > 0:
            fid = f"FED{nr_fed}"
            fed = federacoes.setdefault(fid, {"id": fid, "nr": nr_fed, "partidos": set(),
                                              "sigla": l.get("SG_FEDERACAO"), "nome": l.get("NM_FEDERACAO")})
            fed["partidos"].add(sg)
            partido_fed[sg] = fid
        return sg

    print("2/4  Lendo votação por candidato")
    for l in linhas(zips["candidato"]):
        k = filtro(l)
        if not k:
            continue
        d = cargo_de(*k)
        sg = registra_partido(l)
        destino = norm(l.get("NM_TIPO_DESTINACAO_VOTOS"))
        validos = l.num("QT_VOTOS_NOMINAIS_VALIDOS") if l.tem("QT_VOTOS_NOMINAIS_VALIDOS") else l.num("QT_VOTOS_NOMINAIS")
        brutos = l.num("QT_VOTOS_NOMINAIS")
        sq = l.get("SQ_CANDIDATO")
        if "legenda" in destino:          # votos nominais convertidos para a legenda
            d["convertidos"][sg] = d["convertidos"].get(sg, 0) + (validos or brutos)
            continue
        if destino and not destino.startswith("valido"):   # anulado / anulado sub judice
            d["anulados"] += brutos
            continue
        c = d["cands"].get(sq)
        if c is None:
            c = d["cands"][sq] = {"nome": l.get("NM_URNA_CANDIDATO") or l.get("NM_CANDIDATO"),
                                  "nr": l.num("NR_CANDIDATO"), "partido": sg, "votos": 0,
                                  "sit": sit_oficial(l.get("DS_SIT_TOT_TURNO"))}
        c["votos"] += validos

    print("3/4  Lendo votação por partido, comparecimento e vagas")
    usou_total = False
    for l in linhas(zips["partido"]):
        k = filtro(l)
        if not k:
            continue
        d = cargo_de(*k)
        sg = registra_partido(l)
        if l.tem("QT_TOTAL_VOTOS_LEG_VALIDOS"):
            usou_total = True
            leg = l.num("QT_TOTAL_VOTOS_LEG_VALIDOS")
        else:
            leg = l.num("QT_VOTOS_LEGENDA_VALIDOS", "QT_VOTOS_LEGENDA")
        p = d["partidos"].setdefault(sg, {"legenda": 0})
        p["legenda"] += leg
    if not usou_total:  # soma os nominais convertidos à legenda
        for uf in UFS:
            for d in dados[uf].values():
                for sg, v in d["convertidos"].items():
                    d["partidos"].setdefault(sg, {"legenda": 0})["legenda"] += v

    if "detalhe" in zips:
        campos = {"aptos": ("QT_APTOS",), "comparecimento": ("QT_COMPARECIMENTO",),
                  "abstencoes": ("QT_ABSTENCOES",), "brancos": ("QT_VOTOS_BRANCOS",),
                  "nulos": ("QT_TOTAL_VOTOS_NULOS", "QT_VOTOS_NULOS"),
                  "nominais_validos": ("QT_VOTOS_NOMINAIS_VALIDOS", "QT_VOTOS_NOMINAIS"),
                  "legenda_validos": ("QT_TOTAL_VOTOS_LEG_VALIDOS", "QT_VOTOS_LEGENDA_VALIDOS", "QT_VOTOS_LEGENDA"),
                  "anulados_subjudice": ("QT_TOTAL_VOTOS_ANUL_SUBJUD", "QT_VOTOS_ANULADOS_APU_SEP")}
        for l in linhas(zips["detalhe"]):
            k = filtro(l)
            if not k:
                continue
            e = cargo_de(*k)["eleitorado"]
            for nome, cols in campos.items():
                e[nome] = e.get(nome, 0) + l.num(*cols)

    if "vagas" in zips:
        for l in linhas(zips["vagas"]):
            k = filtro(l)
            if k:
                cargo_de(*k)["vagas"] = l.num("QT_VAGA", "QT_VAGAS", "QT_VAGAS_CARGO")

    if "cand" in zips:
        print("     lendo cadastro de candidatos (gênero e data de nascimento)")
        perfil = {}
        for l in linhas(zips["cand"]):
            if not filtro(l):
                continue
            g = norm(l.get("DS_GENERO"))
            nasc = l.get("DT_NASCIMENTO")
            m = re.match(r"(\d{2})/(\d{2})/(\d{4})", nasc)
            perfil[l.get("SQ_CANDIDATO")] = ("F" if g.startswith("fem") else "M" if g.startswith("masc") else "",
                                             int(m.group(3) + m.group(2) + m.group(1)) if m else 0)
    else:
        perfil = {}

    print(f"4/4  Gravando arquivos em {a.saida}")
    os.makedirs(a.saida, exist_ok=True)
    resumo_ufs = []
    for uf in UFS:
        saida_uf = {"uf": uf, "cargos": {}}
        for cargo, d in sorted(dados[uf].items()):
            if not d["cands"] and not d["partidos"]:
                continue
            if not d["vagas"]:
                fed = VAGAS_FEDERAIS[uf]
                d["vagas"] = fed if cargo == 6 else vagas_estaduais(fed)
                if "vagas" in zips:
                    aviso(f"{uf}/{CARGOS[cargo]}: vagas não encontradas no consulta_vagas; usei {d['vagas']}")
            cands = []
            for sq, c in d["cands"].items():
                gen, nasc = perfil.get(sq, ("", 0))
                cands.append([sq, c["nome"], c["nr"], c["partido"], c["votos"], gen, nasc, c["sit"]])
            cands.sort(key=lambda x: -x[4])
            nominais = sum(c[4] for c in cands)
            legenda = sum(p["legenda"] for p in d["partidos"].values())
            e = d["eleitorado"]
            if e and e.get("nominais_validos", 0) + e.get("legenda_validos", 0) not in (0, nominais + legenda):
                aviso(f"{uf}/{CARGOS[cargo]}: válidos pelos candidatos/partidos ({nominais + legenda}) "
                      f"diferem do detalhe da apuração ({e['nominais_validos'] + e['legenda_validos']})")
            oficiais = sum(1 for c in cands if c[7] in ("QP", "MEDIA", "E"))
            if oficiais and oficiais != d["vagas"]:
                aviso(f"{uf}/{CARGOS[cargo]}: {oficiais} eleitos oficiais para {d['vagas']} vagas "
                      f"(pode haver candidatura sub judice)")
            e["anulados"] = d["anulados"]
            saida_uf["cargos"][str(cargo)] = {
                "cargo": CARGOS[cargo], "vagas": d["vagas"], "eleitorado": e,
                "partidos": {sg: {"legenda": p["legenda"]} for sg, p in sorted(d["partidos"].items()) if sg},
                "candidatos": cands,
            }
        if saida_uf["cargos"]:
            with open(os.path.join(a.saida, f"{uf}.json"), "w", encoding="utf-8") as f:
                json.dump(saida_uf, f, ensure_ascii=False, separators=(",", ":"))
            resumo_ufs.append({"uf": uf, "cargos": sorted(int(c) for c in saida_uf["cargos"])})
            print(f"     {uf}: " + ", ".join(f"{CARGOS[int(c)]} ({len(v['candidatos'])} candidatos, "
                                             f"{v['vagas']} vagas)" for c, v in saida_uf["cargos"].items()))

    if not resumo_ufs:
        sys.exit("ERRO: nenhum dado de deputado encontrado. Confira se os ZIPs são de 2026.")

    indice = {
        "ano": ANO,
        "gerado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "fonte": "Portal de Dados Abertos do TSE (https://dadosabertos.tse.jus.br)",
        "arquivos": sorted(os.path.basename(z) for z in zips.values()),
        "tem_genero": bool(perfil),
        "ufs": resumo_ufs,
        "partidos": {sg: v for sg, v in sorted(partidos_info.items()) if sg},
        "federacoes": [{**f, "partidos": sorted(f["partidos"])} for f in sorted(federacoes.values(), key=lambda f: f["nr"])],
        "avisos": AVISOS,
    }
    with open(os.path.join(a.saida, "index.json"), "w", encoding="utf-8") as f:
        json.dump(indice, f, ensure_ascii=False, indent=1)
    print(f"\nPronto! {len(resumo_ufs)} UFs, {len(partidos_info)} partidos, {len(federacoes)} federações.")
    if AVISOS:
        print(f"{len(AVISOS)} aviso(s) registrados (aparecem também na aba Metodologia do site).")


if __name__ == "__main__":
    main()
