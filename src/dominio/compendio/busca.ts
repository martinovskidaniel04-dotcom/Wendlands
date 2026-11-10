/**
 * Montagem e busca do compêndio de uma campanha.
 */
import type { Ator, Campanha, CategoriaCompendio, EntradaCompendio, StatusCompendio } from '../esquema';
import { ENTRADAS_EMBUTIDAS, IDS_EMBUTIDOS } from './semente';

export interface EntradaListada extends EntradaCompendio {
  /** true para entradas que vêm com o aplicativo (não editáveis). */
  embutida: boolean;
}

/** Entradas que o ator pode ver, já com a visibilidade efetiva. */
export function entradasDoCompendio(campanha: Campanha, ator: Ator): EntradaListada[] {
  const liberadas = new Set(campanha.compendio.liberadas);
  const lista: EntradaListada[] = [];
  for (const e of ENTRADAS_EMBUTIDAS) {
    const visibilidade = liberadas.has(e.id) ? 'jogadores' : 'mestre';
    if (ator.papel === 'jogador' && visibilidade !== 'jogadores') continue;
    lista.push({ ...e, visibilidade, embutida: true });
  }
  for (const e of campanha.compendio.proprias) {
    if (IDS_EMBUTIDOS.has(e.id)) continue;
    if (ator.papel === 'jogador' && e.visibilidade !== 'jogadores') continue;
    lista.push({ ...e, embutida: false });
  }
  return lista;
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export interface FiltroCompendio {
  consulta: string;
  categoria: CategoriaCompendio | 'todas';
  status: StatusCompendio | 'todos';
}

/** Busca por termos (todos precisam aparecer); título e aliases pesam mais. */
export function buscarNoCompendio(entradas: EntradaListada[], filtro: FiltroCompendio): EntradaListada[] {
  const termos = normalizar(filtro.consulta).split(/\s+/).filter(Boolean);
  const pontuadas: Array<{ e: EntradaListada; pontos: number }> = [];
  for (const e of entradas) {
    if (filtro.categoria !== 'todas' && e.categoria !== filtro.categoria) continue;
    if (filtro.status !== 'todos' && e.status !== filtro.status) continue;
    if (termos.length === 0) {
      pontuadas.push({ e, pontos: 0 });
      continue;
    }
    const titulo = normalizar(`${e.titulo} ${e.aliases.join(' ')}`);
    const resto = normalizar(`${e.resumo} ${e.corpo.join(' ')} ${e.secao} ${e.conflitos.join(' ')}`);
    let pontos = 0;
    let todos = true;
    for (const t of termos) {
      if (titulo.includes(t)) pontos += 10;
      else if (resto.includes(t)) pontos += 1;
      else {
        todos = false;
        break;
      }
    }
    if (todos) pontuadas.push({ e, pontos });
  }
  pontuadas.sort((a, b) => b.pontos - a.pontos || a.e.titulo.localeCompare(b.e.titulo, 'pt-BR'));
  return pontuadas.map((p) => p.e);
}
