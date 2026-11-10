/** Utilitários de teste: contexto determinístico para comandos e regras. */
import { criarFonteDeFaces, type FonteAleatoria } from '../src/dominio/dados';
import { executarComando, type Comando, type ContextoComando } from '../src/dominio/comandos';
import type { Ator, Campanha } from '../src/dominio/esquema';

export const MESTRE: Ator = { papel: 'mestre', jogadorId: null, nome: 'Mestre' };
export const jogador = (id: string, nome = 'Jogador'): Ator => ({ papel: 'jogador', jogadorId: id, nome });

let contador = 0;
export function contexto(ator: Ator = MESTRE, faces: number[] = []): ContextoComando {
  const fonte: FonteAleatoria = criarFonteDeFaces(faces);
  return { agora: '2026-11-10T12:00:00.000Z', novoId: () => `t${++contador}`, fonte, ator };
}

/** Executa um comando e falha o teste se ele for recusado. */
export function exec(c: Campanha, comando: Comando, ator: Ator = MESTRE, faces: number[] = []): Campanha {
  const r = executarComando(c, comando, contexto(ator, faces));
  if (!r.ok) throw new Error(`Comando recusado: ${r.erro}`);
  return r.campanha;
}

/** Executa um comando esperando recusa; devolve a mensagem. */
export function recusa(c: Campanha, comando: unknown, ator: Ator = MESTRE, faces: number[] = []): string {
  const r = executarComando(c, comando, contexto(ator, faces));
  if (r.ok) throw new Error('O comando deveria ter sido recusado.');
  return r.erro;
}
