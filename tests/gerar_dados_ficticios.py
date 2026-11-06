#!/usr/bin/env python3
"""
Gera ZIPs FICTÍCIOS no mesmo formato dos arquivos do TSE, para testar o
sistema inteiro sem depender do download real.

Os eleitos "oficiais" destes dados são calculados aqui por uma implementação
independente (em Python) das regras. Se o site (JavaScript) chegar ao mesmo
resultado na aba "Metodologia > Conferência", as duas implementações batem.

Uso:
    python tests/gerar_dados_ficticios.py
    python scripts/preparar_dados.py --pasta-zips dados_ficticios --sem-download --saida docs/data/exemplo
    # depois abra o site com ?dados=exemplo no fim do endereço
"""
import csv
import io
import os
import random
import zipfile

random.seed(2026)
UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
       "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"]
FED = {"AC": 8, "AL": 9, "AM": 8, "AP": 8, "BA": 39, "CE": 22, "DF": 8, "ES": 10, "GO": 17, "MA": 18,
       "MG": 53, "MS": 8, "MT": 8, "PA": 17, "PB": 12, "PE": 25, "PI": 10, "PR": 30, "RJ": 46, "RN": 8,
       "RO": 8, "RR": 8, "RS": 31, "SC": 16, "SE": 8, "SP": 70, "TO": 8}
ELEITORES = {"SP": 34e6, "MG": 16e6, "RJ": 12.8e6, "BA": 11e6, "RS": 8.6e6, "PR": 8.3e6, "PE": 7e6}
PARTIDOS = [(10 + i, s, n) for i, (s, n) in enumerate([
    ("ALFA", "Partido Alfa"), ("BETA", "Partido Beta"), ("GAMA", "Partido Gama"), ("DELTA", "Partido Delta"),
    ("SIGMA", "Partido Sigma"), ("OMEGA", "Partido Ômega"), ("KAPA", "Partido Kapa"), ("LAMBDA", "Partido Lambda"),
    ("ZETA", "Partido Zeta"), ("TETA", "Partido Teta"), ("IOTA", "Partido Iota"), ("RO", "Partido Rô"),
    ("PSI", "Partido Psi"), ("FI", "Partido Fi"), ("CHI", "Partido Chi"), ("NI", "Partido Ni"),
])]
FORCA = {s: f for (_, s, _), f in zip(PARTIDOS, [20, 16, 12, 10, 9, 8, 6, 5, 4, 3, 2.5, 2, 1.5, 1, 0.6, 0.3])}
FEDERACOES = [(901, "FED AURORA", "Federação Aurora", ["ALFA", "GAMA", "IOTA"]),
              (902, "FED HORIZONTE", "Federação Horizonte", ["DELTA", "ZETA"])]
FED_DE = {p: f for f in FEDERACOES for p in f[3]}
CARGOS = {6: "DEPUTADO FEDERAL", 7: "DEPUTADO ESTADUAL", 8: "DEPUTADO DISTRITAL"}


def vagas(uf, cargo):
    f = FED[uf]
    return f if cargo == 6 else (3 * f if f <= 12 else 36 + f - 12)


# ---------------- implementação de referência (independente do JavaScript)
def qe_de(validos, vg):
    q, r = divmod(validos, vg)
    return q + 1 if 2 * r > vg else q


def alocar(vg, ags):
    """ags: {id: (votos_totais, [(votos, nasc, sq), ...])} -> {sq: 'QP'|'MEDIA'}"""
    validos = sum(v for v, _ in ags.values())
    qe = qe_de(validos, vg)
    lista = {k: sorted(c, key=lambda x: (-x[0], x[1])) for k, (_, c) in ags.items()}
    eleitos, cad, pos = {}, {k: 0 for k in ags}, {k: 0 for k in ags}
    resta = vg
    for k, (v, _) in ags.items():
        for _ in range(v // qe if qe else 0):
            if resta and pos[k] < len(lista[k]) and lista[k][pos[k]][0] * 10 >= qe:
                eleitos[lista[k][pos[k]][2]] = "QP"; pos[k] += 1; cad[k] += 1; resta -= 1

    def escolhe(cands):
        return max(cands, key=lambda k: (ags[k][0] / (cad[k] + 1), ags[k][0], -lista[k][pos[k]][1]))
    for fase in (1, 2):
        while resta:
            if fase == 1:
                ok = [k for k in ags if ags[k][0] * 10 >= 8 * qe and pos[k] < len(lista[k]) and lista[k][pos[k]][0] * 5 >= qe]
            else:
                ok = [k for k in ags if ags[k][0] > 0 and pos[k] < len(lista[k])]
            if not ok:
                break
            k = escolhe(ok)
            eleitos[lista[k][pos[k]][2]] = "MEDIA"; pos[k] += 1; cad[k] += 1; resta -= 1
    return eleitos


def csv_bytes(cab, linhas):
    s = io.StringIO()
    w = csv.writer(s, delimiter=";", quotechar='"', quoting=csv.QUOTE_ALL, lineterminator="\n")
    w.writerow(cab); w.writerows(linhas)
    return s.getvalue().encode("latin-1")


def main(pasta="dados_ficticios"):
    os.makedirs(pasta, exist_ok=True)
    cab_c = ["ANO_ELEICAO", "NR_TURNO", "SG_UF", "NR_ZONA", "CD_CARGO", "DS_CARGO", "SQ_CANDIDATO", "NR_CANDIDATO",
             "NM_CANDIDATO", "NM_URNA_CANDIDATO", "NR_PARTIDO", "SG_PARTIDO", "NM_PARTIDO", "NR_FEDERACAO",
             "NM_FEDERACAO", "SG_FEDERACAO", "DS_COMPOSICAO_FEDERACAO", "QT_VOTOS_NOMINAIS",
             "NM_TIPO_DESTINACAO_VOTOS", "QT_VOTOS_NOMINAIS_VALIDOS", "DS_SIT_TOT_TURNO"]
    cab_p = ["ANO_ELEICAO", "NR_TURNO", "SG_UF", "NR_ZONA", "CD_CARGO", "NR_PARTIDO", "SG_PARTIDO", "NM_PARTIDO",
             "NR_FEDERACAO", "NM_FEDERACAO", "SG_FEDERACAO", "QT_VOTOS_LEGENDA_VALIDOS",
             "QT_VOTOS_NOM_CONVR_LEG_VALIDOS", "QT_TOTAL_VOTOS_LEG_VALIDOS"]
    cab_d = ["ANO_ELEICAO", "NR_TURNO", "SG_UF", "NR_ZONA", "CD_CARGO", "QT_APTOS", "QT_COMPARECIMENTO",
             "QT_ABSTENCOES", "QT_VOTOS_BRANCOS", "QT_TOTAL_VOTOS_NULOS", "QT_VOTOS_NOMINAIS_VALIDOS",
             "QT_TOTAL_VOTOS_LEG_VALIDOS", "QT_TOTAL_VOTOS_ANUL_SUBJUD"]
    cab_v = ["ANO_ELEICAO", "SG_UF", "CD_CARGO", "DS_CARGO", "QT_VAGA"]
    cab_k = ["ANO_ELEICAO", "NR_TURNO", "SG_UF", "CD_CARGO", "SQ_CANDIDATO", "DS_GENERO", "DT_NASCIMENTO"]
    zc, zp, zd, zv, zk = ({uf: [] for uf in UFS} for _ in range(5))
    sq = 100000
    for uf in UFS:
        cargos = [6, 8] if uf == "DF" else [6, 7]
        for cargo in cargos:
            vg = vagas(uf, cargo)
            zv[uf].append([2026, uf, cargo, CARGOS[cargo], vg])
            eleitores = int(ELEITORES.get(uf, 2.5e6 + random.random() * 4e6))
            validos_alvo = int(eleitores * 0.70)
            pesos = {s: FORCA[s] * random.uniform(0.4, 1.8) for s in FORCA}
            if random.random() < 0.3:
                pesos["CHI"] *= 6  # nanico forte em alguns estados
            soma = sum(pesos.values())
            ags = {}
            linhas_c, part_leg, cand_info = [], {}, []
            # cada agremiação (federação ou partido) tem até vg + 1 candidatos
            grupos = {}
            for _, s, _ in PARTIDOS:
                grupos.setdefault(FED_DE[s][0] if s in FED_DE else s, []).append(s)
            for gid, membros in grupos.items():
                n = min(vg + 1, max(2, int((vg + 1) * random.uniform(0.5, 1.0))))
                for i in range(n):
                    s = membros[i % len(membros)]
                    cand_info.append((gid, s))
            nominais_partido = {}
            for gid, s in cand_info:
                sq += 1
                base = validos_alvo * pesos[s] / soma
                v = int(base * random.lognormvariate(-2.2, 1.1))
                genero = "FEMININO" if random.random() < 0.36 else "MASCULINO"
                nasc = f"{random.randint(1,28):02d}/{random.randint(1,12):02d}/{random.randint(1950,2002)}"
                destino = "Válido"
                r = random.random()
                if r < 0.01:
                    destino = "Anulado sub judice"
                elif r < 0.015:
                    destino = "Válido (legenda)"
                nr = int(f"{[p[0] for p in PARTIDOS if p[1] == s][0]}{random.randint(10, 99)}{len(cand_info) % 100:02d}"[:4 if cargo == 6 else 5])
                cand_info_row = (sq, s, v, destino, genero, nasc, nr)
                linhas_c.append(cand_info_row)
                if destino == "Válido":
                    ags.setdefault(gid, [0, []])
                    ags[gid][1].append((v, int(nasc[6:] + nasc[3:5] + nasc[:2]), sq))
                    nominais_partido[s] = nominais_partido.get(s, 0) + v
                elif destino == "Válido (legenda)":
                    part_leg.setdefault(s, [0, 0])[1] += v
            for _, s, _ in PARTIDOS:
                leg = int(nominais_partido.get(s, 0) * random.uniform(0.03, 0.12))
                part_leg.setdefault(s, [0, 0])[0] += leg
            for gid, membros in grupos.items():
                ags.setdefault(gid, [0, []])
                ags[gid][0] = sum(c[0] for c in ags[gid][1]) + sum(sum(part_leg.get(m, [0, 0])) for m in membros)
            oficiais = alocar(vg, {k: (v[0], v[1]) for k, v in ags.items()})
            # grava em duas "zonas" para testar a soma
            for (sqc, s, v, destino, genero, nasc, nr) in linhas_c:
                fed = FED_DE.get(s)
                p = [x for x in PARTIDOS if x[1] == s][0]
                sit = {"QP": "ELEITO POR QP", "MEDIA": "ELEITO POR MÉDIA"}.get(oficiais.get(sqc), "SUPLENTE" if v > 0 else "NÃO ELEITO")
                v1 = v // 3
                for zona, vv in ((1, v1), (2, v - v1)):
                    zc[uf].append([2026, 1, uf, zona, cargo, CARGOS[cargo], sqc, nr, f"CANDIDATO FICTICIO {sqc}",
                                   f"FICTÍCIO {sqc}", p[0], s, p[2], fed[0] if fed else -1, fed[2] if fed else "#NULO#",
                                   fed[1] if fed else "#NULO#", "/".join(fed[3]) if fed else "#NULO#", vv, destino,
                                   vv if destino == "Válido" else 0, sit])
                zk[uf].append([2026, 1, uf, cargo, sqc, genero, nasc])
            tot_nom = sum(c[0] for g in ags.values() for c in g[1])
            tot_leg = 0
            for _, s, nome in PARTIDOS:
                fed = FED_DE.get(s)
                leg, conv = part_leg.get(s, [0, 0])
                tot_leg += leg + conv
                p = [x for x in PARTIDOS if x[1] == s][0]
                zp[uf].append([2026, 1, uf, 1, cargo, p[0], s, nome, fed[0] if fed else -1,
                               fed[2] if fed else "#NULO#", fed[1] if fed else "#NULO#", leg, conv, leg + conv])
            brancos, nulos = int(eleitores * 0.05), int(eleitores * 0.06)
            anul = sum(c[2] for c in linhas_c if c[3].startswith("Anulado"))
            comp = tot_nom + tot_leg + brancos + nulos + anul
            zd[uf].append([2026, 1, uf, 1, cargo, eleitores, comp, eleitores - comp, brancos, nulos, tot_nom, tot_leg, anul])

    def grava(nome, cab, por_uf):
        with zipfile.ZipFile(os.path.join(pasta, f"{nome}_2026.zip"), "w", zipfile.ZIP_DEFLATED) as z:
            for uf, linhas in por_uf.items():
                z.writestr(f"{nome}_2026_{uf}.csv", csv_bytes(cab, linhas))
    grava("votacao_candidato_munzona", cab_c, zc)
    grava("votacao_partido_munzona", cab_p, zp)
    grava("detalhe_votacao_munzona", cab_d, zd)
    grava("consulta_vagas", cab_v, zv)
    grava("consulta_cand", cab_k, zk)
    print(f"ZIPs fictícios gravados em {pasta}/")


if __name__ == "__main__":
    main()
