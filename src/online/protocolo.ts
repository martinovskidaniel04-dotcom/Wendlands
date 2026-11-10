/**
 * Contrato da mesa online (compartilhado entre cliente e servidor).
 *
 * Transporte: WebSocket em /ws para estado e comandos; HTTP em /api para criar
 * salas, convites e arquivos. O papel de cada conexão é decidido só pelo
 * servidor, a partir do token apresentado — nenhuma mensagem do cliente o define.
 */
import { z } from 'zod';
import type { Campanha, Id, Papel } from '../dominio/esquema';
import { esquemaId } from '../dominio/esquema';

export const VERSAO_PROTOCOLO = 1;

export const esquemaMensagemCliente = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('entrar'),
    protocolo: z.number().int(),
    salaId: esquemaId,
    token: z.string().min(20).max(200),
  }),
  z.object({
    tipo: z.literal('comando'),
    /** Identificador único do comando: reenvios com o mesmo id não executam de novo. */
    idComando: esquemaId,
    comando: z.unknown(),
  }),
  z.object({ tipo: z.literal('ping') }),
]);
export type MensagemCliente = z.infer<typeof esquemaMensagemCliente>;

export type CodigoErro = 'nao-autorizado' | 'protocolo' | 'limite' | 'sala-encerrada';

export type MensagemServidor =
  | {
      tipo: 'bem-vindo';
      protocolo: number;
      salaId: Id;
      papel: Papel;
      jogadorId: Id | null;
      nome: string;
      revisao: number;
      /** Campanha já filtrada para quem recebe. */
      visao: Campanha;
    }
  | { tipo: 'visao'; revisao: number; visao: Campanha }
  | { tipo: 'resultado'; idComando: Id; ok: boolean; erro: string | null; revisao: number }
  | { tipo: 'erro'; codigo: CodigoErro; mensagem: string }
  | { tipo: 'pong' };

// ───────────────────────── HTTP ─────────────────────────

export interface RespostaSaude {
  ok: true;
  servico: 'wendlands-mesa';
  protocolo: number;
}

/** POST /api/salas — Authorization: Bearer <token de administração>. Corpo: { campanha }. */
export interface RespostaCriarSala {
  salaId: Id;
  /** Mostrado uma única vez. O servidor guarda apenas o hash. */
  tokenMestre: string;
}

/** POST /api/salas/:salaId/convites — Authorization: Bearer <token do mestre>. Corpo: { nome }. */
export interface RespostaConvite {
  jogadorId: Id;
  nome: string;
  /** Mostrado uma única vez. O servidor guarda apenas o hash. */
  token: string;
}

/** GET /api/salas/:salaId/convites */
export interface RespostaListaConvites {
  jogadores: Array<{ jogadorId: Id; nome: string; conectado: boolean }>;
}

export interface RespostaErro {
  erro: string;
}

/** Fragmento de URL usado nos links de entrada: #sala=<id>&token=<token>[&servidor=<url>] */
export function montarLinkDeEntrada(base: string, salaId: Id, token: string, servidor?: string): string {
  const params = new URLSearchParams({ sala: salaId, token });
  if (servidor) params.set('servidor', servidor);
  return `${base.replace(/#.*$/, '')}#${params.toString()}`;
}

export function lerLinkDeEntrada(fragmento: string): { salaId: Id; token: string; servidor: string | null } | null {
  const params = new URLSearchParams(fragmento.replace(/^#/, ''));
  const salaId = params.get('sala');
  const token = params.get('token');
  if (!salaId || !token || !esquemaId.safeParse(salaId).success) return null;
  return { salaId, token, servidor: params.get('servidor') };
}
