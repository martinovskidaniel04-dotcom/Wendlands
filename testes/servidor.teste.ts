import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { Campanha } from '../src/dominio/esquema';
import { campanhaVazia, gradePadrao, novaCena, novaFicha, novoToken } from '../src/dominio/fabrica';
import { VERSAO_PROTOCOLO, type MensagemServidor } from '../src/online/protocolo';
import { Sala } from '../servidor/sala';
import { ServidorMesa } from '../servidor/servidor';
import { exec } from './apoio';

const ADMIN = 'token-de-administracao-de-teste';

/** Campanha local do mestre, antes de virar sala: um PJ, um PNJ escondido e um mapa importado. */
function campanhaDoMestre(): Campanha {
  let c = campanhaVazia('Mesa online');
  const pj = novaFicha({ id: 'ficha_pj', nome: 'Viajante', origem: 'esquecido', atributosBase: { fis: 3, des: 3, men: 2, yan: 0 }, notasPrivadas: 'anotacao-privada-do-pj', notasMestre: 'nota-secreta-do-mestre' });
  const pj2 = novaFicha({ id: 'ficha_pj2', nome: 'Andarilha', origem: 'normal', atributosBase: { fis: 2, des: 2, men: 2, yan: 2 }, ryBase: 11, notasPrivadas: 'anotacao-privada-do-pj2' });
  const pnj = novaFicha({ id: 'ficha_pnj', nome: 'Sentinela', tipo: 'pnj', origem: 'luzionne', atributosBase: { fis: 2, des: 2, men: 2, yan: 2 }, ryBase: 20, compartilhamento: 'oculta', notasMestre: 'plano-da-emboscada' });
  for (const f of [pj, pj2, pnj]) c = exec(c, { tipo: 'ficha.criar', ficha: f });
  const cena = novaCena({ id: 'cena_beco', nome: 'Beco', largura: 500, altura: 500, grade: gradePadrao(50), notaMestre: 'anotacao-da-cena' });
  cena.tokens.push(
    novoToken({ id: 'tok_pj', nome: 'Viajante', x: 75, y: 75, fichaId: 'ficha_pj' }),
    novoToken({ id: 'tok_pj2', nome: 'Andarilha', x: 125, y: 75, fichaId: 'ficha_pj2' }),
    novoToken({ id: 'tok_pnj', nome: 'Sentinela', x: 425, y: 425, fichaId: 'ficha_pnj' }),
  );
  cena.nevoa = ['8,8', '8,7', '7,8', '7,7'];
  c = exec(c, { tipo: 'cena.criar', cena });
  c = exec(c, { tipo: 'cena.criar', cena: novaCena({ id: 'cena_futura', nome: 'Cena futura', notaMestre: 'reviravolta' }) });
  return c;
}

class Cliente {
  readonly ws: WebSocket;
  readonly recebidas: MensagemServidor[] = [];
  private espera: Array<{ teste: (m: MensagemServidor) => boolean; ok: (m: MensagemServidor) => void }> = [];
  fechado: Promise<number>;
  private readonly abertura: Promise<void>;
  private n = 0;

  constructor(porta: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${porta}/ws`);
    this.fechado = new Promise((ok) => this.ws.on('close', (codigo) => ok(codigo)));
    this.abertura = new Promise((ok, falha) => {
      this.ws.once('open', () => ok());
      this.ws.once('error', falha);
    });
    this.ws.on('message', (dados) => {
      const m = JSON.parse(dados.toString()) as MensagemServidor;
      this.recebidas.push(m);
      this.espera = this.espera.filter((e) => {
        if (!e.teste(m)) return true;
        e.ok(m);
        return false;
      });
    });
  }

  aberto(): Promise<void> {
    return this.abertura;
  }

  proxima<T extends MensagemServidor['tipo']>(tipo: T, extra: (m: Extract<MensagemServidor, { tipo: T }>) => boolean = () => true) {
    return new Promise<Extract<MensagemServidor, { tipo: T }>>((ok, falha) => {
      const prazo = setTimeout(() => falha(new Error(`Sem mensagem "${tipo}" em 3 s`)), 3000);
      this.espera.push({
        teste: (m) => m.tipo === tipo && extra(m as Extract<MensagemServidor, { tipo: T }>),
        ok: (m) => {
          clearTimeout(prazo);
          ok(m as Extract<MensagemServidor, { tipo: T }>);
        },
      });
    });
  }

  enviar(mensagem: unknown): void {
    this.ws.send(JSON.stringify(mensagem));
  }

  async entrar(salaId: string, token: string) {
    await this.aberto();
    const resposta = this.proxima('bem-vindo');
    this.enviar({ tipo: 'entrar', protocolo: VERSAO_PROTOCOLO, salaId, token });
    return resposta;
  }

  async comando(comando: unknown, idComando = `c${++this.n}_${Math.random().toString(36).slice(2, 8)}`) {
    const resposta = this.proxima('resultado', (m) => m.idComando === idComando);
    this.enviar({ tipo: 'comando', idComando, comando });
    return resposta;
  }
}

describe('servidor da mesa online', () => {
  let pasta: string;
  let servidor: ServidorMesa;
  let porta: number;
  let base: string;
  let salaId: string;
  let tokenMestre: string;
  let ana: { jogadorId: string; token: string };
  let beto: { jogadorId: string; token: string };
  let mestre: Cliente;

  const api = (caminho: string, opcoes: RequestInit & { token?: string } = {}) =>
    fetch(`${base}${caminho}`, { ...opcoes, headers: { ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}), ...(opcoes.headers ?? {}) } });

  beforeAll(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'wendlands-teste-'));
    servidor = new ServidorMesa({ pastaDados: pasta, tokenAdmin: ADMIN });
    porta = await servidor.iniciar(0, '127.0.0.1');
    base = `http://127.0.0.1:${porta}`;

    const criada = await api('/api/salas', { method: 'POST', token: ADMIN, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campanha: campanhaDoMestre() }) });
    expect(criada.status).toBe(201);
    ({ salaId, tokenMestre } = (await criada.json()) as { salaId: string; tokenMestre: string });

    const convidar = async (nome: string) => {
      const r = await api(`/api/salas/${salaId}/convites`, { method: 'POST', token: tokenMestre, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
      expect(r.status).toBe(201);
      return (await r.json()) as { jogadorId: string; token: string };
    };
    ana = await convidar('Ana');
    beto = await convidar('Beto');

    mestre = new Cliente(porta);
    const ola = await mestre.entrar(salaId, tokenMestre);
    expect(ola.papel).toBe('mestre');
    // O mestre entrega o PJ à Ana e o segundo PJ ao Beto.
    expect((await mestre.comando({ tipo: 'ficha.atualizar', fichaId: 'ficha_pj', alteracoes: { donoJogadorId: ana.jogadorId } })).ok).toBe(true);
    expect((await mestre.comando({ tipo: 'ficha.atualizar', fichaId: 'ficha_pj2', alteracoes: { donoJogadorId: beto.jogadorId } })).ok).toBe(true);
  });

  afterAll(async () => {
    await servidor.parar();
    await rm(pasta, { recursive: true, force: true });
  });

  it('criar sala exige o token de administração', async () => {
    const corpo = JSON.stringify({ campanha: campanhaVazia('Intrusa') });
    expect((await api('/api/salas', { method: 'POST', body: corpo })).status).toBe(401);
    expect((await api('/api/salas', { method: 'POST', token: 'errado', body: corpo })).status).toBe(401);
    expect((await api('/api/salas', { method: 'POST', token: ana.token, body: corpo })).status).toBe(401);
    expect((await api('/api/salas', { method: 'POST', token: ADMIN, body: '{"campanha":{"versaoEsquema":1}}' })).status).toBe(400);
    expect((await (await api('/api/saude')).json())).toMatchObject({ ok: true, protocolo: VERSAO_PROTOCOLO });
  });

  it('critério F: a resposta enviada ao jogador não contém dados privados', async () => {
    const cliente = new Cliente(porta);
    const ola = await cliente.entrar(salaId, ana.token);
    expect(ola).toMatchObject({ papel: 'jogador', jogadorId: ana.jogadorId, nome: 'Ana' });
    const bruto = JSON.stringify(cliente.recebidas);
    for (const segredo of ['tok_pnj', 'Sentinela', 'ficha_pnj', 'plano-da-emboscada', 'nota-secreta-do-mestre', 'anotacao-da-cena',
      'cena_futura', 'Cena futura', 'reviravolta', 'anotacao-privada-do-pj2', '425']) {
      expect(bruto, segredo).not.toContain(segredo);
    }
    expect(bruto).toContain('anotacao-privada-do-pj'); // a nota privada da própria ficha chega
    expect(ola.visao.cenas.map((c) => c.id)).toEqual(['cena_beco']);
    expect(ola.visao.cenas[0].tokens.map((t) => t.id).sort()).toEqual(['tok_pj', 'tok_pj2']);
    // O mestre recebe tudo.
    const doMestre = mestre.recebidas.find((m) => m.tipo === 'bem-vindo')!;
    expect(JSON.stringify(doMestre)).toContain('plano-da-emboscada');
    cliente.ws.close();
  });

  it('critério F: jogador não move token alheio nem escondido, e o estado não muda', async () => {
    const cliente = new Cliente(porta);
    await cliente.entrar(salaId, ana.token);
    for (const tokenId of ['tok_pj2', 'tok_pnj', 'nao_existe']) {
      const r = await cliente.comando({ tipo: 'token.mover', cenaId: 'cena_beco', movimentos: [{ tokenId, x: 10, y: 10 }] });
      expect(r.ok, tokenId).toBe(false);
      expect(r.erro).toMatch(/só pode mover os seus próprios tokens/);
    }
    const exportada = (await (await api(`/api/salas/${salaId}/exportar`, { token: tokenMestre })).json()) as { campanha: Campanha };
    const tokens = exportada.campanha.cenas[0].tokens;
    expect(tokens.find((t) => t.id === 'tok_pj2')).toMatchObject({ x: 125, y: 75 });
    expect(tokens.find((t) => t.id === 'tok_pnj')).toMatchObject({ x: 425, y: 425 });
    cliente.ws.close();
  });

  it('critério F: jogador não consegue se autoconceder o papel de mestre', async () => {
    const cliente = new Cliente(porta);
    await cliente.entrar(salaId, ana.token);
    // 1. Campos de papel dentro do comando são ignorados.
    const r1 = await cliente.comando({ tipo: 'nevoa.tudo', cenaId: 'cena_beco', operacao: 'revelar', papel: 'mestre', ator: { papel: 'mestre', jogadorId: null } });
    expect(r1).toMatchObject({ ok: false, erro: 'Apenas o mestre pode fazer isso.' });
    // 2. Comandos reservados ao mestre.
    for (const comando of [
      { tipo: 'cena.ativar', cenaId: 'cena_futura' },
      { tipo: 'jogador.adicionar', jogador: { id: 'jog_extra', nome: 'Extra' } },
      { tipo: 'ficha.atualizar', fichaId: 'ficha_pj', alteracoes: { compartilhamento: 'completa', nivel: 20 } },
      { tipo: 'token.atualizar', cenaId: 'cena_beco', tokenId: 'tok_pj2', alteracoes: { donoJogadorId: ana.jogadorId } },
      { tipo: 'compendio.liberar', ids: ['centryn'], liberar: true },
    ]) {
      expect((await cliente.comando(comando)).ok, comando.tipo).toBe(false);
    }
    // 3. Uma segunda mensagem "entrar" dizendo ser mestre não muda o papel da conexão.
    cliente.enviar({ tipo: 'entrar', protocolo: VERSAO_PROTOCOLO, salaId, token: ana.token, papel: 'mestre' });
    expect((await cliente.comando({ tipo: 'historico.limpar' })).ok).toBe(false);
    // 4. Rotas HTTP do mestre recusam o token de jogador.
    expect((await api(`/api/salas/${salaId}/exportar`, { token: ana.token })).status).toBe(403);
    expect((await api(`/api/salas/${salaId}/convites`, { method: 'POST', token: ana.token, body: '{"nome":"X"}' })).status).toBe(403);
    expect((await api(`/api/salas/${salaId}/convites`, { token: ana.token })).status).toBe(403);
    expect((await api(`/api/salas/${salaId}/arquivos/arq_x`, { method: 'PUT', token: ana.token, headers: { 'Content-Type': 'image/png' }, body: 'x' })).status).toBe(403);
    expect((await api(`/api/salas/${salaId}`, { method: 'DELETE', token: ana.token })).status).toBe(403);
    // 5. O token de administração não dá acesso à sala.
    expect((await api(`/api/salas/${salaId}/exportar`, { token: ADMIN })).status).toBe(401);
    cliente.ws.close();
  });

  it('mensagens antes de entrar, convites inválidos e salas inexistentes são recusados', async () => {
    const semEntrar = new Cliente(porta);
    await semEntrar.aberto();
    const erro = semEntrar.proxima('erro');
    semEntrar.enviar({ tipo: 'comando', idComando: 'x1', comando: { tipo: 'historico.limpar' } });
    expect((await erro).codigo).toBe('nao-autorizado');
    semEntrar.ws.close();

    for (const [sala, token] of [[salaId, 'token-inventado-com-mais-de-vinte-caracteres'], ['sala_inexistente', ana.token]]) {
      const c = new Cliente(porta);
      await c.aberto();
      const recusa = c.proxima('erro');
      c.enviar({ tipo: 'entrar', protocolo: VERSAO_PROTOCOLO, salaId: sala, token });
      expect((await recusa).mensagem).toBe('Mesa ou convite inválido.');
      expect(await c.fechado).toBe(4001);
    }
  });

  it('movimento autorizado é sincronizado com mestre e demais jogadores', async () => {
    const a = new Cliente(porta);
    const b = new Cliente(porta);
    await a.entrar(salaId, ana.token);
    await b.entrar(salaId, beto.token);
    const noMestre = mestre.proxima('visao', (m) => m.visao.cenas[0].tokens.some((t) => t.id === 'tok_pj' && t.x === 225));
    const noBeto = b.proxima('visao', (m) => m.visao.cenas[0].tokens.some((t) => t.id === 'tok_pj' && t.x === 225));
    const r = await a.comando({ tipo: 'token.mover', cenaId: 'cena_beco', movimentos: [{ tokenId: 'tok_pj', x: 225, y: 175 }] });
    expect(r.ok).toBe(true);
    await noMestre;
    await noBeto;
    a.ws.close();
    b.ws.close();
  });

  it('reenviar o mesmo comando (reconexão) não o executa duas vezes', async () => {
    const a = new Cliente(porta);
    const ola = await a.entrar(salaId, ana.token);
    const pv = ola.visao.fichas.find((f) => f.id === 'ficha_pj')!.pvAtual;
    const comando = { tipo: 'ficha.recurso', fichaId: 'ficha_pj', recurso: 'pv', modo: 'delta', valor: -1, motivo: 'teste' };
    const r1 = await a.comando(comando, 'cmd_repetido');
    const r2 = await a.comando(comando, 'cmd_repetido');
    expect(r1.ok && r2.ok).toBe(true);
    expect(r2.revisao).toBe(r1.revisao);
    const exportada = (await (await api(`/api/salas/${salaId}/exportar`, { token: tokenMestre })).json()) as { campanha: Campanha };
    expect(exportada.campanha.fichas.find((f) => f.id === 'ficha_pj')!.pvAtual).toBe(pv - 1);
    a.ws.close();
  });

  it('os dados são rolados pelo servidor; rolagem privada só chega ao mestre e a quem rolou', async () => {
    const a = new Cliente(porta);
    const b = new Cliente(porta);
    await a.entrar(salaId, ana.token);
    await b.entrar(salaId, beto.token);
    const noMestre = mestre.proxima('visao', (m) => m.visao.historico.some((h) => h.rotulo === 'privada-da-ana'));
    // Um "resultado" enviado pelo cliente é ignorado: só a expressão vale.
    const r = await a.comando({ tipo: 'dados.rolar', expressao: '1d20+3', rotulo: 'privada-da-ana', visibilidade: 'mestre', resultado: { total: 999 }, total: 999 });
    expect(r.ok).toBe(true);
    const entrada = (await noMestre).visao.historico.find((h) => h.rotulo === 'privada-da-ana')!;
    expect(entrada.resultado!.total).toBeGreaterThanOrEqual(4);
    expect(entrada.resultado!.total).toBeLessThanOrEqual(23);
    expect(entrada.resultado!.termos[0].dados).toHaveLength(1);
    expect(entrada.autor).toMatchObject({ papel: 'jogador', jogadorId: ana.jogadorId, nome: 'Ana' });
    // Expressão inválida não cria resultado.
    expect((await a.comando({ tipo: 'dados.rolar', expressao: 'constructor.constructor("x")()', rotulo: '', visibilidade: 'publica' })).ok).toBe(false);
    const publica = b.proxima('visao', (m) => m.visao.historico.some((h) => h.rotulo === 'aberta'));
    await a.comando({ tipo: 'dados.rolar', expressao: '2d6', rotulo: 'aberta', visibilidade: 'publica' });
    await publica;
    expect(JSON.stringify(b.recebidas)).not.toContain('privada-da-ana');
    expect(JSON.stringify(a.recebidas)).toContain('privada-da-ana');
    a.ws.close();
    b.ws.close();
  });

  it('arquivos: o mapa original nunca é entregue a jogadores; só a versão preparada', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const enviar = (id: string, dados: Uint8Array) =>
      api(`/api/salas/${salaId}/arquivos/${id}`, { method: 'PUT', token: tokenMestre, headers: { 'Content-Type': 'image/png' }, body: dados as unknown as BodyInit });
    expect((await enviar('arq_original', png)).status).toBe(204);
    expect((await api(`/api/salas/${salaId}/arquivos/arq_svg`, { method: 'PUT', token: tokenMestre, headers: { 'Content-Type': 'image/svg+xml' }, body: '<svg/>' })).status).toBe(415);
    await mestre.comando({ tipo: 'arquivo.registrar', meta: { id: 'arq_original', nome: 'mapa.png', tipo: 'image/png', tamanho: png.length, uso: 'mapa' } });
    await mestre.comando({ tipo: 'cena.mapa', cenaId: 'cena_beco', mapa: { tipo: 'arquivo', arquivoId: 'arq_original' }, largura: 500, altura: 500 });

    const ler = (id: string, token?: string) => api(`/api/salas/${salaId}/arquivos/${id}`, { token });
    expect((await ler('arq_original', tokenMestre)).status).toBe(200);
    expect((await ler('arq_original', ana.token)).status).toBe(404);
    expect((await ler('arq_original')).status).toBe(401);
    expect((await ler('arq_original', 'token-inventado-com-mais-de-vinte-caracteres')).status).toBe(401);

    const a = new Cliente(porta);
    const ola = await a.entrar(salaId, ana.token);
    expect(ola.visao.cenas[0].mapa).toEqual({ tipo: 'vazio' });
    expect(JSON.stringify(ola)).not.toContain('arq_original');

    const mascarado = new Uint8Array([137, 80, 78, 71, 9, 9]);
    expect((await enviar('arq_mascarado', mascarado)).status).toBe(204);
    await mestre.comando({ tipo: 'arquivo.registrar', meta: { id: 'arq_mascarado', nome: 'mapa-jogadores.png', tipo: 'image/png', tamanho: mascarado.length, uso: 'mapa-jogadores' } });
    const comMapa = a.proxima('visao', (m) => m.visao.cenas[0].mapa.tipo === 'arquivo');
    await mestre.comando({ tipo: 'cena.mapaJogadores', cenaId: 'cena_beco', arquivoId: 'arq_mascarado', celulas: ['8,8', '8,7', '7,8', '7,7'] });
    expect((await comMapa).visao.cenas[0].mapa).toEqual({ tipo: 'arquivo', arquivoId: 'arq_mascarado' });
    const baixado = await ler('arq_mascarado', ana.token);
    expect(baixado.status).toBe(200);
    expect(new Uint8Array(await baixado.arrayBuffer())).toEqual(mascarado);
    expect((await ler('arq_original', ana.token)).status).toBe(404);

    // Ocultar mais uma região invalida a imagem preparada até o mestre reenviar.
    const semMapa = a.proxima('visao', (m) => m.visao.cenas[0].mapa.tipo === 'vazio');
    await mestre.comando({ tipo: 'nevoa.alterar', cenaId: 'cena_beco', operacao: 'ocultar', celulas: ['0,9'] });
    await semMapa;
    expect((await ler('arq_mascarado', ana.token)).status).toBe(404);
    a.ws.close();
  });

  it('revogar o convite derruba a conexão e invalida o token', async () => {
    const convite = (await (await api(`/api/salas/${salaId}/convites`, { method: 'POST', token: tokenMestre, body: JSON.stringify({ nome: 'Visitante' }) })).json()) as { jogadorId: string; token: string };
    const c = new Cliente(porta);
    await c.entrar(salaId, convite.token);
    expect((await api(`/api/salas/${salaId}/convites/${convite.jogadorId}`, { method: 'DELETE', token: tokenMestre })).status).toBe(204);
    expect(await c.fechado).toBe(4001);
    const de_novo = new Cliente(porta);
    await de_novo.aberto();
    const recusa = de_novo.proxima('erro');
    de_novo.enviar({ tipo: 'entrar', protocolo: VERSAO_PROTOCOLO, salaId, token: convite.token });
    expect((await recusa).codigo).toBe('nao-autorizado');
  });

  it('a sala sobrevive a uma reinicialização do servidor, com os mesmos acessos', async () => {
    await servidor.parar();
    servidor = new ServidorMesa({ pastaDados: pasta, tokenAdmin: ADMIN });
    porta = await servidor.iniciar(0, '127.0.0.1');
    base = `http://127.0.0.1:${porta}`;
    mestre = new Cliente(porta);
    const ola = await mestre.entrar(salaId, tokenMestre);
    expect(ola.papel).toBe('mestre');
    expect(ola.visao.cenas[0].tokens.find((t) => t.id === 'tok_pj')).toMatchObject({ x: 225, y: 175 });
    expect(ola.visao.historico.some((h) => h.rotulo === 'aberta')).toBe(true);
    const a = new Cliente(porta);
    expect((await a.entrar(salaId, ana.token)).papel).toBe('jogador');
    expect((await api(`/api/salas/${salaId}/arquivos/arq_original`, { token: tokenMestre })).status).toBe(200);
    a.ws.close();
  });
});

describe('sala (sem rede)', () => {
  it('guarda apenas o hash dos tokens e nunca devolve papel a quem não tem token válido', () => {
    const { sala, tokenMestre } = Sala.criar(campanhaDoMestre());
    const convite = sala.criarConvite('Ana');
    if ('erro' in convite) throw new Error(convite.erro);
    const registro = JSON.stringify(sala.serializar());
    expect(registro).not.toContain(tokenMestre);
    expect(registro).not.toContain(convite.token);
    expect(sala.autenticar(tokenMestre)?.papel).toBe('mestre');
    expect(sala.autenticar(convite.token)).toMatchObject({ papel: 'jogador', jogadorId: convite.jogadorId });
    for (const invalido of [undefined, null, '', 'mestre', { papel: 'mestre' }, tokenMestre.slice(0, -1), `${tokenMestre}x`, 'a'.repeat(500)]) {
      expect(sala.autenticar(invalido)).toBeNull();
    }
    // Um jogador que veio no cadastro da campanha local não tem credencial até receber um convite.
    expect(sala.jogadoresComAcesso()).toEqual([convite.jogadorId]);
    expect(sala.revogarConvite(convite.jogadorId)).toBe(true);
    expect(sala.autenticar(convite.token)).toBeNull();
  });
});
