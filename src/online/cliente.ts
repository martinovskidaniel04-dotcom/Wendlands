/**
 * Cliente da mesa online: WebSocket com reconexão e chamadas HTTP autenticadas.
 * O token viaja no cabeçalho Authorization (HTTP) ou na primeira mensagem (WS) —
 * nunca em URLs de requisição.
 */
import type { Campanha, Id } from '../dominio/esquema';
import {
  VERSAO_PROTOCOLO,
  type MensagemServidor,
  type RespostaConvite,
  type RespostaCriarSala,
  type RespostaListaConvites,
} from './protocolo';

export type EstadoConexao = 'conectando' | 'conectado' | 'reconectando' | 'desconectado';

export interface OuvintesCliente {
  aoEntrar(m: Extract<MensagemServidor, { tipo: 'bem-vindo' }>): void;
  aoVisao(m: Extract<MensagemServidor, { tipo: 'visao' }>): void;
  aoResultado(m: Extract<MensagemServidor, { tipo: 'resultado' }>): void;
  aoEstado(estado: EstadoConexao, erro: string | null): void;
}

export class ErroServidor extends Error {
  readonly status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

/** Normaliza o endereço informado (vazio = mesma origem da página). */
export function normalizarServidor(servidor: string): string {
  const s = servidor.trim().replace(/\/+$/, '');
  if (!s) return window.location.origin;
  return /^https?:\/\//i.test(s) ? s : `http://${s}`;
}

async function pedir(servidor: string, caminho: string, token: string | null, init: RequestInit = {}): Promise<Response> {
  let resposta: Response;
  try {
    resposta = await fetch(`${servidor}${caminho}`, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ErroServidor(0, 'Não foi possível falar com o servidor. Verifique o endereço e se ele está no ar.');
  }
  if (!resposta.ok) {
    let mensagem = `O servidor respondeu com erro ${resposta.status}.`;
    try {
      const corpo = (await resposta.json()) as { erro?: string };
      if (corpo?.erro) mensagem = corpo.erro;
    } catch {
      /* resposta sem JSON */
    }
    throw new ErroServidor(resposta.status, mensagem);
  }
  return resposta;
}

export async function verificarServidor(servidor: string): Promise<void> {
  const r = await pedir(servidor, '/api/saude', null);
  const corpo = (await r.json().catch(() => null)) as { servico?: string; protocolo?: number } | null;
  if (corpo?.servico !== 'wendlands-mesa') throw new ErroServidor(0, 'O endereço respondeu, mas não é um servidor da mesa de Wendlands.');
  if (corpo.protocolo !== VERSAO_PROTOCOLO) throw new ErroServidor(0, 'O servidor usa uma versão de protocolo diferente da deste aplicativo.');
}

export async function criarSala(servidor: string, tokenAdmin: string, campanha: Campanha): Promise<RespostaCriarSala> {
  const r = await pedir(servidor, '/api/salas', tokenAdmin, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campanha }),
  });
  return (await r.json()) as RespostaCriarSala;
}

export class ClienteOnline {
  readonly servidor: string;
  readonly salaId: Id;
  private readonly token: string;
  private readonly ouvintes: OuvintesCliente;
  private ws: WebSocket | null = null;
  private encerrado = false;
  private tentativas = 0;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private batimento: ReturnType<typeof setInterval> | null = null;

  constructor(servidor: string, salaId: Id, token: string, ouvintes: OuvintesCliente) {
    this.servidor = servidor;
    this.salaId = salaId;
    this.token = token;
    this.ouvintes = ouvintes;
  }

  conectar(): void {
    if (this.encerrado) return;
    this.ouvintes.aoEstado(this.tentativas === 0 ? 'conectando' : 'reconectando', null);
    const url = `${this.servidor.replace(/^http/i, 'ws')}/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.agendarReconexao();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ tipo: 'entrar', protocolo: VERSAO_PROTOCOLO, salaId: this.salaId, token: this.token }));
    };
    ws.onmessage = (evento) => {
      let m: MensagemServidor;
      try {
        m = JSON.parse(String(evento.data)) as MensagemServidor;
      } catch {
        return;
      }
      if (m.tipo === 'bem-vindo') {
        this.tentativas = 0;
        this.ouvintes.aoEstado('conectado', null);
        this.ouvintes.aoEntrar(m);
        if (this.batimento) clearInterval(this.batimento);
        this.batimento = setInterval(() => this.enviar({ tipo: 'ping' }), 25_000);
      } else if (m.tipo === 'visao') this.ouvintes.aoVisao(m);
      else if (m.tipo === 'resultado') this.ouvintes.aoResultado(m);
      else if (m.tipo === 'erro') {
        // Erros de autorização, protocolo e encerramento não melhoram com novas tentativas.
        if (m.codigo !== 'limite') this.encerrado = true;
        this.ouvintes.aoEstado('desconectado', m.mensagem);
      }
    };
    ws.onclose = () => {
      if (this.batimento) clearInterval(this.batimento);
      this.batimento = null;
      if (this.ws === ws) this.ws = null;
      if (!this.encerrado) this.agendarReconexao();
    };
    ws.onerror = () => ws.close();
  }

  private agendarReconexao(): void {
    if (this.encerrado) return;
    this.tentativas += 1;
    const espera = Math.min(15_000, 800 * 2 ** Math.min(this.tentativas, 5));
    this.ouvintes.aoEstado('reconectando', null);
    this.temporizador = setTimeout(() => this.conectar(), espera);
  }

  private enviar(mensagem: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(mensagem));
    return true;
  }

  /** Envia um comando; devolve false se a conexão está fora (o chamador reenvia ao reconectar). */
  enviarComando(idComando: Id, comando: unknown): boolean {
    return this.enviar({ tipo: 'comando', idComando, comando });
  }

  fechar(): void {
    this.encerrado = true;
    if (this.temporizador) clearTimeout(this.temporizador);
    if (this.batimento) clearInterval(this.batimento);
    this.ws?.close();
    this.ws = null;
  }

  // ───────────── HTTP ─────────────

  async baixarArquivo(arquivoId: Id): Promise<Blob | null> {
    try {
      const r = await pedir(this.servidor, `/api/salas/${this.salaId}/arquivos/${arquivoId}`, this.token);
      return await r.blob();
    } catch (e) {
      if (e instanceof ErroServidor && e.status === 404) return null;
      throw e;
    }
  }

  async enviarArquivo(arquivoId: Id, dados: ArrayBuffer, tipo: string): Promise<void> {
    await pedir(this.servidor, `/api/salas/${this.salaId}/arquivos/${arquivoId}`, this.token, {
      method: 'PUT',
      headers: { 'Content-Type': tipo },
      body: dados,
    });
  }

  async criarConvite(nome: string): Promise<RespostaConvite> {
    const r = await pedir(this.servidor, `/api/salas/${this.salaId}/convites`, this.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome }),
    });
    return (await r.json()) as RespostaConvite;
  }

  async renovarConvite(jogadorId: Id): Promise<RespostaConvite> {
    const r = await pedir(this.servidor, `/api/salas/${this.salaId}/convites`, this.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jogadorId }),
    });
    return (await r.json()) as RespostaConvite;
  }

  async listarConvites(): Promise<RespostaListaConvites> {
    const r = await pedir(this.servidor, `/api/salas/${this.salaId}/convites`, this.token);
    return (await r.json()) as RespostaListaConvites;
  }

  async revogarConvite(jogadorId: Id): Promise<void> {
    await pedir(this.servidor, `/api/salas/${this.salaId}/convites/${jogadorId}`, this.token, { method: 'DELETE' });
  }

  async encerrarSala(): Promise<void> {
    await pedir(this.servidor, `/api/salas/${this.salaId}`, this.token, { method: 'DELETE' });
  }
}
