/**
 * Armazenamento local (IndexedDB): campanhas e arquivos de imagem por campanha.
 *
 * Imagens são guardadas como ArrayBuffer (mais robusto entre navegadores do que
 * Blob dentro do IndexedDB). Falhas de cota viram ErroArmazenamento, para que a
 * interface avise — nunca há perda silenciosa.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Campanha, Id, MetaArquivo } from '../dominio/esquema';
import { validarCampanha } from '../dominio/pacote';

export interface ResumoCampanha {
  id: Id;
  nome: string;
  atualizadaEm: string;
  excluidaEm: string | null;
  cenas: number;
  fichas: number;
}

interface RegistroCampanha {
  id: Id;
  nome: string;
  atualizadaEm: string;
  excluidaEm: string | null;
  campanha: Campanha;
}

interface RegistroArquivo {
  chave: string;
  campanhaId: Id;
  arquivoId: Id;
  nome: string;
  tipo: string;
  tamanho: number;
  dados: ArrayBuffer;
}

interface Banco extends DBSchema {
  campanhas: { key: string; value: RegistroCampanha };
  arquivos: { key: string; value: RegistroArquivo; indexes: { porCampanha: string } };
  preferencias: { key: string; value: unknown };
}

export class ErroArmazenamento extends Error {
  readonly motivo: 'cota' | 'indisponivel' | 'outro';
  constructor(motivo: 'cota' | 'indisponivel' | 'outro', mensagem: string) {
    super(mensagem);
    this.motivo = motivo;
  }
}

function traduzirErro(e: unknown): ErroArmazenamento {
  if (e instanceof ErroArmazenamento) return e;
  const nome = (e as { name?: string } | null)?.name ?? '';
  if (nome === 'QuotaExceededError') {
    return new ErroArmazenamento(
      'cota',
      'O armazenamento do navegador está cheio. Nada foi perdido do que já estava salvo, mas a última alteração não foi gravada. Exporte um backup e libere espaço (por exemplo, removendo mapas grandes ou campanhas antigas).',
    );
  }
  const detalhe = e instanceof Error ? e.message : String(e);
  return new ErroArmazenamento('outro', `Falha ao acessar o armazenamento local: ${detalhe}`);
}

const chaveArquivo = (campanhaId: Id, arquivoId: Id) => `${campanhaId}:${arquivoId}`;

export class Armazenamento {
  private readonly bd: IDBPDatabase<Banco>;

  private constructor(bd: IDBPDatabase<Banco>) {
    this.bd = bd;
  }

  static async abrir(nome = 'wendlands'): Promise<Armazenamento> {
    if (typeof indexedDB === 'undefined') {
      throw new ErroArmazenamento('indisponivel', 'Este navegador não oferece armazenamento local (IndexedDB). O modo local não pode salvar campanhas aqui.');
    }
    try {
      const bd = await openDB<Banco>(nome, 1, {
        upgrade(base) {
          base.createObjectStore('campanhas', { keyPath: 'id' });
          const arquivos = base.createObjectStore('arquivos', { keyPath: 'chave' });
          arquivos.createIndex('porCampanha', 'campanhaId');
          base.createObjectStore('preferencias');
        },
      });
      return new Armazenamento(bd);
    } catch (e) {
      throw new ErroArmazenamento('indisponivel', `Não foi possível abrir o armazenamento local: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  fechar(): void {
    this.bd.close();
  }

  async listarCampanhas(incluirExcluidas = false): Promise<ResumoCampanha[]> {
    try {
      const todas = await this.bd.getAll('campanhas');
      return todas
        .filter((r) => incluirExcluidas || !r.excluidaEm)
        .map((r) => ({
          id: r.id,
          nome: r.nome,
          atualizadaEm: r.atualizadaEm,
          excluidaEm: r.excluidaEm,
          cenas: r.campanha.cenas.length,
          fichas: r.campanha.fichas.length,
        }))
        .sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm));
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  /** Carrega e valida. Uma campanha gravada por versão incompatível devolve erro explícito. */
  async carregarCampanha(id: Id): Promise<{ ok: true; campanha: Campanha; avisos: string[] } | { ok: false; erro: string }> {
    try {
      const r = await this.bd.get('campanhas', id);
      if (!r) return { ok: false, erro: 'Campanha não encontrada neste navegador.' };
      return validarCampanha(r.campanha);
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  async existeCampanha(id: Id): Promise<boolean> {
    return (await this.bd.getKey('campanhas', id)) !== undefined;
  }

  async salvarCampanha(campanha: Campanha): Promise<void> {
    try {
      const anterior = await this.bd.get('campanhas', campanha.id);
      await this.bd.put('campanhas', {
        id: campanha.id,
        nome: campanha.nome,
        atualizadaEm: campanha.atualizadaEm,
        excluidaEm: anterior?.excluidaEm ?? null,
        campanha,
      });
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  /** Exclusão reversível: a campanha sai da lista, mas pode ser restaurada até a limpeza. */
  async marcarExcluida(id: Id, quando: string | null): Promise<void> {
    try {
      const r = await this.bd.get('campanhas', id);
      if (!r) return;
      r.excluidaEm = quando;
      await this.bd.put('campanhas', r);
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  /** Remove definitivamente a campanha e todos os seus arquivos. */
  async apagarDefinitivamente(id: Id): Promise<void> {
    try {
      const tx = this.bd.transaction(['campanhas', 'arquivos'], 'readwrite');
      await tx.objectStore('campanhas').delete(id);
      const indice = tx.objectStore('arquivos').index('porCampanha');
      for (const chave of await indice.getAllKeys(id)) await tx.objectStore('arquivos').delete(chave);
      await tx.done;
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  /** Apaga de vez as campanhas excluídas há mais de `dias` dias. */
  async limparExcluidas(agora: Date, dias = 7): Promise<number> {
    const limite = agora.getTime() - dias * 86_400_000;
    let n = 0;
    for (const r of await this.listarCampanhas(true)) {
      if (r.excluidaEm && new Date(r.excluidaEm).getTime() < limite) {
        await this.apagarDefinitivamente(r.id);
        n++;
      }
    }
    return n;
  }

  async salvarArquivo(campanhaId: Id, meta: MetaArquivo, dados: ArrayBuffer): Promise<void> {
    try {
      await this.bd.put('arquivos', {
        chave: chaveArquivo(campanhaId, meta.id),
        campanhaId,
        arquivoId: meta.id,
        nome: meta.nome,
        tipo: meta.tipo,
        tamanho: dados.byteLength,
        dados,
      });
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  async lerArquivo(campanhaId: Id, arquivoId: Id): Promise<{ tipo: string; nome: string; dados: ArrayBuffer } | null> {
    try {
      const r = await this.bd.get('arquivos', chaveArquivo(campanhaId, arquivoId));
      return r ? { tipo: r.tipo, nome: r.nome, dados: r.dados } : null;
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  async removerArquivo(campanhaId: Id, arquivoId: Id): Promise<void> {
    try {
      await this.bd.delete('arquivos', chaveArquivo(campanhaId, arquivoId));
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  async idsDeArquivos(campanhaId: Id): Promise<Id[]> {
    const registros = await this.bd.getAllFromIndex('arquivos', 'porCampanha', campanhaId);
    return registros.map((r) => r.arquivoId);
  }

  /** Copia todos os arquivos de uma campanha para outra (usado ao duplicar). */
  async copiarArquivos(origemId: Id, destinoId: Id): Promise<void> {
    try {
      const registros = await this.bd.getAllFromIndex('arquivos', 'porCampanha', origemId);
      const tx = this.bd.transaction('arquivos', 'readwrite');
      for (const r of registros) {
        await tx.store.put({ ...r, chave: chaveArquivo(destinoId, r.arquivoId), campanhaId: destinoId });
      }
      await tx.done;
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  /**
   * Grava uma campanha e seus arquivos numa única transação: ou entra tudo, ou
   * nada (usado em importações, para não deixar uma campanha pela metade).
   */
  async gravarCampanhaComArquivos(
    campanha: Campanha,
    arquivos: Array<{ meta: MetaArquivo; dados: ArrayBuffer }>,
    substituir: boolean,
  ): Promise<void> {
    try {
      const tx = this.bd.transaction(['campanhas', 'arquivos'], 'readwrite');
      const existente = await tx.objectStore('campanhas').get(campanha.id);
      if (existente && !substituir) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new ErroArmazenamento('outro', 'Já existe uma campanha com este identificador. Nada foi alterado.');
      }
      if (existente) {
        const indice = tx.objectStore('arquivos').index('porCampanha');
        for (const chave of await indice.getAllKeys(campanha.id)) await tx.objectStore('arquivos').delete(chave);
      }
      await tx.objectStore('campanhas').put({
        id: campanha.id,
        nome: campanha.nome,
        atualizadaEm: campanha.atualizadaEm,
        excluidaEm: null,
        campanha,
      });
      for (const a of arquivos) {
        await tx.objectStore('arquivos').put({
          chave: chaveArquivo(campanha.id, a.meta.id),
          campanhaId: campanha.id,
          arquivoId: a.meta.id,
          nome: a.meta.nome,
          tipo: a.meta.tipo,
          tamanho: a.dados.byteLength,
          dados: a.dados,
        });
      }
      await tx.done;
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  async lerPreferencia<T>(chave: string): Promise<T | undefined> {
    try {
      return (await this.bd.get('preferencias', chave)) as T | undefined;
    } catch {
      return undefined;
    }
  }

  async gravarPreferencia(chave: string, valor: unknown): Promise<void> {
    try {
      await this.bd.put('preferencias', valor, chave);
    } catch (e) {
      throw traduzirErro(e);
    }
  }
}

/** Uso e cota informados pelo navegador (quando disponíveis). */
export async function estimarArmazenamento(): Promise<{ usado: number; cota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || typeof e.usage !== 'number' || typeof e.quota !== 'number') return null;
    return { usado: e.usage, cota: e.quota };
  } catch {
    return null;
  }
}

export function formatarBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB`;
}
