/**
 * Dados: analisador de expressões limitadas (ex.: "1d20+3", "2d6+2") e rolagem.
 *
 * A expressão é analisada por um analisador próprio — nunca por eval — e a fonte
 * de aleatoriedade é injetável, para que as regras sejam testáveis e para que o
 * servidor seja a única autoridade sobre o resultado na mesa online.
 */
import type { ResultadoRolagem } from './esquema';

export const LADOS_PERMITIDOS = [4, 6, 8, 10, 12, 20, 100] as const;
export const LIMITES_DADOS = {
  comprimento: 60,
  termos: 8,
  dadosPorTermo: 50,
  dadosNoTotal: 100,
  constante: 9999,
} as const;

export interface TermoDado {
  tipo: 'dado';
  sinal: 1 | -1;
  quantidade: number;
  lados: number;
}
export interface TermoConstante {
  tipo: 'constante';
  sinal: 1 | -1;
  valor: number;
}
export type Termo = TermoDado | TermoConstante;

export interface ExpressaoDados {
  termos: Termo[];
  /** Forma normalizada, ex.: "2d6 + 2". */
  texto: string;
}

export type ResultadoAnalise =
  | { ok: true; expressao: ExpressaoDados }
  | { ok: false; erro: string };

function textoTermo(t: Termo): string {
  return t.tipo === 'dado' ? `${t.quantidade}d${t.lados}` : String(t.valor);
}

export function formatarExpressao(termos: Termo[]): string {
  return termos
    .map((t, i) => {
      const corpo = textoTermo(t);
      if (i === 0) return t.sinal === -1 ? `-${corpo}` : corpo;
      return `${t.sinal === -1 ? '-' : '+'} ${corpo}`;
    })
    .join(' ');
}

/** Analisa uma expressão de dados. Qualquer coisa fora da gramática é rejeitada. */
export function analisarExpressao(entrada: string): ResultadoAnalise {
  if (typeof entrada !== 'string') return { ok: false, erro: 'Expressão inválida.' };
  const bruto = entrada.trim().toLowerCase();
  if (bruto.length === 0) return { ok: false, erro: 'Digite uma expressão, como 1d20+3.' };
  if (bruto.length > LIMITES_DADOS.comprimento) {
    return { ok: false, erro: `Expressão longa demais (máximo ${LIMITES_DADOS.comprimento} caracteres).` };
  }
  // Espaços só são aceitos entre termos e operadores, nunca dentro de um número ou dado.
  const s = bruto;
  const termos: Termo[] = [];
  let i = 0;
  let totalDados = 0;
  const pularEspacos = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };

  const lerInteiro = (): number | null => {
    const inicio = i;
    while (i < s.length && s[i] >= '0' && s[i] <= '9') i++;
    if (i === inicio) return null;
    if (i - inicio > 5) return Number.NaN;
    return Number(s.slice(inicio, i));
  };

  while (i < s.length) {
    let sinal: 1 | -1 = 1;
    const c = s[i];
    if (c === '+' || c === '-') {
      sinal = c === '-' ? -1 : 1;
      i++;
      pularEspacos();
    } else if (termos.length > 0) {
      return { ok: false, erro: `Esperava "+" ou "-" na posição ${i + 1}.` };
    }
    if (i >= s.length) return { ok: false, erro: 'A expressão termina com um operador.' };

    const n = lerInteiro();
    if (n !== null && Number.isNaN(n)) return { ok: false, erro: 'Número grande demais.' };

    if (s[i] === 'd') {
      i++;
      const lados = lerInteiro();
      if (lados === null || Number.isNaN(lados)) {
        return { ok: false, erro: 'Informe o tipo do dado depois de "d" (ex.: d20).' };
      }
      if (!(LADOS_PERMITIDOS as readonly number[]).includes(lados)) {
        return { ok: false, erro: `Dado d${lados} não disponível. Use ${LADOS_PERMITIDOS.map((l) => `d${l}`).join(', ')}.` };
      }
      const quantidade = n === null ? 1 : n;
      if (quantidade < 1) return { ok: false, erro: 'A quantidade de dados deve ser ao menos 1.' };
      if (quantidade > LIMITES_DADOS.dadosPorTermo) {
        return { ok: false, erro: `No máximo ${LIMITES_DADOS.dadosPorTermo} dados por termo.` };
      }
      totalDados += quantidade;
      termos.push({ tipo: 'dado', sinal, quantidade, lados });
    } else if (n !== null) {
      if (n > LIMITES_DADOS.constante) {
        return { ok: false, erro: `Modificador acima do limite (${LIMITES_DADOS.constante}).` };
      }
      termos.push({ tipo: 'constante', sinal, valor: n });
    } else {
      return { ok: false, erro: `Caractere não reconhecido: "${s[i]}".` };
    }

    if (termos.length > LIMITES_DADOS.termos) {
      return { ok: false, erro: `No máximo ${LIMITES_DADOS.termos} termos por expressão.` };
    }
    pularEspacos();
  }

  if (termos.length === 0) return { ok: false, erro: 'Expressão vazia.' };
  if (totalDados > LIMITES_DADOS.dadosNoTotal) {
    return { ok: false, erro: `No máximo ${LIMITES_DADOS.dadosNoTotal} dados por rolagem.` };
  }
  return { ok: true, expressao: { termos, texto: formatarExpressao(termos) } };
}

/** Fonte de inteiros uniformes em [0, maxExclusivo). */
export interface FonteAleatoria {
  inteiro(maxExclusivo: number): number;
}

/**
 * Fonte criptográfica com amostragem por rejeição (sem viés de módulo).
 * Usa Web Crypto, disponível no navegador e no Node.
 */
export function criarFonteCripto(): FonteAleatoria {
  const cripto = globalThis.crypto;
  if (!cripto?.getRandomValues) {
    throw new Error('Fonte aleatória segura indisponível neste ambiente.');
  }
  const buffer = new Uint32Array(1);
  return {
    inteiro(maxExclusivo: number): number {
      if (!Number.isInteger(maxExclusivo) || maxExclusivo < 1 || maxExclusivo > 0x1_0000_0000) {
        throw new Error('Limite inválido para a fonte aleatória.');
      }
      const limite = Math.floor(0x1_0000_0000 / maxExclusivo) * maxExclusivo;
      for (;;) {
        cripto.getRandomValues(buffer);
        if (buffer[0] < limite) return buffer[0] % maxExclusivo;
      }
    },
  };
}

/** Fonte determinística para testes: devolve as faces informadas, em ordem. */
export function criarFonteDeFaces(faces: number[]): FonteAleatoria {
  let i = 0;
  return {
    inteiro(maxExclusivo: number): number {
      if (i >= faces.length) throw new Error('A sequência de faces de teste acabou.');
      const face = faces[i++];
      if (face < 1 || face > maxExclusivo) throw new Error(`Face ${face} inválida para d${maxExclusivo}.`);
      return face - 1;
    },
  };
}

export function rolarDado(lados: number, fonte: FonteAleatoria): number {
  return fonte.inteiro(lados) + 1;
}

export function rolar(expressao: ExpressaoDados, fonte: FonteAleatoria): ResultadoRolagem {
  let total = 0;
  let modificador = 0;
  const termos = expressao.termos.map((t) => {
    if (t.tipo === 'constante') {
      const subtotal = t.sinal * t.valor;
      modificador += subtotal;
      total += subtotal;
      return { texto: textoTermo(t), sinal: t.sinal, dados: [], descartados: [], subtotal };
    }
    const dados: number[] = [];
    for (let k = 0; k < t.quantidade; k++) dados.push(rolarDado(t.lados, fonte));
    const subtotal = t.sinal * dados.reduce((a, b) => a + b, 0);
    total += subtotal;
    return { texto: textoTermo(t), sinal: t.sinal, dados, descartados: [], subtotal };
  });
  return { expressao: expressao.texto, termos, modificador, total };
}

/**
 * d20 + modificador. Com `doisDadosMaior`, rola 2d20 e fica com o maior —
 * usado somente em testes de força bruta pura de Esquecidos.
 */
export function rolarD20(
  modificador: number,
  fonte: FonteAleatoria,
  doisDadosMaior = false,
): ResultadoRolagem & { natural: number } {
  const primeiro = rolarDado(20, fonte);
  let natural = primeiro;
  const descartados: number[] = [];
  if (doisDadosMaior) {
    const segundo = rolarDado(20, fonte);
    natural = Math.max(primeiro, segundo);
    descartados.push(Math.min(primeiro, segundo));
  }
  const termos: ResultadoRolagem['termos'] = [
    { texto: doisDadosMaior ? '2d20 (maior)' : '1d20', sinal: 1, dados: [natural], descartados, subtotal: natural },
  ];
  if (modificador !== 0) {
    termos.push({
      texto: String(Math.abs(modificador)),
      sinal: modificador < 0 ? -1 : 1,
      dados: [],
      descartados: [],
      subtotal: modificador,
    });
  }
  const sinalTexto = modificador === 0 ? '' : modificador > 0 ? ` + ${modificador}` : ` - ${-modificador}`;
  return {
    expressao: `${doisDadosMaior ? '2d20 (maior)' : '1d20'}${sinalTexto}`,
    termos,
    modificador,
    total: natural + modificador,
    natural,
  };
}

/** Texto compacto de uma rolagem: "14 + 3 = 17". */
export function descreverRolagem(r: ResultadoRolagem): string {
  const partes: string[] = [];
  r.termos.forEach((t, i) => {
    const corpo = t.dados.length > 0 ? (t.dados.length > 1 ? `(${t.dados.join(' + ')})` : String(t.dados[0])) : t.texto;
    const descarte = t.descartados.length > 0 ? ` [descartado ${t.descartados.join(', ')}]` : '';
    if (i === 0) partes.push(`${t.sinal === -1 ? '-' : ''}${corpo}${descarte}`);
    else partes.push(`${t.sinal === -1 ? '-' : '+'} ${corpo}${descarte}`);
  });
  return `${partes.join(' ')} = ${r.total}`;
}
