/**
 * Loja de estado do aplicativo.
 *
 * Dois motores atrás da mesma interface:
 *  - local: aplica comandos no próprio navegador (o usuário é o mestre), com
 *    desfazer/refazer e salvamento automático no IndexedDB;
 *  - online: envia comandos ao servidor autoritativo e exibe a visão recebida,
 *    com previsão otimista apenas para comandos determinísticos.
 */
import { executarComando, type Comando, type TipoComando } from '../dominio/comandos';
import { criarFonteCripto } from '../dominio/dados';
import type { Ator, Campanha, Id, MetaArquivo, Papel } from '../dominio/esquema';
import { agoraIso, campanhaDemo, campanhaVazia, novoId } from '../dominio/fabrica';
import {
  LIMITES_ARQUIVO,
  TIPOS_IMAGEM,
  comoCopia,
  exportarSomenteDados,
  lerPacote,
  lerSomenteDados,
  montarPacote,
  type ArquivoPacote,
} from '../dominio/pacote';
import { ClienteOnline, criarSala, normalizarServidor, verificarServidor, type EstadoConexao } from '../online/cliente';
import { lerLinkDeEntrada } from '../online/protocolo';
import { Armazenamento, ErroArmazenamento, formatarBytes, type ResumoCampanha } from '../persistencia/armazenamento';

export interface Aviso {
  id: string;
  tipo: 'info' | 'sucesso' | 'erro';
  texto: string;
  acao?: { rotulo: string; executar: () => void };
}

export interface InfoConexao {
  estado: EstadoConexao;
  servidor: string;
  salaId: Id;
  erro: string | null;
}

export interface EstadoLoja {
  fase: 'carregando' | 'pronto' | 'erro';
  erroFatal: string | null;
  modo: 'local' | 'online';
  ator: Ator;
  campanhas: ResumoCampanha[];
  campanha: Campanha | null;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  salvamento: { estado: 'inativo' | 'salvo' | 'salvando' | 'erro'; mensagem: string | null };
  conexao: InfoConexao | null;
  avisos: Aviso[];
  /** false quando o navegador não oferece IndexedDB: nada é salvo e a interface avisa. */
  armazenamento: boolean;
}

export interface PreviaImportacao {
  formato: 'pacote' | 'dados';
  campanha: Campanha;
  arquivos: ArquivoPacote[];
  avisos: string[];
  /** Já existe, neste navegador, uma campanha com o mesmo identificador. */
  existente: ResumoCampanha | null;
}

interface SessaoOnline {
  servidor: string;
  salaId: Id;
  token: string;
  /** Campanha local do mestre que originou a sala (cópia local mantida em dia). */
  campanhaLocalId: Id | null;
}

const MESTRE_LOCAL: Ator = { papel: 'mestre', jogadorId: null, nome: 'Mestre' };
const CHAVE_SESSAO = 'wendlands.sessaoOnline';
const LIMITE_DESFAZER = 60;

/** Comandos sem aleatoriedade, seguros para previsão otimista no cliente. */
const OTIMISTAS: ReadonlySet<TipoComando> = new Set<TipoComando>([
  'token.mover',
  'token.atualizar',
  'token.criar',
  'token.excluir',
  'ficha.recurso',
  'ficha.atualizar',
  'ficha.item',
  'ficha.removerItem',
  'nevoa.alterar',
  'nevoa.tudo',
  'desenho.criar',
  'desenho.excluir',
  'desenho.limpar',
  'cena.grade',
  'cena.ativar',
  'cena.atualizar',
  'combate.acao',
  'combate.postura',
  'diario.salvar',
  'compendio.liberar',
]);

type Ouvinte = () => void;

export class Loja {
  private estado: EstadoLoja = {
    fase: 'carregando',
    erroFatal: null,
    modo: 'local',
    ator: MESTRE_LOCAL,
    campanhas: [],
    campanha: null,
    podeDesfazer: false,
    podeRefazer: false,
    salvamento: { estado: 'inativo', mensagem: null },
    conexao: null,
    avisos: [],
    armazenamento: true,
  };
  private readonly ouvintes = new Set<Ouvinte>();
  private bd: Armazenamento | null = null;
  private passado: Campanha[] = [];
  private futuro: Campanha[] = [];
  private temporizadorSalvar: ReturnType<typeof setTimeout> | null = null;
  private salvando: Promise<void> = Promise.resolve();
  private readonly fonte = criarFonteCripto();
  private readonly urls = new Map<Id, Promise<string | null>>();

  // motor online
  private cliente: ClienteOnline | null = null;
  private sessao: SessaoOnline | null = null;
  private confirmada: Campanha | null = null;
  private pendentes: Array<{ id: Id; comando: Comando; enviado: boolean }> = [];

  // ───────────── Assinatura ─────────────

  assinar = (ouvinte: Ouvinte): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  obter = (): EstadoLoja => this.estado;

  private definir(parcial: Partial<EstadoLoja>): void {
    this.estado = { ...this.estado, ...parcial };
    for (const o of this.ouvintes) o();
  }

  get clienteOnline(): ClienteOnline | null {
    return this.cliente;
  }

  // ───────────── Avisos ─────────────

  avisar(tipo: Aviso['tipo'], texto: string, acao?: Aviso['acao'], duracaoMs = tipo === 'erro' ? 9000 : 5000): string {
    const id = novoId('av');
    this.definir({ avisos: [...this.estado.avisos, { id, tipo, texto, acao }].slice(-5) });
    if (duracaoMs > 0) setTimeout(() => this.dispensarAviso(id), acao ? Math.max(duracaoMs, 9000) : duracaoMs);
    return id;
  }

  dispensarAviso(id: string): void {
    if (this.estado.avisos.some((a) => a.id === id)) this.definir({ avisos: this.estado.avisos.filter((a) => a.id !== id) });
  }

  // ───────────── Inicialização ─────────────

  async iniciar(): Promise<void> {
    try {
      this.bd = await Armazenamento.abrir();
      await this.bd.limparExcluidas(new Date()).catch(() => 0);
    } catch (e) {
      this.bd = null;
      this.definir({ armazenamento: false });
      this.avisar('erro', e instanceof Error ? e.message : 'Armazenamento local indisponível.', undefined, 0);
    }

    // Link de entrada (#sala=…&token=…): guarda a sessão e limpa o endereço.
    const link = lerLinkDeEntrada(window.location.hash);
    if (link) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      this.gravarSessao({ servidor: normalizarServidor(link.servidor ?? ''), salaId: link.salaId, token: link.token, campanhaLocalId: null });
    }
    const sessao = this.lerSessao();
    if (sessao) {
      this.conectar(sessao);
      return;
    }
    await this.iniciarLocal();
  }

  private async iniciarLocal(): Promise<void> {
    try {
      let campanhas = this.bd ? await this.bd.listarCampanhas() : [];
      let campanha: Campanha | null = null;
      if (campanhas.length === 0) {
        // Primeira execução: uma mesa de demonstração, explicitamente fictícia.
        campanha = campanhaDemo();
        if (this.bd) {
          await this.bd.salvarCampanha(campanha);
          campanhas = await this.bd.listarCampanhas();
        }
      } else {
        const ultima = this.bd ? await this.bd.lerPreferencia<string>('ultimaCampanha') : undefined;
        const alvo = campanhas.find((c) => c.id === ultima) ?? campanhas[0];
        const r = await this.bd!.carregarCampanha(alvo.id);
        if (r.ok) campanha = r.campanha;
        else this.avisar('erro', `Não foi possível abrir "${alvo.nome}": ${r.erro}`, undefined, 0);
      }
      this.passado = [];
      this.futuro = [];
      this.limparUrls();
      this.definir({
        fase: 'pronto',
        modo: 'local',
        ator: MESTRE_LOCAL,
        campanhas,
        campanha,
        conexao: null,
        podeDesfazer: false,
        podeRefazer: false,
        salvamento: { estado: this.bd ? 'salvo' : 'inativo', mensagem: null },
      });
    } catch (e) {
      this.definir({ fase: 'erro', erroFatal: e instanceof Error ? e.message : String(e) });
    }
  }

  // ───────────── Comandos ─────────────

  private contexto(ator: Ator) {
    return { agora: agoraIso(), novoId: () => novoId(), fonte: this.fonte, ator };
  }

  /**
   * Executa um comando. No modo local o resultado é imediato; no online o
   * comando segue para o servidor e eventuais recusas chegam como aviso.
   */
  despachar(comando: Comando, opcoes: { silencioso?: boolean } = {}): { ok: boolean; erro: string | null } {
    const atual = this.estado.campanha;
    if (!atual) return { ok: false, erro: 'Nenhuma campanha aberta.' };

    if (this.estado.modo === 'online') {
      if (!this.cliente || !this.confirmada) return { ok: false, erro: 'Sem conexão com a mesa.' };
      const id = novoId('cmd');
      const enviado = this.cliente.enviarComando(id, comando);
      this.pendentes.push({ id, comando, enviado });
      this.recalcularExibida();
      return { ok: true, erro: null };
    }

    const r = executarComando(atual, comando, this.contexto(MESTRE_LOCAL));
    if (!r.ok) {
      if (!opcoes.silencioso) this.avisar('erro', r.erro);
      return { ok: false, erro: r.erro };
    }
    this.passado.push(atual);
    if (this.passado.length > LIMITE_DESFAZER) this.passado.shift();
    this.futuro = [];
    this.definir({ campanha: r.campanha, podeDesfazer: true, podeRefazer: false });
    this.agendarSalvamento();
    return { ok: true, erro: null };
  }

  desfazer(): void {
    if (this.estado.modo !== 'local' || this.passado.length === 0 || !this.estado.campanha) return;
    this.futuro.push(this.estado.campanha);
    const anterior = this.passado.pop()!;
    this.definir({ campanha: anterior, podeDesfazer: this.passado.length > 0, podeRefazer: true });
    this.agendarSalvamento();
  }

  refazer(): void {
    if (this.estado.modo !== 'local' || this.futuro.length === 0 || !this.estado.campanha) return;
    this.passado.push(this.estado.campanha);
    const proxima = this.futuro.pop()!;
    this.definir({ campanha: proxima, podeDesfazer: true, podeRefazer: this.futuro.length > 0 });
    this.agendarSalvamento();
  }

  // ───────────── Salvamento automático ─────────────

  private agendarSalvamento(): void {
    if (!this.bd) return;
    if (this.estado.salvamento.estado !== 'salvando') this.definir({ salvamento: { estado: 'salvando', mensagem: null } });
    if (this.temporizadorSalvar) clearTimeout(this.temporizadorSalvar);
    this.temporizadorSalvar = setTimeout(() => void this.salvarAgora(), 350);
  }

  private salvarAgora(): Promise<void> {
    if (this.temporizadorSalvar) clearTimeout(this.temporizadorSalvar);
    this.temporizadorSalvar = null;
    const campanha = this.campanhaParaCopiaLocal();
    const bd = this.bd;
    if (!campanha || !bd) return Promise.resolve();
    this.salvando = this.salvando
      .then(() => bd.salvarCampanha(campanha))
      .then(() => {
        if (!this.temporizadorSalvar) this.definir({ salvamento: { estado: 'salvo', mensagem: null } });
      })
      .catch((e: unknown) => {
        const mensagem = e instanceof ErroArmazenamento ? e.message : `Falha ao salvar: ${e instanceof Error ? e.message : String(e)}`;
        // Sem perda silenciosa: o erro fica visível até um salvamento dar certo.
        this.definir({ salvamento: { estado: 'erro', mensagem } });
      });
    return this.salvando;
  }

  /** O que vai para o IndexedDB: a campanha local, ou a cópia do mestre de uma sala online. */
  private campanhaParaCopiaLocal(): Campanha | null {
    const c = this.estado.modo === 'online' ? this.confirmada : this.estado.campanha;
    if (!c) return null;
    if (this.estado.modo === 'local') return c;
    if (this.estado.ator.papel !== 'mestre' || !this.sessao?.campanhaLocalId) return null;
    return {
      ...c,
      id: this.sessao.campanhaLocalId,
      pendencias: [],
      arquivos: c.arquivos.filter((a) => a.uso !== 'mapa-jogadores'),
      cenas: c.cenas.map((cena) => (cena.mapaJogadores ? { ...cena, mapaJogadores: null } : cena)),
    };
  }

  /** Tenta salvar de novo depois de um erro (ex.: após liberar espaço). */
  tentarSalvarNovamente(): void {
    this.agendarSalvamento();
  }

  // ───────────── Campanhas (modo local) ─────────────

  private async atualizarLista(): Promise<void> {
    if (this.bd) this.definir({ campanhas: await this.bd.listarCampanhas() });
  }

  async criarCampanha(nome: string, modelo: 'vazia' | 'demo'): Promise<void> {
    await this.salvarAgora();
    const limpo = nome.trim().slice(0, 80) || 'Nova campanha';
    const campanha = modelo === 'demo' ? campanhaDemo(limpo) : campanhaVazia(limpo);
    try {
      await this.bd?.salvarCampanha(campanha);
      await this.bd?.gravarPreferencia('ultimaCampanha', campanha.id);
    } catch (e) {
      this.avisar('erro', e instanceof Error ? e.message : 'Não foi possível criar a campanha.');
      return;
    }
    this.passado = [];
    this.futuro = [];
    this.limparUrls();
    this.definir({ campanha, podeDesfazer: false, podeRefazer: false });
    await this.atualizarLista();
  }

  async abrirCampanha(id: Id): Promise<void> {
    if (!this.bd || this.estado.modo !== 'local') return;
    await this.salvarAgora();
    const r = await this.bd.carregarCampanha(id);
    if (!r.ok) {
      this.avisar('erro', `Não foi possível abrir a campanha: ${r.erro}`);
      return;
    }
    for (const aviso of r.avisos) this.avisar('info', aviso);
    this.passado = [];
    this.futuro = [];
    this.limparUrls();
    this.definir({ campanha: r.campanha, podeDesfazer: false, podeRefazer: false, salvamento: { estado: 'salvo', mensagem: null } });
    await this.bd.gravarPreferencia('ultimaCampanha', id).catch(() => undefined);
  }

  async duplicarCampanha(id: Id): Promise<void> {
    if (!this.bd) return;
    await this.salvarAgora();
    const r = await this.bd.carregarCampanha(id);
    if (!r.ok) {
      this.avisar('erro', r.erro);
      return;
    }
    const nomes = this.estado.campanhas.map((c) => c.nome);
    const copia = comoCopia({ ...r.campanha, nome: `${r.campanha.nome} (cópia)`.slice(0, 80) }, novoId('camp'), agoraIso(), nomes);
    try {
      await this.bd.salvarCampanha(copia);
      await this.bd.copiarArquivos(id, copia.id);
    } catch (e) {
      await this.bd.apagarDefinitivamente(copia.id).catch(() => undefined);
      this.avisar('erro', e instanceof Error ? e.message : 'Não foi possível duplicar a campanha.');
      return;
    }
    await this.atualizarLista();
    this.avisar('sucesso', `Campanha duplicada como "${copia.nome}".`);
  }

  async renomearCampanha(id: Id, nome: string): Promise<void> {
    const limpo = nome.trim().slice(0, 80);
    if (!limpo || !this.bd) return;
    if (this.estado.campanha?.id === id) {
      this.despachar({ tipo: 'campanha.renomear', nome: limpo });
      await this.salvarAgora();
    } else {
      const r = await this.bd.carregarCampanha(id);
      if (!r.ok) return;
      await this.bd.salvarCampanha({ ...r.campanha, nome: limpo, atualizadaEm: agoraIso() });
    }
    await this.atualizarLista();
  }

  /** Exclusão reversível: sai da lista agora e é apagada de vez após 7 dias. */
  async excluirCampanha(id: Id): Promise<void> {
    if (!this.bd) return;
    await this.salvarAgora();
    const resumo = this.estado.campanhas.find((c) => c.id === id);
    await this.bd.marcarExcluida(id, agoraIso());
    await this.atualizarLista();
    if (this.estado.campanha?.id === id) {
      const proxima = this.estado.campanhas[0];
      if (proxima) await this.abrirCampanha(proxima.id);
      else {
        this.limparUrls();
        this.passado = [];
        this.futuro = [];
        this.definir({ campanha: null, podeDesfazer: false, podeRefazer: false });
      }
    }
    this.avisar('info', `Campanha "${resumo?.nome ?? ''}" excluída.`, {
      rotulo: 'Desfazer',
      executar: () => void this.restaurarCampanha(id),
    });
  }

  async restaurarCampanha(id: Id): Promise<void> {
    if (!this.bd) return;
    await this.bd.marcarExcluida(id, null);
    await this.atualizarLista();
    if (!this.estado.campanha) await this.abrirCampanha(id);
    this.avisar('sucesso', 'Campanha restaurada.');
  }

  // ───────────── Arquivos de imagem ─────────────

  private limparUrls(): void {
    for (const promessa of this.urls.values()) void promessa.then((url) => url && URL.revokeObjectURL(url));
    this.urls.clear();
  }

  /** URL de objeto para exibir uma imagem da campanha (com cache). */
  obterUrl(arquivoId: Id): Promise<string | null> {
    const emCache = this.urls.get(arquivoId);
    if (emCache) return emCache;
    const promessa = (async () => {
      try {
        if (this.estado.modo === 'online') {
          const blob = await this.cliente?.baixarArquivo(arquivoId);
          return blob ? URL.createObjectURL(blob) : null;
        }
        const campanhaId = this.estado.campanha?.id;
        if (!this.bd || !campanhaId) return null;
        const r = await this.bd.lerArquivo(campanhaId, arquivoId);
        return r ? URL.createObjectURL(new Blob([r.dados], { type: r.tipo })) : null;
      } catch {
        return null;
      }
    })();
    this.urls.set(arquivoId, promessa);
    // Falhas não ficam em cache: uma nova tentativa pode dar certo (ex.: imagem ainda sendo enviada).
    void promessa.then((url) => {
      if (!url && this.urls.get(arquivoId) === promessa) this.urls.delete(arquivoId);
    });
    return promessa;
  }

  /** Bytes originais de um arquivo (para exportar ou preparar o mapa dos jogadores). */
  async lerBytes(arquivoId: Id): Promise<{ dados: ArrayBuffer; tipo: string } | null> {
    if (this.estado.modo === 'online') {
      const blob = await this.cliente?.baixarArquivo(arquivoId);
      return blob ? { dados: await blob.arrayBuffer(), tipo: blob.type } : null;
    }
    const campanhaId = this.estado.campanha?.id;
    if (!this.bd || !campanhaId) return null;
    return this.bd.lerArquivo(campanhaId, arquivoId);
  }

  /** Valida e guarda uma imagem; devolve o registro criado ou null (com aviso do motivo). */
  async importarImagem(arquivo: Blob, nome: string, uso: MetaArquivo['uso']): Promise<MetaArquivo | null> {
    const campanha = this.estado.campanha;
    if (!campanha || this.estado.ator.papel !== 'mestre') return null;
    if (!(TIPOS_IMAGEM as readonly string[]).includes(arquivo.type)) {
      this.avisar('erro', 'Formato não aceito. Use uma imagem PNG, JPEG, WebP, GIF ou AVIF.');
      return null;
    }
    const limite = uso === 'retrato' ? LIMITES_ARQUIVO.retrato : LIMITES_ARQUIVO.mapa;
    if (arquivo.size > limite) {
      this.avisar('erro', `A imagem tem ${formatarBytes(arquivo.size)}; o limite para ${uso === 'retrato' ? 'retratos' : 'mapas'} é ${formatarBytes(limite)}.`);
      return null;
    }
    const meta: MetaArquivo = { id: novoId('arq'), nome: nome.slice(0, 200), tipo: arquivo.type, tamanho: arquivo.size, uso };
    try {
      const dados = await arquivo.arrayBuffer();
      if (this.estado.modo === 'online') {
        await this.cliente!.enviarArquivo(meta.id, dados, meta.tipo);
        if (this.bd && this.sessao?.campanhaLocalId && uso !== 'mapa-jogadores') {
          await this.bd.salvarArquivo(this.sessao.campanhaLocalId, meta, dados);
        }
      } else if (this.bd) {
        await this.bd.salvarArquivo(campanha.id, meta, dados);
      } else {
        this.avisar('erro', 'Sem armazenamento local: não é possível guardar imagens neste navegador.');
        return null;
      }
    } catch (e) {
      this.avisar('erro', e instanceof Error ? e.message : 'Não foi possível guardar a imagem.');
      return null;
    }
    const r = this.despachar({ tipo: 'arquivo.registrar', meta });
    return r.ok ? meta : null;
  }

  async removerImagem(arquivoId: Id): Promise<void> {
    const campanhaId = this.estado.modo === 'online' ? this.sessao?.campanhaLocalId : this.estado.campanha?.id;
    this.despachar({ tipo: 'arquivo.remover', arquivoId });
    this.urls.delete(arquivoId);
    if (this.bd && campanhaId) await this.bd.removerArquivo(campanhaId, arquivoId).catch(() => undefined);
  }

  // ───────────── Exportação e importação ─────────────

  /** Backup completo (.zip) da campanha aberta. */
  async exportarBackup(): Promise<{ blob: Blob; nome: string; ausentes: MetaArquivo[] } | null> {
    await this.salvarAgora();
    const campanha = this.campanhaParaCopiaLocal() ?? this.estado.campanha;
    if (!campanha) return null;
    const arquivos = new Map<Id, Uint8Array>();
    for (const meta of campanha.arquivos) {
      const r = await this.lerBytes(meta.id).catch(() => null);
      if (r) arquivos.set(meta.id, new Uint8Array(r.dados));
    }
    const pacote = montarPacote(campanha, arquivos, agoraIso());
    return {
      blob: new Blob([pacote.bytes.slice().buffer], { type: 'application/zip' }),
      nome: `${nomeDeArquivo(campanha.nome)}.wendlands.zip`,
      ausentes: pacote.ausentes,
    };
  }

  /** Exportação somente de dados (.json) — não inclui imagens e não é backup completo. */
  exportarDados(): { blob: Blob; nome: string } | null {
    const campanha = this.campanhaParaCopiaLocal() ?? this.estado.campanha;
    if (!campanha) return null;
    const dados = exportarSomenteDados(campanha, agoraIso());
    return { blob: new Blob([JSON.stringify(dados)], { type: 'application/json' }), nome: `${nomeDeArquivo(campanha.nome)}.somente-dados.json` };
  }

  async analisarImportacao(arquivo: Blob): Promise<{ ok: true; previa: PreviaImportacao } | { ok: false; erro: string }> {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const ehZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    const todas = this.bd ? await this.bd.listarCampanhas(true) : [];
    if (ehZip) {
      const r = lerPacote(bytes);
      if (!r.ok) return r;
      return { ok: true, previa: { formato: 'pacote', campanha: r.campanha, arquivos: r.arquivos, avisos: r.avisos, existente: todas.find((c) => c.id === r.campanha.id) ?? null } };
    }
    let bruto: unknown;
    try {
      bruto = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return { ok: false, erro: 'O arquivo não é um pacote .zip nem um JSON de Wendlands.' };
    }
    const r = lerSomenteDados(bruto);
    if (!r.ok) return r;
    return { ok: true, previa: { formato: 'dados', campanha: r.campanha, arquivos: [], avisos: r.avisos, existente: todas.find((c) => c.id === r.campanha.id) ?? null } };
  }

  /**
   * Conclui a importação. "copia" cria uma campanha nova e não toca em nenhuma
   * existente; "substituir" troca a campanha de mesmo identificador (ação explícita).
   */
  async concluirImportacao(previa: PreviaImportacao, modo: 'copia' | 'substituir'): Promise<boolean> {
    if (!this.bd) {
      this.avisar('erro', 'Sem armazenamento local: não é possível importar neste navegador.');
      return false;
    }
    await this.salvarAgora();
    const nomes = this.estado.campanhas.map((c) => c.nome);
    const campanha = modo === 'copia' ? comoCopia(previa.campanha, novoId('camp'), agoraIso(), nomes) : { ...previa.campanha, atualizadaEm: agoraIso() };
    try {
      await this.bd.gravarCampanhaComArquivos(
        campanha,
        previa.arquivos.map((a) => ({ meta: a.meta, dados: a.dados.slice().buffer as ArrayBuffer })),
        modo === 'substituir',
      );
    } catch (e) {
      this.avisar('erro', e instanceof Error ? e.message : 'A importação falhou. Nada foi alterado.');
      return false;
    }
    await this.atualizarLista();
    await this.abrirCampanha(campanha.id);
    this.avisar('sucesso', modo === 'copia' ? `Campanha importada como "${campanha.nome}".` : `Campanha "${campanha.nome}" substituída pela versão importada.`);
    return true;
  }

  // ───────────── Mesa online ─────────────

  private lerSessao(): SessaoOnline | null {
    try {
      const bruto = localStorage.getItem(CHAVE_SESSAO);
      if (!bruto) return null;
      const s = JSON.parse(bruto) as Partial<SessaoOnline>;
      if (typeof s.servidor !== 'string' || typeof s.salaId !== 'string' || typeof s.token !== 'string') return null;
      return { servidor: s.servidor, salaId: s.salaId, token: s.token, campanhaLocalId: typeof s.campanhaLocalId === 'string' ? s.campanhaLocalId : null };
    } catch {
      return null;
    }
  }

  private gravarSessao(sessao: SessaoOnline | null): void {
    try {
      if (sessao) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
      else localStorage.removeItem(CHAVE_SESSAO);
    } catch {
      /* armazenamento indisponível: a sessão vale só até recarregar */
    }
  }

  private conectar(sessao: SessaoOnline): void {
    this.cliente?.fechar();
    this.sessao = sessao;
    this.confirmada = null;
    this.pendentes = [];
    this.passado = [];
    this.futuro = [];
    this.limparUrls();
    this.definir({
      fase: 'pronto',
      modo: 'online',
      campanha: null,
      podeDesfazer: false,
      podeRefazer: false,
      salvamento: { estado: 'inativo', mensagem: null },
      conexao: { estado: 'conectando', servidor: sessao.servidor, salaId: sessao.salaId, erro: null },
    });
    this.cliente = new ClienteOnline(sessao.servidor, sessao.salaId, sessao.token, {
      aoEntrar: (m) => {
        const papel: Papel = m.papel;
        this.confirmada = m.visao;
        this.definir({ ator: { papel, jogadorId: m.jogadorId, nome: m.nome } });
        // Reenvia o que ficou pendente; os mesmos ids garantem que nada execute duas vezes.
        for (const p of this.pendentes) p.enviado = this.cliente?.enviarComando(p.id, p.comando) ?? false;
        this.recalcularExibida();
        if (papel === 'mestre') this.agendarSalvamento();
      },
      aoVisao: (m) => {
        this.confirmada = m.visao;
        this.recalcularExibida();
        if (this.estado.ator.papel === 'mestre') this.agendarSalvamento();
      },
      aoResultado: (m) => {
        const indice = this.pendentes.findIndex((p) => p.id === m.idComando);
        if (indice >= 0) this.pendentes.splice(indice, 1);
        if (!m.ok && m.erro) this.avisar('erro', m.erro);
        this.recalcularExibida();
      },
      aoEstado: (estado, erro) => {
        this.definir({ conexao: { estado, servidor: sessao.servidor, salaId: sessao.salaId, erro } });
      },
    });
    this.cliente.conectar();
  }

  /** Visão exibida = última visão confirmada pelo servidor + previsão dos comandos pendentes. */
  private recalcularExibida(): void {
    if (!this.confirmada) return;
    let exibida = this.confirmada;
    for (const p of this.pendentes) {
      if (!OTIMISTAS.has(p.comando.tipo)) continue;
      const r = executarComando(exibida, p.comando, this.contexto(this.estado.ator));
      if (r.ok) exibida = r.campanha;
    }
    if (exibida !== this.estado.campanha) this.definir({ campanha: exibida });
  }

  /** O mestre publica a campanha local aberta como sala num servidor próprio. */
  async abrirMesaOnline(servidorInformado: string, tokenAdmin: string): Promise<{ ok: true } | { ok: false; erro: string }> {
    const campanha = this.estado.campanha;
    if (!campanha || this.estado.modo !== 'local') return { ok: false, erro: 'Abra uma campanha local primeiro.' };
    await this.salvarAgora();
    const servidor = normalizarServidor(servidorInformado);
    try {
      await verificarServidor(servidor);
      const { salaId, tokenMestre } = await criarSala(servidor, tokenAdmin.trim(), campanha);
      const sessao: SessaoOnline = { servidor, salaId, token: tokenMestre, campanhaLocalId: campanha.id };
      // Envia as imagens da campanha antes de conectar.
      const provisorio = new ClienteOnline(servidor, salaId, tokenMestre, { aoEntrar() {}, aoVisao() {}, aoResultado() {}, aoEstado() {} });
      let falhas = 0;
      for (const meta of campanha.arquivos) {
        if (meta.uso === 'mapa-jogadores') continue;
        const r = this.bd ? await this.bd.lerArquivo(campanha.id, meta.id) : null;
        if (!r) continue;
        try {
          await provisorio.enviarArquivo(meta.id, r.dados, meta.tipo);
        } catch {
          falhas++;
        }
      }
      if (falhas > 0) this.avisar('erro', `${falhas} imagem(ns) não puderam ser enviadas ao servidor.`);
      this.gravarSessao(sessao);
      this.conectar(sessao);
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : 'Não foi possível abrir a mesa online.' };
    }
  }

  /** Entra numa sala existente com um convite (jogador) ou com o token do mestre. */
  entrarNaMesa(servidor: string, salaId: Id, token: string): void {
    const sessao: SessaoOnline = { servidor: normalizarServidor(servidor), salaId, token, campanhaLocalId: null };
    this.gravarSessao(sessao);
    this.conectar(sessao);
  }

  /** Sai da mesa online e volta ao modo local. A sala continua no servidor. */
  async sairDaMesa(): Promise<void> {
    if (this.estado.ator.papel === 'mestre') await this.salvarAgora();
    this.cliente?.fechar();
    this.cliente = null;
    this.sessao = null;
    this.confirmada = null;
    this.pendentes = [];
    this.gravarSessao(null);
    this.definir({ fase: 'carregando', campanha: null, conexao: null });
    await this.iniciarLocal();
  }

  /** O mestre encerra a sala no servidor (apaga os dados de lá) e volta ao modo local. */
  async encerrarMesaOnline(): Promise<void> {
    try {
      await this.salvarAgora();
      await this.cliente?.encerrarSala();
    } catch (e) {
      this.avisar('erro', e instanceof Error ? e.message : 'Não foi possível encerrar a sala no servidor.');
      return;
    }
    await this.sairDaMesa();
    this.avisar('sucesso', 'Mesa online encerrada. A campanha continua salva neste navegador.');
  }

  get sessaoOnline(): { servidor: string; salaId: Id; token: string } | null {
    return this.sessao ? { servidor: this.sessao.servidor, salaId: this.sessao.salaId, token: this.sessao.token } : null;
  }
}

export function nomeDeArquivo(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return limpo || 'campanha';
}

export function baixarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
