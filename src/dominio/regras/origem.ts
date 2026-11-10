/**
 * Sorteio de origem com registro transparente. [origem]
 *
 * As fontes têm dois enunciados não conciliados para a segunda etapa: sorteio
 * equitativo (registro de auditorias, 35/35/15/15) e escolha do jogador (prompt
 * antigo de mestre). O aplicativo oferece os dois caminhos e registra qual foi usado.
 */
import { rolarDado, type FonteAleatoria } from '../dados';
import type { Origem } from '../esquema';

export type FaixaOrigem = 'normal' | 'luzionne-ou-esquecido';
export type FaccaoNormal = '' | 'Sangue de Darion';

export interface PrimeiraEtapa {
  d20: number;
  faixa: FaixaOrigem;
}

export function faixaDoD20(d20: number): FaixaOrigem {
  return d20 <= 14 ? 'normal' : 'luzionne-ou-esquecido';
}

export function sortearFaixa(fonte: FonteAleatoria): PrimeiraEtapa {
  const d20 = rolarDado(20, fonte);
  return { d20, faixa: faixaDoD20(d20) };
}

export interface SegundaEtapa {
  origem: Origem;
  faccao: FaccaoNormal;
  metodo: 'sorteio' | 'escolha';
  /** Face do sorteio equitativo (1 ou 2), quando houve sorteio. */
  dado: number | null;
}

/** Segundo sorteio equitativo dentro da faixa (resulta em 35/35/15/15 no total). */
export function sortearSubgrupo(faixa: FaixaOrigem, fonte: FonteAleatoria): SegundaEtapa {
  const dado = fonte.inteiro(2) + 1;
  if (faixa === 'normal') {
    return { origem: 'normal', faccao: dado === 1 ? '' : 'Sangue de Darion', metodo: 'sorteio', dado };
  }
  return { origem: dado === 1 ? 'luzionne' : 'esquecido', faccao: '', metodo: 'sorteio', dado };
}

export function escolherSubgrupo(faixa: FaixaOrigem, origem: Origem, faccao: FaccaoNormal): SegundaEtapa | null {
  if (faixa === 'normal') {
    if (origem !== 'normal') return null;
    return { origem, faccao, metodo: 'escolha', dado: null };
  }
  if (origem === 'normal') return null;
  return { origem, faccao: '', metodo: 'escolha', dado: null };
}

export function descreverSorteio(primeira: PrimeiraEtapa, segunda: SegundaEtapa): string {
  const faixa =
    primeira.faixa === 'normal' ? '1–14: Normal' : '15–20: Luzionne ou Esquecido';
  const nome = segunda.origem === 'normal' ? 'Normal' : segunda.origem === 'luzionne' ? 'Luzionne' : 'Esquecido';
  const faccao = segunda.origem === 'normal' ? (segunda.faccao ? ', Sangue de Darion' : ', sem facção') : '';
  const etapa2 =
    segunda.metodo === 'sorteio'
      ? `segundo sorteio equitativo (face ${segunda.dado} de 2)`
      : 'escolha na segunda etapa';
  return `Origem sorteada: d20 = ${primeira.d20} (${faixa}); ${etapa2} → ${nome}${faccao}.`;
}

/** Reserva de Yant inata. [ry] */
export function sortearRy(origem: Origem, fonte: FonteAleatoria): { valor: number; detalhe: string } {
  if (origem === 'esquecido') return { valor: 0, detalhe: 'Esquecido: RY 0.' };
  const d6 = rolarDado(6, fonte);
  const base = 8 + d6;
  if (origem === 'normal') return { valor: base, detalhe: `Sorteio: 8 + 1d6 (${d6}) = ${base}.` };
  return { valor: base * 2, detalhe: `Sorteio: dobro de 8 + 1d6 (${d6}) = ${base * 2}.` };
}
