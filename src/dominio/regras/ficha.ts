/**
 * Regras puras de ficha: fórmulas aprovadas, valores derivados e validações.
 * Referências: ver regras/referencias.ts (ids entre colchetes nos comentários).
 */
import type {
  AjusteManual,
  Atributos,
  ChaveAtributo,
  ChaveRecurso,
  Ficha,
  Origem,
} from '../esquema';

export const PONTOS_CRIACAO = 8;
export const TETO_CRIACAO = 4;
export const TETO_ATRIBUTO = 6;
export const TETO_DEFESA_EQUIPAMENTO = 4;
export const REDUCAO_NATURAL_ESQUECIDO = 3;
export const TETO_REDUCAO_ESQUECIDO = 6;

export const CUSTO_GRAU_YANT: Record<number, number> = { 1: 2, 2: 4, 3: 7, 4: 12 };
export const NIVEL_GRAU_YANT: Record<number, number> = { 1: 1, 2: 5, 3: 10, 4: 15 };
export const CUSTO_CATEGORIA_FISICA = { especial: 2, avancada: 4, suprema: 7 } as const;
export const NIVEL_CATEGORIA_FISICA = { especial: 1, avancada: 5, suprema: 10 } as const;
export const ROTULO_GRAU = ['', 'I', 'II', 'III', 'IV'];

export const NOME_ORIGEM: Record<Origem, string> = {
  normal: 'Normal',
  luzionne: 'Luzionne',
  esquecido: 'Esquecido',
};
export const NOME_ATRIBUTO: Record<ChaveAtributo, string> = {
  fis: 'Físico',
  des: 'Destreza',
  men: 'Mente',
  yan: 'Yant',
};
export const SIGLA_ATRIBUTO: Record<ChaveAtributo, string> = { fis: 'FIS', des: 'DES', men: 'MEN', yan: 'YAN' };
export const NOME_RECURSO: Record<ChaveRecurso, string> = { pv: 'PV', vig: 'VIG', ry: 'RY' };

/** Atributos permanentes: base de criação + aumentos de nível (teto +6). [criacao-atributos] */
export function atributosPermanentes(f: Pick<Ficha, 'atributosBase' | 'aumentos' | 'origem'>): Atributos {
  const a: Atributos = { ...f.atributosBase };
  for (const aumento of f.aumentos) a[aumento.atributo] += 1;
  if (f.origem === 'esquecido') a.yan = 0;
  return a;
}

/** [pv-vig] */
export function pvMaximoCalculado(origem: Origem, fis: number, nivel: number): number {
  const n = nivel - 1;
  if (origem === 'normal') return 20 + 2 * fis + 4 * n;
  if (origem === 'luzionne') return 18 + 2 * fis + 3 * n;
  return 24 + 2 * fis + 5 * n;
}

/** [pv-vig] */
export function vigMaximaCalculada(fis: number): number {
  return 10 + 2 * fis;
}

/** [carga] */
export function cargaCalculada(origem: Origem, fis: number): number {
  return origem === 'esquecido' ? 16 + 4 * fis : 8 + 2 * fis;
}

function somaAjustes(ajustes: AjusteManual[], alvo: AjusteManual['alvo']): number {
  return ajustes.filter((a) => a.alvo === alvo).reduce((s, a) => s + a.valor, 0);
}

export interface ValorDerivado {
  /** Resultado da fórmula aprovada. */
  calculado: number;
  /** Soma dos ajustes manuais registrados pelo mestre. */
  ajuste: number;
  total: number;
}

function derivado(calculado: number, ajuste: number, minimo = 0): ValorDerivado {
  return { calculado, ajuste, total: Math.max(minimo, calculado + ajuste) };
}

export interface Derivados {
  atributos: Atributos;
  /** Atributos usados em testes (inclui −2 MEN/YAN com RY 0, quando aplicável). */
  atributosTeste: Atributos;
  pvMax: ValorDerivado;
  vigMax: ValorDerivado;
  ryMax: ValorDerivado;
  defesa: ValorDerivado & { equipamento: number; equipamentoBruto: number };
  reducao: ValorDerivado & { armadura: number; natural: number };
  carga: ValorDerivado & { usada: number };
  /** 'ativa' | 'inativa' | 'pendente' (Esquecidos: aplicação não esclarecida). */
  penalidadeRyZero: 'ativa' | 'inativa' | 'pendente';
  grauYantMaximo: number;
  categoriasFisicas: Array<keyof typeof CUSTO_CATEGORIA_FISICA>;
}

export function derivar(f: Ficha): Derivados {
  const atributos = atributosPermanentes(f);
  const pvMax = derivado(pvMaximoCalculado(f.origem, atributos.fis, f.nivel), somaAjustes(f.ajustes, 'pvMax'), 1);
  const vigMax = derivado(vigMaximaCalculada(atributos.fis), somaAjustes(f.ajustes, 'vigMax'));
  const ryMax = derivado(f.origem === 'esquecido' ? 0 : f.ryBase, f.origem === 'esquecido' ? 0 : somaAjustes(f.ajustes, 'ryMax'));

  // [armaduras] somente itens equipados; conta a melhor armadura e um escudo.
  const armaduras = f.equipamento.filter((i) => i.equipado && i.tipo === 'armadura' && i.categoria);
  const valorArmadura = (c: string | null) => (c === 'leve' ? 1 : c === 'media' ? 2 : c === 'pesada' ? 3 : 0);
  const armadura = armaduras.reduce((m, i) => Math.max(m, valorArmadura(i.categoria)), 0);
  const escudo = f.equipamento.some((i) => i.equipado && i.tipo === 'escudo') ? 1 : 0;
  const equipamentoBruto = armadura + escudo;
  const equipamento = Math.min(TETO_DEFESA_EQUIPAMENTO, equipamentoBruto);
  const defesaCalc = 10 + atributos.des + equipamento;
  const defesa = { ...derivado(defesaCalc, somaAjustes(f.ajustes, 'defesa')), equipamento, equipamentoBruto };

  const natural = f.origem === 'esquecido' ? REDUCAO_NATURAL_ESQUECIDO : 0;
  const reducaoCalc = f.origem === 'esquecido' ? Math.min(TETO_REDUCAO_ESQUECIDO, natural + armadura) : armadura;
  const reducao = { ...derivado(reducaoCalc, somaAjustes(f.ajustes, 'reducao')), armadura, natural };

  const usada = f.equipamento.reduce((s, i) => s + i.espacos * i.quantidade, 0);
  const carga = { ...derivado(cargaCalculada(f.origem, atributos.fis), somaAjustes(f.ajustes, 'carga')), usada };

  // [ry-zero] −2 MEN/YAN com RY 0; para Esquecidos a aplicação está pendente.
  let penalidadeRyZero: Derivados['penalidadeRyZero'] = 'inativa';
  if (f.origem === 'esquecido') penalidadeRyZero = 'pendente';
  else if (ryMax.total > 0 && f.ryAtual === 0) penalidadeRyZero = 'ativa';
  const atributosTeste: Atributos = { ...atributos };
  if (penalidadeRyZero === 'ativa') {
    atributosTeste.men -= 2;
    atributosTeste.yan -= 2;
  }

  // [graus-yant]
  let grauYantMaximo = 0;
  if (f.origem !== 'esquecido') {
    for (const g of [1, 2, 3, 4]) if (f.nivel >= NIVEL_GRAU_YANT[g]) grauYantMaximo = g;
    if (f.origem === 'normal' && grauYantMaximo === 4 && ryMax.total < 12) grauYantMaximo = 3;
  }
  const categoriasFisicas = (Object.keys(NIVEL_CATEGORIA_FISICA) as Array<keyof typeof NIVEL_CATEGORIA_FISICA>).filter(
    (c) => f.nivel >= NIVEL_CATEGORIA_FISICA[c],
  );

  return {
    atributos,
    atributosTeste,
    pvMax,
    vigMax,
    ryMax,
    defesa,
    reducao,
    carga,
    penalidadeRyZero,
    grauYantMaximo,
    categoriasFisicas,
  };
}

export function maximoRecurso(d: Derivados, recurso: ChaveRecurso): number {
  return recurso === 'pv' ? d.pvMax.total : recurso === 'vig' ? d.vigMax.total : d.ryMax.total;
}

export function valorAtual(f: Ficha, recurso: ChaveRecurso): number {
  return recurso === 'pv' ? f.pvAtual : recurso === 'vig' ? f.vigAtual : f.ryAtual;
}

/** Problemas da distribuição de criação segundo a regra aprovada. [criacao-atributos] */
export function validarCriacao(origem: Origem, base: Atributos): string[] {
  const erros: string[] = [];
  const chaves: ChaveAtributo[] = ['fis', 'des', 'men', 'yan'];
  for (const c of chaves) {
    if (base[c] < 0) erros.push(`${SIGLA_ATRIBUTO[c]} não pode ficar abaixo de 0 na criação.`);
    if (base[c] > TETO_CRIACAO) erros.push(`${SIGLA_ATRIBUTO[c]} acima do máximo de +${TETO_CRIACAO} na criação.`);
  }
  if (origem === 'esquecido' && base.yan !== 0) erros.push('Esquecidos mantêm YAN 0.');
  const soma = chaves.reduce((s, c) => s + base[c], 0);
  if (soma !== PONTOS_CRIACAO) {
    erros.push(`A distribuição soma ${soma}; a regra pede exatamente ${PONTOS_CRIACAO} pontos.`);
  }
  return erros;
}

/** Vagas de técnicas por nível, para conferência (não bloqueia a ficha). */
export function vagasTecnicas(origem: Origem, nivel: number) {
  const marcos = [3, 5, 7, 10, 12, 15, 18, 20];
  const porNivel = 2 + marcos.filter((m) => nivel >= m).length;
  const adaptabilidade = origem === 'normal' ? [1, 5, 10, 15].filter((m) => nivel >= m).length : 0;
  const limiteExtras = nivel >= 20 ? 5 : nivel >= 15 ? 4 : nivel >= 10 ? 3 : nivel >= 5 ? 2 : 1;
  return {
    yantComuns: origem === 'esquecido' ? 0 : porNivel,
    yantAdaptabilidade: adaptabilidade,
    fisicas: porNivel,
    limiteFisicasExtras: limiteExtras,
  };
}

/** Verifica se a ficha pode pagar e usar um grau de Yant. [graus-yant] */
export function verificarGrauYant(f: Ficha, grau: number): { ok: true; custo: number } | { ok: false; erro: string } {
  const d = derivar(f);
  if (f.origem === 'esquecido') return { ok: false, erro: 'Esquecidos não usam Yant.' };
  const custo = CUSTO_GRAU_YANT[grau];
  if (!custo) return { ok: false, erro: 'Grau inválido.' };
  if (f.nivel < NIVEL_GRAU_YANT[grau]) {
    return { ok: false, erro: `Grau ${ROTULO_GRAU[grau]} é liberado no nível ${NIVEL_GRAU_YANT[grau]}.` };
  }
  if (grau === 4 && f.origem === 'normal' && d.ryMax.total < 12) {
    return { ok: false, erro: 'Grau IV é inacessível a Normais com reserva menor que 12.' };
  }
  if (f.ryAtual < custo) return { ok: false, erro: `RY insuficiente: custo ${custo}, disponível ${f.ryAtual}.` };
  return { ok: true, custo };
}

/** Garante que os valores atuais não ultrapassem os máximos derivados. */
export function limitarRecursos(f: Ficha): void {
  const d = derivar(f);
  f.pvAtual = Math.min(Math.max(0, f.pvAtual), d.pvMax.total);
  f.vigAtual = Math.min(Math.max(0, f.vigAtual), d.vigMax.total);
  f.ryAtual = Math.min(Math.max(0, f.ryAtual), d.ryMax.total);
}

export function formatarModificador(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
