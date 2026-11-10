/**
 * Servidor da mesa online: HTTP (/api) + WebSocket (/ws), auto-hospedado.
 *
 * - Autenticação por token (Bearer no HTTP; primeira mensagem no WebSocket).
 * - Autorização, dados e estado sempre no servidor; cada conexão recebe apenas a
 *   visão filtrada para o seu papel.
 * - Persistência em disco com gravação atômica; nenhuma dependência externa.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { esquemaId, type Ator, type Id } from '../src/dominio/esquema';
import { LIMITES_PACOTE, TIPOS_IMAGEM, validarCampanha } from '../src/dominio/pacote';
import {
  VERSAO_PROTOCOLO,
  esquemaMensagemCliente,
  type MensagemServidor,
  type RespostaConvite,
  type RespostaCriarSala,
  type RespostaListaConvites,
  type RespostaSaude,
} from '../src/online/protocolo';
import { Sala, type OpcoesSala, type RegistroSala } from './sala';

export interface OpcoesServidor {
  /** Pasta de dados (salas e arquivos). */
  pastaDados: string;
  /** Token exigido para criar salas. */
  tokenAdmin: string;
  /** Pasta com o build do cliente (dist/), servida como estático quando existir. */
  pastaEstatica?: string | null;
  /** Limite de salas neste servidor. */
  maxSalas?: number;
  opcoesSala?: OpcoesSala;
  registrar?: (linha: string) => void;
}

interface Conexao {
  ws: WebSocket;
  sala: Sala;
  ator: Ator;
  /** Última visão enviada (sem a revisão), para não reenviar o que não mudou. */
  ultimaVisao: string;
  mensagens: number;
  janela: number;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const LIMITE_MENSAGENS_POR_SEGUNDO = 40;
const LIMITE_MENSAGEM_WS = 512 * 1024;
const PRAZO_ENTRADA_MS = 10_000;

function iguaisEmTempoConstante(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}

class ErroHttp extends Error {
  readonly status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

async function lerCorpo(req: IncomingMessage, limite: number): Promise<Buffer> {
  const declarado = Number(req.headers['content-length'] ?? 0);
  if (declarado > limite) throw new ErroHttp(413, 'Conteúdo grande demais.');
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    total += (parte as Buffer).length;
    if (total > limite) throw new ErroHttp(413, 'Conteúdo grande demais.');
    partes.push(parte as Buffer);
  }
  return Buffer.concat(partes);
}

function tokenBearer(req: IncomingMessage): string | null {
  const cabecalho = req.headers.authorization;
  if (!cabecalho || !cabecalho.startsWith('Bearer ')) return null;
  return cabecalho.slice(7).trim() || null;
}

export class ServidorMesa {
  private readonly opcoes: OpcoesServidor;
  private readonly salas = new Map<Id, Sala>();
  private readonly conexoes = new Set<Conexao>();
  private readonly gravacoes = new Map<Id, NodeJS.Timeout>();
  private readonly falhas = new Map<string, { n: number; ate: number }>();
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;

  constructor(opcoes: OpcoesServidor) {
    this.opcoes = opcoes;
  }

  private log(linha: string): void {
    this.opcoes.registrar?.(linha);
  }

  // ───────────── Persistência ─────────────

  private pastaSala(salaId: Id): string {
    return join(this.opcoes.pastaDados, 'salas', salaId);
  }

  private caminhoArquivo(salaId: Id, arquivoId: Id): string {
    return join(this.pastaSala(salaId), 'arquivos', arquivoId);
  }

  async carregar(): Promise<number> {
    const raiz = join(this.opcoes.pastaDados, 'salas');
    await mkdir(raiz, { recursive: true });
    for (const nome of await readdir(raiz)) {
      if (!esquemaId.safeParse(nome).success) continue;
      try {
        const bruto = JSON.parse(await readFile(join(raiz, nome, 'sala.json'), 'utf8')) as RegistroSala;
        const v = validarCampanha(bruto.campanha);
        if (!v.ok) {
          this.log(`Sala ${nome} ignorada: ${v.erro}`);
          continue;
        }
        this.salas.set(bruto.id, new Sala({ ...bruto, campanha: v.campanha }, this.opcoes.opcoesSala));
      } catch (e) {
        this.log(`Sala ${nome} não pôde ser lida: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.salas.size;
  }

  private async gravarAgora(sala: Sala): Promise<void> {
    const pasta = this.pastaSala(sala.id);
    await mkdir(join(pasta, 'arquivos'), { recursive: true });
    const destino = join(pasta, 'sala.json');
    const temporario = `${destino}.${process.pid}.tmp`;
    await writeFile(temporario, JSON.stringify(sala.serializar()));
    await rename(temporario, destino); // troca atômica: nunca fica um arquivo pela metade
  }

  private agendarGravacao(sala: Sala): void {
    if (this.gravacoes.has(sala.id)) return;
    this.gravacoes.set(
      sala.id,
      setTimeout(() => {
        this.gravacoes.delete(sala.id);
        this.gravarAgora(sala).catch((e) => this.log(`Falha ao gravar a sala ${sala.id}: ${e instanceof Error ? e.message : String(e)}`));
      }, 400),
    );
  }

  private async descarregarGravacoes(): Promise<void> {
    for (const [id, temporizador] of this.gravacoes) {
      clearTimeout(temporizador);
      const sala = this.salas.get(id);
      if (sala) await this.gravarAgora(sala).catch(() => undefined);
    }
    this.gravacoes.clear();
  }

  // ───────────── Difusão ─────────────

  private enviar(ws: WebSocket, mensagem: MensagemServidor): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(mensagem));
  }

  /** Envia a cada conexão da sala a sua visão filtrada — somente se ela mudou. */
  private difundir(sala: Sala): void {
    for (const c of this.conexoes) {
      if (c.sala !== sala) continue;
      const visao = sala.visaoPara(c.ator);
      const assinatura = JSON.stringify({ ...visao, revisao: 0, atualizadaEm: '' });
      if (assinatura === c.ultimaVisao) continue;
      c.ultimaVisao = assinatura;
      this.enviar(c.ws, { tipo: 'visao', revisao: sala.revisao, visao });
    }
  }

  private desconectarJogador(sala: Sala, jogadorId: Id): void {
    for (const c of this.conexoes) {
      if (c.sala === sala && c.ator.jogadorId === jogadorId) {
        this.enviar(c.ws, { tipo: 'erro', codigo: 'nao-autorizado', mensagem: 'Seu acesso a esta mesa foi revogado.' });
        c.ws.close(4001, 'acesso revogado');
      }
    }
  }

  // ───────────── Limite de tentativas ─────────────

  private bloqueado(ip: string): boolean {
    const f = this.falhas.get(ip);
    return !!f && f.n >= 20 && f.ate > Date.now();
  }

  private registrarFalha(ip: string): void {
    const agora = Date.now();
    const f = this.falhas.get(ip);
    if (!f || f.ate < agora) this.falhas.set(ip, { n: 1, ate: agora + 60_000 });
    else f.n += 1;
    if (this.falhas.size > 5000) this.falhas.clear();
  }

  // ───────────── HTTP ─────────────

  private responderJson(res: ServerResponse, status: number, corpo: unknown): void {
    const dados = JSON.stringify(corpo);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(dados), 'Cache-Control': 'no-store' });
    res.end(dados);
  }

  private exigirSala(salaId: string): Sala {
    const sala = esquemaId.safeParse(salaId).success ? this.salas.get(salaId) : undefined;
    // Sala inexistente e token errado dão a mesma resposta.
    if (!sala) throw new ErroHttp(401, 'Não autorizado.');
    return sala;
  }

  private exigirAtor(req: IncomingMessage, sala: Sala, ip: string): Ator {
    const ator = sala.autenticar(tokenBearer(req));
    if (!ator) {
      this.registrarFalha(ip);
      throw new ErroHttp(401, 'Não autorizado.');
    }
    return ator;
  }

  private exigirMestre(req: IncomingMessage, sala: Sala, ip: string): Ator {
    const ator = this.exigirAtor(req, sala, ip);
    if (ator.papel !== 'mestre') throw new ErroHttp(403, 'Apenas o mestre pode fazer isso.');
    return ator;
  }

  private async tratarApi(req: IncomingMessage, res: ServerResponse, caminho: string): Promise<void> {
    const ip = req.socket.remoteAddress ?? 'desconhecido';
    if (this.bloqueado(ip)) throw new ErroHttp(429, 'Muitas tentativas. Aguarde um minuto.');
    const partes = caminho.split('/').filter(Boolean); // ['api', ...]
    const metodo = req.method ?? 'GET';

    if (partes.length === 2 && partes[1] === 'saude' && metodo === 'GET') {
      const corpo: RespostaSaude = { ok: true, servico: 'wendlands-mesa', protocolo: VERSAO_PROTOCOLO };
      return this.responderJson(res, 200, corpo);
    }

    if (partes.length === 2 && partes[1] === 'salas' && metodo === 'POST') {
      const token = tokenBearer(req);
      if (!token || !iguaisEmTempoConstante(token, this.opcoes.tokenAdmin)) {
        this.registrarFalha(ip);
        throw new ErroHttp(401, 'Não autorizado.');
      }
      if (this.salas.size >= (this.opcoes.maxSalas ?? 50)) throw new ErroHttp(507, 'Limite de salas deste servidor atingido.');
      let corpo: unknown;
      try {
        corpo = JSON.parse((await lerCorpo(req, LIMITES_PACOTE.dadosJson)).toString('utf8'));
      } catch (e) {
        if (e instanceof ErroHttp) throw e;
        throw new ErroHttp(400, 'JSON inválido.');
      }
      const bruta = (corpo as { campanha?: unknown } | null)?.campanha;
      // As imagens são enviadas depois, uma a uma: a campanha entra sem referências a arquivos ausentes.
      if (typeof bruta === 'object' && bruta !== null) (bruta as { arquivos?: unknown }).arquivos = [];
      const v = validarCampanha(bruta);
      if (!v.ok) throw new ErroHttp(400, v.erro);
      v.campanha.pendencias = [];
      for (const cena of v.campanha.cenas) cena.mapaJogadores = null;
      const { sala, tokenMestre } = Sala.criar(v.campanha, this.opcoes.opcoesSala);
      this.salas.set(sala.id, sala);
      await this.gravarAgora(sala);
      this.log(`Sala criada: ${sala.id}`);
      const resposta: RespostaCriarSala = { salaId: sala.id, tokenMestre };
      return this.responderJson(res, 201, resposta);
    }

    if (partes.length >= 3 && partes[1] === 'salas') {
      const sala = this.exigirSala(partes[2]);
      const resto = partes.slice(3);

      if (resto.length === 0 && metodo === 'DELETE') {
        this.exigirMestre(req, sala, ip);
        for (const c of this.conexoes) {
          if (c.sala === sala) {
            this.enviar(c.ws, { tipo: 'erro', codigo: 'sala-encerrada', mensagem: 'A mesa online foi encerrada pelo mestre.' });
            c.ws.close(4002, 'sala encerrada');
          }
        }
        const pendente = this.gravacoes.get(sala.id);
        if (pendente) clearTimeout(pendente);
        this.gravacoes.delete(sala.id);
        this.salas.delete(sala.id);
        await rm(this.pastaSala(sala.id), { recursive: true, force: true });
        this.log(`Sala encerrada: ${sala.id}`);
        res.writeHead(204).end();
        return;
      }

      if (resto.length === 1 && resto[0] === 'exportar' && metodo === 'GET') {
        this.exigirMestre(req, sala, ip);
        return this.responderJson(res, 200, { campanha: sala.campanha });
      }

      if (resto.length === 1 && resto[0] === 'convites') {
        this.exigirMestre(req, sala, ip);
        if (metodo === 'GET') {
          const comAcesso = new Set(sala.jogadoresComAcesso());
          const conectados = new Set([...this.conexoes].filter((c) => c.sala === sala && c.ator.jogadorId).map((c) => c.ator.jogadorId));
          const corpo: RespostaListaConvites = {
            jogadores: sala.campanha.jogadores
              .filter((j) => comAcesso.has(j.id))
              .map((j) => ({ jogadorId: j.id, nome: j.nome, conectado: conectados.has(j.id) })),
          };
          return this.responderJson(res, 200, corpo);
        }
        if (metodo === 'POST') {
          let corpo: { nome?: unknown; jogadorId?: unknown };
          try {
            corpo = JSON.parse((await lerCorpo(req, 4096)).toString('utf8')) as typeof corpo;
          } catch (e) {
            if (e instanceof ErroHttp) throw e;
            throw new ErroHttp(400, 'JSON inválido.');
          }
          const r =
            typeof corpo?.jogadorId === 'string'
              ? sala.renovarConvite(corpo.jogadorId)
              : sala.criarConvite(typeof corpo?.nome === 'string' ? corpo.nome : '');
          if ('erro' in r) throw new ErroHttp(400, r.erro);
          if (typeof corpo?.jogadorId === 'string') this.desconectarJogador(sala, r.jogadorId);
          this.agendarGravacao(sala);
          this.difundir(sala);
          const resposta: RespostaConvite = r;
          return this.responderJson(res, 201, resposta);
        }
      }

      if (resto.length === 2 && resto[0] === 'convites' && metodo === 'DELETE') {
        this.exigirMestre(req, sala, ip);
        if (!esquemaId.safeParse(resto[1]).success) throw new ErroHttp(400, 'Identificador inválido.');
        sala.revogarConvite(resto[1]);
        this.desconectarJogador(sala, resto[1]);
        this.agendarGravacao(sala);
        res.writeHead(204).end();
        return;
      }

      if (resto.length === 2 && resto[0] === 'arquivos') {
        const arquivoId = resto[1];
        if (!esquemaId.safeParse(arquivoId).success) throw new ErroHttp(400, 'Identificador inválido.');
        if (metodo === 'PUT') {
          this.exigirMestre(req, sala, ip);
          const tipo = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
          if (!(TIPOS_IMAGEM as readonly string[]).includes(tipo)) throw new ErroHttp(415, 'Envie uma imagem PNG, JPEG, WebP, GIF ou AVIF.');
          const dados = await lerCorpo(req, LIMITES_PACOTE.arquivo);
          if (dados.length === 0) throw new ErroHttp(400, 'Arquivo vazio.');
          await mkdir(join(this.pastaSala(sala.id), 'arquivos'), { recursive: true });
          const destino = this.caminhoArquivo(sala.id, arquivoId);
          const temporario = `${destino}.${process.pid}.tmp`;
          await writeFile(temporario, dados);
          await rename(temporario, destino);
          res.writeHead(204).end();
          return;
        }
        if (metodo === 'GET') {
          const ator = this.exigirAtor(req, sala, ip);
          // Jogadores só baixam o que aparece na própria visão; qualquer outro id responde 404.
          const meta = sala.campanha.arquivos.find((a) => a.id === arquivoId);
          if (!meta || !sala.podeLerArquivo(ator, arquivoId)) throw new ErroHttp(404, 'Arquivo não encontrado.');
          const caminhoDisco = this.caminhoArquivo(sala.id, arquivoId);
          let tamanho: number;
          try {
            tamanho = (await stat(caminhoDisco)).size;
          } catch {
            throw new ErroHttp(404, 'Arquivo não encontrado.');
          }
          const tipo = (TIPOS_IMAGEM as readonly string[]).includes(meta.tipo) ? meta.tipo : 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': tipo,
            'Content-Length': tamanho,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          createReadStream(caminhoDisco).pipe(res);
          return;
        }
      }
    }

    throw new ErroHttp(404, 'Rota não encontrada.');
  }

  private async servirEstatico(res: ServerResponse, caminho: string): Promise<void> {
    const raiz = this.opcoes.pastaEstatica;
    if (!raiz) throw new ErroHttp(404, 'Este servidor não está servindo a interface. Gere o build (npm run build) ou acesse a interface por outro endereço.');
    const base = resolve(raiz);
    const relativo = normalize(decodeURIComponent(caminho)).replace(/^([/\\])+/, '');
    let alvo = resolve(base, relativo || 'index.html');
    if (alvo !== base && !alvo.startsWith(base + sep)) throw new ErroHttp(403, 'Caminho inválido.');
    try {
      if ((await stat(alvo)).isDirectory()) alvo = join(alvo, 'index.html');
      await stat(alvo);
    } catch {
      alvo = join(base, 'index.html');
      try {
        await stat(alvo);
      } catch {
        throw new ErroHttp(404, 'Interface não encontrada. Gere o build com "npm run build".');
      }
    }
    const tipo = MIME[extname(alvo).toLowerCase()] ?? 'application/octet-stream';
    const cache = alvo.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    createReadStream(alvo).pipe(res);
  }

  private async tratar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // A autenticação é por token explícito (sem cookies), então CORS aberto não cria risco de CSRF.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const caminho = (req.url ?? '/').split('?')[0];
    try {
      if (caminho === '/api' || caminho.startsWith('/api/')) await this.tratarApi(req, res, caminho);
      else if (req.method === 'GET' || req.method === 'HEAD') await this.servirEstatico(res, caminho);
      else throw new ErroHttp(405, 'Método não permitido.');
    } catch (e) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (e instanceof ErroHttp) this.responderJson(res, e.status, { erro: e.message });
      else {
        this.log(`Erro interno: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
        this.responderJson(res, 500, { erro: 'Erro interno do servidor.' });
      }
    }
  }

  // ───────────── WebSocket ─────────────

  private aceitarConexao(ws: WebSocket, ip: string): void {
    let conexao: Conexao | null = null;
    const prazo = setTimeout(() => {
      if (!conexao) ws.close(4000, 'entrada não recebida');
    }, PRAZO_ENTRADA_MS);

    ws.on('message', (bruto, binario) => {
      if (binario) {
        ws.close(1003, 'apenas texto');
        return;
      }
      let dados: unknown;
      try {
        dados = JSON.parse(bruto.toString());
      } catch {
        this.enviar(ws, { tipo: 'erro', codigo: 'protocolo', mensagem: 'Mensagem ilegível.' });
        return;
      }
      const m = esquemaMensagemCliente.safeParse(dados);
      if (!m.success) {
        this.enviar(ws, { tipo: 'erro', codigo: 'protocolo', mensagem: 'Mensagem fora do protocolo.' });
        return;
      }
      const mensagem = m.data;

      if (!conexao) {
        if (mensagem.tipo !== 'entrar') {
          this.enviar(ws, { tipo: 'erro', codigo: 'nao-autorizado', mensagem: 'Entre na mesa antes de enviar comandos.' });
          return;
        }
        if (this.bloqueado(ip)) {
          this.enviar(ws, { tipo: 'erro', codigo: 'limite', mensagem: 'Muitas tentativas. Aguarde um minuto.' });
          ws.close(4003, 'limite');
          return;
        }
        if (mensagem.protocolo !== VERSAO_PROTOCOLO) {
          this.enviar(ws, { tipo: 'erro', codigo: 'protocolo', mensagem: 'Versão do aplicativo incompatível com este servidor. Recarregue a página.' });
          ws.close(4004, 'protocolo');
          return;
        }
        const sala = this.salas.get(mensagem.salaId);
        const ator = sala?.autenticar(mensagem.token) ?? null;
        if (!sala || !ator) {
          this.registrarFalha(ip);
          this.enviar(ws, { tipo: 'erro', codigo: 'nao-autorizado', mensagem: 'Mesa ou convite inválido.' });
          ws.close(4001, 'não autorizado');
          return;
        }
        clearTimeout(prazo);
        const visao = sala.visaoPara(ator);
        conexao = { ws, sala, ator, ultimaVisao: JSON.stringify({ ...visao, revisao: 0, atualizadaEm: '' }), mensagens: 0, janela: Date.now() };
        this.conexoes.add(conexao);
        this.enviar(ws, {
          tipo: 'bem-vindo',
          protocolo: VERSAO_PROTOCOLO,
          salaId: sala.id,
          papel: ator.papel,
          jogadorId: ator.jogadorId,
          nome: ator.nome,
          revisao: sala.revisao,
          visao,
        });
        return;
      }

      // Limite de mensagens por conexão.
      const agora = Date.now();
      if (agora - conexao.janela > 1000) {
        conexao.janela = agora;
        conexao.mensagens = 0;
      }
      if (++conexao.mensagens > LIMITE_MENSAGENS_POR_SEGUNDO) {
        this.enviar(ws, { tipo: 'erro', codigo: 'limite', mensagem: 'Muitas mensagens em pouco tempo.' });
        ws.close(4003, 'limite');
        return;
      }

      if (mensagem.tipo === 'ping') {
        this.enviar(ws, { tipo: 'pong' });
        return;
      }
      if (mensagem.tipo === 'entrar') return;

      const { sala, ator } = conexao;
      // O ator vem da conexão autenticada; nada no comando pode mudá-lo.
      const antes = sala.campanha;
      const r = sala.executar(ator, mensagem.idComando, mensagem.comando);
      this.enviar(ws, { tipo: 'resultado', idComando: mensagem.idComando, ok: r.ok, erro: r.erro, revisao: r.revisao });
      if (r.ok && !r.repetido) {
        this.removerArquivosOrfaos(sala, antes.arquivos.map((a) => a.id));
        this.agendarGravacao(sala);
        this.difundir(sala);
      }
    });

    ws.on('close', () => {
      clearTimeout(prazo);
      if (conexao) this.conexoes.delete(conexao);
    });
    ws.on('error', () => ws.terminate());
  }

  /** Apaga do disco os arquivos que deixaram de estar registrados na campanha. */
  private removerArquivosOrfaos(sala: Sala, idsAntes: Id[]): void {
    const atuais = new Set(sala.campanha.arquivos.map((a) => a.id));
    for (const id of idsAntes) {
      if (!atuais.has(id)) rm(this.caminhoArquivo(sala.id, id), { force: true }).catch(() => undefined);
    }
  }

  // ───────────── Ciclo de vida ─────────────

  async iniciar(porta: number, endereco = '0.0.0.0'): Promise<number> {
    await this.carregar();
    const http = createServer((req, res) => void this.tratar(req, res));
    const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITE_MENSAGEM_WS });
    http.on('upgrade', (req, socket, cabeca) => {
      if ((req.url ?? '').split('?')[0] !== '/ws') {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, cabeca, (ws) => this.aceitarConexao(ws, req.socket.remoteAddress ?? 'desconhecido'));
    });
    this.http = http;
    this.wss = wss;
    await new Promise<void>((ok, falha) => {
      http.once('error', falha);
      http.listen(porta, endereco, () => ok());
    });
    const escuta = http.address();
    return typeof escuta === 'object' && escuta ? escuta.port : porta;
  }

  async parar(): Promise<void> {
    for (const c of this.conexoes) c.ws.terminate();
    this.conexoes.clear();
    await this.descarregarGravacoes();
    this.wss?.close();
    await new Promise<void>((ok) => (this.http ? this.http.close(() => ok()) : ok()));
    this.http = null;
    this.wss = null;
  }
}
