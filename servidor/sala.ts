/**
 * Sala: estado autoritativo de uma mesa online.
 *
 * Esta classe não conhece rede nem disco — recebe um ator já autenticado e um
 * comando bruto, valida, autoriza, aplica e devolve o resultado. Isso mantém as
 * garantias de permissão testáveis sem subir um servidor.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { executarComando } from '../src/dominio/comandos';
import { criarFonteCripto, type FonteAleatoria } from '../src/dominio/dados';
import { esquemaId, type Ator, type Campanha, type Id } from '../src/dominio/esquema';
import { arquivoVisivelPara, filtrarVisao } from '../src/dominio/visao';

export interface RegistroSala {
  id: Id;
  criadaEm: string;
  /** SHA-256 (hex) do token do mestre. O token em si nunca é gravado. */
  hashMestre: string;
  jogadores: Record<Id, { hash: string; nome: string }>;
  campanha: Campanha;
}

export interface ResultadoExecucao {
  ok: boolean;
  erro: string | null;
  revisao: number;
  /** true quando o comando já tinha sido processado (reenvio com o mesmo id). */
  repetido: boolean;
}

export function novoToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function hashesIguais(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyz';
export function novoIdServidor(): Id {
  const bytes = randomBytes(12);
  let s = '';
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length];
  return s;
}

const LIMITE_IDEMPOTENCIA = 4000;

export interface OpcoesSala {
  fonte?: FonteAleatoria;
  agora?: () => string;
  novoId?: () => Id;
}

export class Sala {
  readonly id: Id;
  readonly criadaEm: string;
  private hashMestre: string;
  private jogadores: Map<Id, { hash: string; nome: string }>;
  private estado: Campanha;
  private readonly processados = new Map<string, ResultadoExecucao>();
  private readonly fonte: FonteAleatoria;
  private readonly agora: () => string;
  private readonly novoId: () => Id;

  constructor(registro: RegistroSala, opcoes: OpcoesSala = {}) {
    this.id = registro.id;
    this.criadaEm = registro.criadaEm;
    this.hashMestre = registro.hashMestre;
    this.jogadores = new Map(Object.entries(registro.jogadores));
    this.estado = registro.campanha;
    this.fonte = opcoes.fonte ?? criarFonteCripto();
    this.agora = opcoes.agora ?? (() => new Date().toISOString());
    this.novoId = opcoes.novoId ?? novoIdServidor;
  }

  /** Cria uma sala nova e devolve o token do mestre (única vez em que ele existe em claro). */
  static criar(campanha: Campanha, opcoes: OpcoesSala = {}): { sala: Sala; tokenMestre: string } {
    const tokenMestre = novoToken();
    const agora = (opcoes.agora ?? (() => new Date().toISOString()))();
    // Jogadores trazidos da campanha local não têm credencial: só entram por convite novo.
    const sala = new Sala(
      { id: `sala_${(opcoes.novoId ?? novoIdServidor)()}`, criadaEm: agora, hashMestre: hashToken(tokenMestre), jogadores: {}, campanha },
      opcoes,
    );
    return { sala, tokenMestre };
  }

  get campanha(): Campanha {
    return this.estado;
  }

  get revisao(): number {
    return this.estado.revisao;
  }

  /** Único ponto em que um papel é atribuído: a partir do token, nunca de dados do cliente. */
  autenticar(token: unknown): Ator | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const hash = hashToken(token);
    if (hashesIguais(hash, this.hashMestre)) return { papel: 'mestre', jogadorId: null, nome: 'Mestre' };
    for (const [jogadorId, registro] of this.jogadores) {
      if (hashesIguais(hash, registro.hash)) {
        // O nome exibido vem do cadastro da mesa, não do cliente.
        const nome = this.estado.jogadores.find((j) => j.id === jogadorId)?.nome ?? registro.nome;
        return { papel: 'jogador', jogadorId, nome };
      }
    }
    return null;
  }

  executar(ator: Ator, idComando: unknown, comando: unknown): ResultadoExecucao {
    if (!esquemaId.safeParse(idComando).success) {
      return { ok: false, erro: 'Identificador de comando inválido.', revisao: this.revisao, repetido: false };
    }
    const chave = `${ator.papel}:${ator.jogadorId ?? ''}:${idComando as string}`;
    const anterior = this.processados.get(chave);
    if (anterior) return { ...anterior, repetido: true };

    const r = executarComando(this.estado, comando, {
      agora: this.agora(),
      novoId: this.novoId,
      fonte: this.fonte,
      ator,
    });
    if (r.ok) this.estado = r.campanha;
    const resultado: ResultadoExecucao = { ok: r.ok, erro: r.ok ? null : r.erro, revisao: this.revisao, repetido: false };
    this.processados.set(chave, resultado);
    if (this.processados.size > LIMITE_IDEMPOTENCIA) {
      const primeira = this.processados.keys().next().value;
      if (primeira !== undefined) this.processados.delete(primeira);
    }
    return resultado;
  }

  visaoPara(ator: Ator): Campanha {
    return filtrarVisao(this.estado, ator, { mascararMapa: true });
  }

  podeLerArquivo(ator: Ator, arquivoId: Id): boolean {
    return arquivoVisivelPara(this.estado, ator, arquivoId);
  }

  criarConvite(nome: string): { jogadorId: Id; nome: string; token: string } | { erro: string } {
    const limpo = nome.trim().slice(0, 60);
    if (!limpo) return { erro: 'Informe o nome do jogador.' };
    const jogadorId = `jog_${this.novoId()}`;
    const r = this.executar({ papel: 'mestre', jogadorId: null, nome: 'Mestre' }, `convite_${this.novoId()}`, {
      tipo: 'jogador.adicionar',
      jogador: { id: jogadorId, nome: limpo },
    });
    if (!r.ok) return { erro: r.erro ?? 'Não foi possível criar o convite.' };
    const token = novoToken();
    this.jogadores.set(jogadorId, { hash: hashToken(token), nome: limpo });
    return { jogadorId, nome: limpo, token };
  }

  /** Gera um novo token para um jogador já cadastrado na campanha (ex.: mesa trazida do modo local). */
  renovarConvite(jogadorId: Id): { jogadorId: Id; nome: string; token: string } | { erro: string } {
    const jogador = this.estado.jogadores.find((j) => j.id === jogadorId);
    if (!jogador) return { erro: 'Jogador não encontrado nesta mesa.' };
    const token = novoToken();
    this.jogadores.set(jogadorId, { hash: hashToken(token), nome: jogador.nome });
    return { jogadorId, nome: jogador.nome, token };
  }

  /** Revoga o acesso: o token deixa de valer imediatamente. O jogador permanece no cadastro da campanha. */
  revogarConvite(jogadorId: Id): boolean {
    return this.jogadores.delete(jogadorId);
  }

  jogadoresComAcesso(): Id[] {
    return [...this.jogadores.keys()];
  }

  serializar(): RegistroSala {
    return {
      id: this.id,
      criadaEm: this.criadaEm,
      hashMestre: this.hashMestre,
      jogadores: Object.fromEntries(this.jogadores),
      campanha: this.estado,
    };
  }
}
