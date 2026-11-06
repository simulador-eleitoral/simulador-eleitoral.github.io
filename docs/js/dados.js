// Converte o formato compacto gravado por scripts/preparar_dados.py em objetos.
// candidato = [sq, nome, numero, partido, votos, genero, nascimento, situacaoOficial]

export function carregarCargo(bruto) {
  return {
    cargo: bruto.cargo,
    vagas: bruto.vagas,
    eleitorado: bruto.eleitorado || {},
    partidos: bruto.partidos,
    candidatos: bruto.candidatos.map(([id, nome, nr, partido, votos, genero, nasc, sit]) => ({
      id, nome, nr, partido, votos, genero, nasc, sit,
      eleitoOficial: sit === 'QP' || sit === 'MEDIA' || sit === 'E',
    })),
  };
}
