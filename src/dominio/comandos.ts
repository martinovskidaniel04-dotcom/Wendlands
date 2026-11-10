/**
 * Comandos: a única forma de alterar uma campanha.
 *
 * O mesmo executor roda no modo local (dentro do navegador do mestre) e no
 * servidor da mesa online, que é o lado autoritativo. Todo comando é validado
 * por esquema, autorizado pelo papel de quem o enviou e só então aplicado.
 * Nenhum campo do comando informa o papel: ele vem do contexto.
 */
import { produce } from 'immer';
import { z } from 'zod';
import { analisarExpressao, descreverRolagem, rolar, rolarD20, type FonteAleatoria } from './dados';
import {
  ALVOS_AJUSTE,
  ATRIBUTOS,
  CLAS,
  CORES_TOKEN,
  ESTILOS,
  MODOS_MEDICAO,
  ORIGENS,
  POSICOES_CONTROLE,
  POSTURAS,
  RECURSOS,
  SUBCATEGORIAS_GUARDA,
  esquemaAtributos,
  esquemaCena,
  esquemaChaveCelula,
  esquemaDesenho,
  esquemaEntradaCompendio,
  esquemaEntradaDiario,
  esquemaFicha,
  esquemaId,
  esquemaItem,
  esquemaJogador,
  esquemaMapa,
  esquemaMetaArquivo,
  esquemaTecnicaFicha,
  esquemaToken,
  type Ator,
  type Campanha,
  type Cena,
  type Ficha,
  type Id,
  type Token,
} from './esquema';
import { duplicarCena } from './fabrica';
import { reamostrarNevoa, todasAsCelulas, tokenSobNevoa } from './mapa';
import {
  CATEGORIAS_ARMA,
  DESTINOS,
  TRANSICOES,
  alterarRecursoFicha,
  aplicarEfeitos,
  avancarTurno,
  concluirAcao,
  consumirAcaoPrincipal,
  detectarEmpates,
  novoCombate,
  ordenarPorIniciativa,
  participante,
  registrarAlteracao,
  removerParticipante,
  resolverAtaque,
  resolverTransicao,
  rolarIniciativa,
  voltarTurno,
} from './regras/combate';
import {
  CUSTO_GRAU_YANT,
  ROTULO_GRAU,
  SIGLA_ATRIBUTO,
  TETO_ATRIBUTO,
  atributosPermanentes,
  derivar,
  limitarRecursos,
  verificarGrauYant,
} from './regras/ficha';
import { sortearRy } from './regras/origem';

const txt = (max: number) => z.string().max(max);
const visibilidadeRolagem = z.enum(['publica', 'mestre']);

const pedidoTransicao = z.object({
  transicao: z.enum(TRANSICOES),
  executorId: esquemaId,
  alvoId: esquemaId.nullable(),
  abordagemExecutor: z.enum(['fis', 'des']),
  abordagemAlvo: z.enum(['fis', 'des']),
  forcaBrutaExecutor: z.boolean(),
  forcaBrutaAlvo: z.boolean(),
  acompanharQueda: z.boolean(),
  subcategoria: z.enum(SUBCATEGORIAS_GUARDA),
  destino: z.enum(DESTINOS),
  comOposicao: z.boolean(),
  guardaId: esquemaId.nullable(),
  tecnica: txt(40),
});

const alteracoesFicha = z
  .object({
    nome: txt(80),
    subtitulo: txt(120),
    tipo: z.enum(['pj', 'pnj']),
    origem: z.enum(ORIGENS),
    faccao: txt(60),
    cla: z.enum(CLAS),
    estiloMarcial: z.enum(ESTILOS),
    nivel: z.number().int().min(1).max(20),
    atributosBase: esquemaAtributos,
    notasPublicas: txt(5000),
    notasPrivadas: txt(5000),
    notasMestre: txt(5000),
    retratoArquivoId: esquemaId.nullable(),
    donoJogadorId: esquemaId.nullable(),
    compartilhamento: z.enum(['oculta', 'resumo', 'completa']),
    creditos: z.number().int().min(0).max(99_999_999),
    registroOrigem: txt(600),
  })
  .partial();

const alteracoesToken = z
  .object({
    nome: txt(60),
    tamanho: z.number().min(0.25).max(10),
    fichaId: esquemaId.nullable(),
    retratoArquivoId: esquemaId.nullable(),
    donoJogadorId: esquemaId.nullable(),
    oculto: z.boolean(),
    cor: z.enum(CORES_TOKEN),
  })
  .partial();

const alteracoesGrade = z
  .object({
    visivel: z.boolean(),
    tamanhoCelula: z.number().min(8).max(1000),
    metrosPorCelula: z.number().min(0.1).max(1000),
    origemX: z.number().min(-20000).max(20000),
    origemY: z.number().min(-20000).max(20000),
    medicao: z.enum(MODOS_MEDICAO),
    encaixar: z.boolean(),
  })
  .partial();

export const esquemaComando = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('campanha.renomear'), nome: txt(80).min(1) }),

  z.object({ tipo: z.literal('cena.criar'), cena: esquemaCena }),
  z.object({ tipo: z.literal('cena.atualizar'), cenaId: esquemaId, nome: txt(80).min(1).optional(), notaMestre: txt(5000).optional() }),
  z.object({ tipo: z.literal('cena.grade'), cenaId: esquemaId, grade: alteracoesGrade }),
  z.object({ tipo: z.literal('cena.mapa'), cenaId: esquemaId, mapa: esquemaMapa, largura: z.number().min(64).max(20000), altura: z.number().min(64).max(20000) }),
  z.object({ tipo: z.literal('cena.duplicar'), cenaId: esquemaId }),
  z.object({ tipo: z.literal('cena.excluir'), cenaId: esquemaId }),
  z.object({ tipo: z.literal('cena.ativar'), cenaId: esquemaId }),
  z.object({ tipo: z.literal('cena.mapaJogadores'), cenaId: esquemaId, arquivoId: esquemaId, celulas: z.array(esquemaChaveCelula).max(250_000) }),

  z.object({ tipo: z.literal('token.criar'), cenaId: esquemaId, token: esquemaToken }),
  z.object({
    tipo: z.literal('token.mover'),
    cenaId: esquemaId,
    movimentos: z.array(z.object({ tokenId: esquemaId, x: z.number().min(-50000).max(50000), y: z.number().min(-50000).max(50000) })).min(1).max(200),
  }),
  z.object({ tipo: z.literal('token.atualizar'), cenaId: esquemaId, tokenId: esquemaId, alteracoes: alteracoesToken }),
  z.object({ tipo: z.literal('token.excluir'), cenaId: esquemaId, tokenIds: z.array(esquemaId).min(1).max(500) }),

  z.object({ tipo: z.literal('desenho.criar'), cenaId: esquemaId, desenho: esquemaDesenho }),
  z.object({ tipo: z.literal('desenho.excluir'), cenaId: esquemaId, desenhoIds: z.array(esquemaId).min(1).max(500) }),
  z.object({ tipo: z.literal('desenho.limpar'), cenaId: esquemaId }),

  z.object({ tipo: z.literal('nevoa.alterar'), cenaId: esquemaId, operacao: z.enum(['ocultar', 'revelar']), celulas: z.array(esquemaChaveCelula).min(1).max(250_000) }),
  z.object({ tipo: z.literal('nevoa.tudo'), cenaId: esquemaId, operacao: z.enum(['ocultar', 'revelar']) }),

  z.object({ tipo: z.literal('ficha.criar'), ficha: esquemaFicha }),
  z.object({ tipo: z.literal('ficha.atualizar'), fichaId: esquemaId, alteracoes: alteracoesFicha }),
  z.object({ tipo: z.literal('ficha.excluir'), fichaId: esquemaId }),
  z.object({ tipo: z.literal('ficha.duplicar'), fichaId: esquemaId }),
  z.object({
    tipo: z.literal('ficha.recurso'),
    fichaId: esquemaId,
    recurso: z.enum(RECURSOS),
    modo: z.enum(['delta', 'definir']),
    valor: z.number().int().min(-9999).max(9999),
    motivo: txt(200),
  }),
  z.object({ tipo: z.literal('ficha.aumento'), fichaId: esquemaId, nivel: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]), atributo: z.enum(ATRIBUTOS) }),
  z.object({ tipo: z.literal('ficha.removerAumento'), fichaId: esquemaId, nivel: z.number().int() }),
  z.object({ tipo: z.literal('ficha.ajuste'), fichaId: esquemaId, alvo: z.enum(ALVOS_AJUSTE), valor: z.number().int().min(-999).max(999), motivo: txt(300).min(1) }),
  z.object({ tipo: z.literal('ficha.removerAjuste'), fichaId: esquemaId, ajusteId: esquemaId }),
  z.object({ tipo: z.literal('ficha.ry'), fichaId: esquemaId, modo: z.enum(['sortear', 'manual']), valor: z.number().int().min(0).max(999).optional() }),
  z.object({ tipo: z.literal('ficha.item'), fichaId: esquemaId, item: esquemaItem }),
  z.object({ tipo: z.literal('ficha.removerItem'), fichaId: esquemaId, itemId: esquemaId }),
  z.object({ tipo: z.literal('ficha.tecnica'), fichaId: esquemaId, tecnica: esquemaTecnicaFicha }),
  z.object({ tipo: z.literal('ficha.removerTecnica'), fichaId: esquemaId, tecnicaId: esquemaId }),
  z.object({ tipo: z.literal('ficha.descanso'), fichaIds: z.array(esquemaId).min(1).max(100), descanso: z.enum(['vig-10min', 'ry-30min', '1h', '8h']) }),
  z.object({ tipo: z.literal('ficha.recuperar'), fichaId: esquemaId, recurso: z.enum(['vig', 'ry']) }),
  z.object({ tipo: z.literal('ficha.conjurar'), fichaId: esquemaId, grau: z.number().int().min(1).max(4), nome: txt(120) }),
  z.object({
    tipo: z.literal('ficha.condicao'),
    fichaId: esquemaId,
    estado: z.enum(['normal', 'incapacitado', 'estabilizado', 'critico']),
    sucessos: z.number().int().min(0).max(3),
    falhas: z.number().int().min(0).max(3),
  }),
  z.object({ tipo: z.literal('ficha.estabilizacao'), fichaId: esquemaId, modo: z.enum(['proprio', 'ajuda']), ajudanteFichaId: esquemaId.nullable() }),

  z.object({ tipo: z.literal('jogador.adicionar'), jogador: esquemaJogador }),
  z.object({ tipo: z.literal('jogador.renomear'), jogadorId: esquemaId, nome: txt(60).min(1) }),
  z.object({ tipo: z.literal('jogador.remover'), jogadorId: esquemaId }),

  z.object({ tipo: z.literal('dados.rolar'), expressao: txt(80), rotulo: txt(120), visibilidade: visibilidadeRolagem }),
  z.object({ tipo: z.literal('teste.atributo'), fichaId: esquemaId, atributo: z.enum(ATRIBUTOS), visibilidade: visibilidadeRolagem }),
  z.object({ tipo: z.literal('historico.limpar') }),

  z.object({
    tipo: z.literal('combate.iniciar'),
    participantes: z.array(z.object({ nome: txt(60).min(1), tokenId: esquemaId.nullable(), fichaId: esquemaId.nullable() })).max(200),
  }),
  z.object({ tipo: z.literal('combate.encerrar') }),
  z.object({ tipo: z.literal('combate.adicionar'), nome: txt(60).min(1), tokenId: esquemaId.nullable(), fichaId: esquemaId.nullable() }),
  z.object({ tipo: z.literal('combate.remover'), participanteId: esquemaId }),
  z.object({ tipo: z.literal('combate.rolarIniciativa'), participanteIds: z.array(esquemaId).max(200).nullable() }),
  z.object({ tipo: z.literal('combate.definirIniciativa'), participanteId: esquemaId, valor: z.number().int().min(-99).max(999).nullable() }),
  z.object({ tipo: z.literal('combate.ordenar'), ordem: z.array(esquemaId).min(1).max(200) }),
  z.object({ tipo: z.literal('combate.avancar') }),
  z.object({ tipo: z.literal('combate.voltar') }),
  z.object({ tipo: z.literal('combate.acao'), participanteId: esquemaId, acao: z.enum(['principal', 'movimento', 'reacao']), usada: z.boolean(), descricao: txt(120) }),
  z.object({ tipo: z.literal('combate.postura'), participanteId: esquemaId, postura: z.enum(POSTURAS) }),
  z.object({ tipo: z.literal('combate.criarGuarda'), inferiorId: esquemaId, superiorId: esquemaId, subcategoria: z.enum(SUBCATEGORIAS_GUARDA) }),
  z.object({ tipo: z.literal('combate.editarGuarda'), guardaId: esquemaId, subcategoria: z.enum(SUBCATEGORIAS_GUARDA).optional(), contador: z.number().int().min(0).max(1).optional() }),
  z.object({ tipo: z.literal('combate.criarControle'), controladorId: esquemaId, controladoId: esquemaId, posicao: z.enum(POSICOES_CONTROLE) }),
  z.object({ tipo: z.literal('combate.removerVinculo'), vinculo: z.enum(['guarda', 'controle']), id: esquemaId }),
  z.object({ tipo: z.literal('combate.removerIntervalo'), combatenteId: esquemaId, oponenteId: esquemaId }),
  z.object({
    tipo: z.literal('combate.resolverAtaque'),
    pedido: z.object({ atacanteFichaId: esquemaId, alvoFichaId: esquemaId, atributo: z.enum(ATRIBUTOS), arma: z.enum(CATEGORIAS_ARMA) }),
  }),
  z.object({ tipo: z.literal('combate.resolverTransicao'), pedido: pedidoTransicao }),
  z.object({
    tipo: z.literal('pendencia.confirmar'),
    pendenciaId: esquemaId,
    opcao: z.number().int().min(0).max(5),
    /** índice do efeito ajustável → novo delta */
    substituicoes: z.record(z.string().regex(/^\d{1,2}$/), z.number().int().min(-9999).max(9999)),
    /** "mestre" mantém o resultado fora do histórico dos jogadores (ex.: combatente oculto). */
    visibilidade: visibilidadeRolagem,
  }),
  z.object({ tipo: z.literal('pendencia.cancelar'), pendenciaId: esquemaId }),

  z.object({ tipo: z.literal('compendio.liberar'), ids: z.array(esquemaId).min(1).max(2000), liberar: z.boolean() }),
  z.object({ tipo: z.literal('compendio.salvar'), entrada: esquemaEntradaCompendio }),
  z.object({ tipo: z.literal('compendio.excluir'), entradaId: esquemaId }),
  z.object({ tipo: z.literal('compendio.importar'), entradas: z.array(esquemaEntradaCompendio).min(1).max(500) }),

  z.object({ tipo: z.literal('diario.salvar'), entrada: esquemaEntradaDiario }),
  z.object({ tipo: z.literal('diario.excluir'), entradaId: esquemaId }),

  z.object({ tipo: z.literal('decisao.registrar'), texto: txt(2000).min(1), referencia: txt(60) }),
  z.object({ tipo: z.literal('decisao.excluir'), decisaoId: esquemaId }),

  z.object({ tipo: z.literal('arquivo.registrar'), meta: esquemaMetaArquivo }),
  z.object({ tipo: z.literal('arquivo.remover'), arquivoId: esquemaId }),
]);

export type Comando = z.infer<typeof esquemaComando>;
export type TipoComando = Comando['tipo'];

export interface ContextoComando {
  agora: string;
  novoId(): Id;
  fonte: FonteAleatoria;
  ator: Ator;
}

export type ResultadoComando = { ok: true; campanha: Campanha } | { ok: false; erro: string };

class ErroComando extends Error {}
const falhar = (mensagem: string): never => {
  throw new ErroComando(mensagem);
};

// ───────────────────────── Autorização ─────────────────────────

/** Comandos que um jogador pode enviar (com as checagens específicas abaixo). */
const COMANDOS_DE_JOGADOR: ReadonlySet<TipoComando> = new Set<TipoComando>([
  'token.mover',
  'ficha.recurso',
  'ficha.atualizar',
  'ficha.item',
  'ficha.removerItem',
  'ficha.recuperar',
  'ficha.conjurar',
  'dados.rolar',
  'teste.atributo',
]);

const CAMPOS_FICHA_DO_JOGADOR = new Set(['notasPublicas', 'notasPrivadas', 'creditos']);

export function tokenPertenceA(campanha: Campanha, token: Token, jogadorId: Id): boolean {
  if (token.donoJogadorId === jogadorId) return true;
  if (!token.fichaId) return false;
  return campanha.fichas.some((f) => f.id === token.fichaId && f.donoJogadorId === jogadorId);
}

function tokenOcultoParaJogadores(cena: Cena, token: Token, nevoa: Set<string>): boolean {
  return token.oculto || tokenSobNevoa(token, cena, nevoa);
}

/** Devolve null quando autorizado, ou a mensagem de recusa. */
export function autorizar(campanha: Campanha, comando: Comando, ator: Ator): string | null {
  if (ator.papel === 'mestre') return null;
  const jogadorId = ator.jogadorId;
  if (!jogadorId || !campanha.jogadores.some((j) => j.id === jogadorId)) return 'Jogador não reconhecido nesta mesa.';
  if (!COMANDOS_DE_JOGADOR.has(comando.tipo)) return 'Apenas o mestre pode fazer isso.';

  const fichaPropria = (fichaId: Id): string | null => {
    const f = campanha.fichas.find((x) => x.id === fichaId);
    if (!f || f.donoJogadorId !== jogadorId) return 'Você só pode alterar a sua própria ficha.';
    return null;
  };

  switch (comando.tipo) {
    case 'token.mover': {
      if (comando.cenaId !== campanha.cenaAtivaId) return 'Só é possível mover tokens na cena ativa.';
      const cena = campanha.cenas.find((c) => c.id === comando.cenaId);
      if (!cena) return 'Cena não encontrada.';
      const nevoa = new Set(cena.nevoa);
      for (const m of comando.movimentos) {
        const token = cena.tokens.find((t) => t.id === m.tokenId);
        // A mesma resposta para token inexistente, oculto ou alheio: não revela o que existe.
        if (!token || tokenOcultoParaJogadores(cena, token, nevoa) || !tokenPertenceA(campanha, token, jogadorId)) {
          return 'Você só pode mover os seus próprios tokens.';
        }
      }
      return null;
    }
    case 'ficha.atualizar': {
      const recusa = fichaPropria(comando.fichaId);
      if (recusa) return recusa;
      const proibido = Object.keys(comando.alteracoes).find((k) => !CAMPOS_FICHA_DO_JOGADOR.has(k));
      return proibido ? 'Esse campo da ficha só pode ser alterado pelo mestre.' : null;
    }
    case 'ficha.recurso':
    case 'ficha.item':
    case 'ficha.removerItem':
    case 'ficha.recuperar':
    case 'ficha.conjurar':
    case 'teste.atributo':
      return fichaPropria(comando.fichaId);
    case 'dados.rolar':
      return null;
    default:
      return 'Apenas o mestre pode fazer isso.';
  }
}

// ───────────────────────── Execução ─────────────────────────

function cenaDe(c: Campanha, id: Id): Cena {
  return c.cenas.find((x) => x.id === id) ?? falhar('Cena não encontrada.');
}
function fichaDe(c: Campanha, id: Id): Ficha {
  return c.fichas.find((x) => x.id === id) ?? falhar('Ficha não encontrada.');
}

function registrarEvento(c: Campanha, ctx: ContextoComando, rotulo: string, visibilidade: 'publica' | 'mestre' = 'publica'): void {
  c.historico.push({
    id: ctx.novoId(),
    em: ctx.agora,
    autor: { papel: ctx.ator.papel, jogadorId: ctx.ator.jogadorId, nome: ctx.ator.nome.slice(0, 60) },
    tipo: 'evento',
    rotulo: rotulo.slice(0, 160),
    resultado: null,
    visibilidade,
  });
  apararHistorico(c);
}

function apararHistorico(c: Campanha): void {
  if (c.historico.length > 500) c.historico.splice(0, c.historico.length - 500);
}

function fichaReferenciadaExiste(c: Campanha, fichaId: Id | null): void {
  if (fichaId && !c.fichas.some((f) => f.id === fichaId)) falhar('A ficha vinculada não existe.');
}
function jogadorExiste(c: Campanha, jogadorId: Id | null): void {
  if (jogadorId && !c.jogadores.some((j) => j.id === jogadorId)) falhar('O jogador indicado não existe nesta mesa.');
}

function aplicar(c: Campanha, cmd: Comando, ctx: ContextoComando): void {
  const autor = ctx.ator.nome;
  switch (cmd.tipo) {
    case 'campanha.renomear':
      c.nome = cmd.nome.trim() || c.nome;
      return;

    // ── Cenas ──
    case 'cena.criar': {
      if (c.cenas.some((x) => x.id === cmd.cena.id)) falhar('Já existe uma cena com este identificador.');
      c.cenas.push({ ...cmd.cena, mapaJogadores: null });
      if (!c.cenaAtivaId) c.cenaAtivaId = cmd.cena.id;
      return;
    }
    case 'cena.atualizar': {
      const cena = cenaDe(c, cmd.cenaId);
      if (cmd.nome !== undefined) cena.nome = cmd.nome.trim() || cena.nome;
      if (cmd.notaMestre !== undefined) cena.notaMestre = cmd.notaMestre;
      return;
    }
    case 'cena.grade': {
      const cena = cenaDe(c, cmd.cenaId);
      const antiga = { ...cena.grade };
      Object.assign(cena.grade, cmd.grade);
      const geometriaMudou =
        antiga.tamanhoCelula !== cena.grade.tamanhoCelula ||
        antiga.origemX !== cena.grade.origemX ||
        antiga.origemY !== cena.grade.origemY;
      if (geometriaMudou && cena.nevoa.length > 0) {
        cena.nevoa = reamostrarNevoa(cena.nevoa, antiga, cena.grade, cena);
        cena.mapaJogadores = null;
      }
      return;
    }
    case 'cena.mapa': {
      const cena = cenaDe(c, cmd.cenaId);
      if (cmd.mapa.tipo === 'arquivo') {
        const arquivoId = cmd.mapa.arquivoId;
        if (!c.arquivos.some((a) => a.id === arquivoId)) falhar('O arquivo do mapa não está registrado na campanha.');
      }
      cena.mapa = cmd.mapa;
      cena.largura = cmd.largura;
      cena.altura = cmd.altura;
      cena.mapaJogadores = null;
      cena.demo = cmd.mapa.tipo === 'demo';
      return;
    }
    case 'cena.duplicar': {
      const cena = cenaDe(c, cmd.cenaId);
      if (c.cenas.length >= 200) falhar('Limite de cenas atingido.');
      c.cenas.push(duplicarCena(cena, ctx.novoId));
      return;
    }
    case 'cena.excluir': {
      const indice = c.cenas.findIndex((x) => x.id === cmd.cenaId);
      if (indice < 0) falhar('Cena não encontrada.');
      c.cenas.splice(indice, 1);
      if (c.cenaAtivaId === cmd.cenaId) c.cenaAtivaId = c.cenas[0]?.id ?? null;
      return;
    }
    case 'cena.ativar':
      cenaDe(c, cmd.cenaId);
      c.cenaAtivaId = cmd.cenaId;
      return;
    case 'cena.mapaJogadores': {
      const cena = cenaDe(c, cmd.cenaId);
      if (!c.arquivos.some((a) => a.id === cmd.arquivoId)) falhar('O arquivo preparado para jogadores não está registrado.');
      cena.mapaJogadores = { arquivoId: cmd.arquivoId, celulas: cmd.celulas };
      return;
    }

    // ── Tokens ──
    case 'token.criar': {
      const cena = cenaDe(c, cmd.cenaId);
      if (cena.tokens.some((t) => t.id === cmd.token.id)) falhar('Já existe um token com este identificador.');
      if (cena.tokens.length >= 500) falhar('Limite de tokens na cena atingido.');
      fichaReferenciadaExiste(c, cmd.token.fichaId);
      jogadorExiste(c, cmd.token.donoJogadorId);
      cena.tokens.push(cmd.token);
      return;
    }
    case 'token.mover': {
      const cena = cenaDe(c, cmd.cenaId);
      for (const m of cmd.movimentos) {
        const token = cena.tokens.find((t) => t.id === m.tokenId) ?? falhar('Token não encontrado.');
        token.x = Math.min(cena.largura, Math.max(0, m.x));
        token.y = Math.min(cena.altura, Math.max(0, m.y));
      }
      return;
    }
    case 'token.atualizar': {
      const cena = cenaDe(c, cmd.cenaId);
      const token = cena.tokens.find((t) => t.id === cmd.tokenId) ?? falhar('Token não encontrado.');
      if (cmd.alteracoes.fichaId !== undefined) fichaReferenciadaExiste(c, cmd.alteracoes.fichaId);
      if (cmd.alteracoes.donoJogadorId !== undefined) jogadorExiste(c, cmd.alteracoes.donoJogadorId);
      Object.assign(token, cmd.alteracoes);
      return;
    }
    case 'token.excluir': {
      const cena = cenaDe(c, cmd.cenaId);
      const ids = new Set(cmd.tokenIds);
      cena.tokens = cena.tokens.filter((t) => !ids.has(t.id));
      if (c.combate) {
        for (const p of c.combate.participantes) if (p.tokenId && ids.has(p.tokenId)) p.tokenId = null;
      }
      return;
    }

    // ── Desenhos ──
    case 'desenho.criar': {
      const cena = cenaDe(c, cmd.cenaId);
      if (cena.desenhos.length >= 500) falhar('Limite de desenhos na cena atingido.');
      if (cena.desenhos.some((d) => d.id === cmd.desenho.id)) falhar('Já existe um desenho com este identificador.');
      cena.desenhos.push(cmd.desenho);
      return;
    }
    case 'desenho.excluir': {
      const cena = cenaDe(c, cmd.cenaId);
      const ids = new Set(cmd.desenhoIds);
      cena.desenhos = cena.desenhos.filter((d) => !ids.has(d.id));
      return;
    }
    case 'desenho.limpar':
      cenaDe(c, cmd.cenaId).desenhos = [];
      return;

    // ── Névoa ──
    case 'nevoa.alterar': {
      const cena = cenaDe(c, cmd.cenaId);
      const conjunto = new Set(cena.nevoa);
      const validas = new Set(todasAsCelulas(cena));
      for (const chave of cmd.celulas) {
        if (cmd.operacao === 'ocultar') {
          if (validas.has(chave)) conjunto.add(chave);
        } else conjunto.delete(chave);
      }
      cena.nevoa = [...conjunto];
      return;
    }
    case 'nevoa.tudo': {
      const cena = cenaDe(c, cmd.cenaId);
      cena.nevoa = cmd.operacao === 'ocultar' ? todasAsCelulas(cena) : [];
      return;
    }

    // ── Fichas ──
    case 'ficha.criar': {
      if (c.fichas.some((f) => f.id === cmd.ficha.id)) falhar('Já existe uma ficha com este identificador.');
      if (c.fichas.length >= 500) falhar('Limite de fichas atingido.');
      jogadorExiste(c, cmd.ficha.donoJogadorId);
      const ficha: Ficha = { ...cmd.ficha, visaoParcial: undefined };
      delete ficha.visaoParcial;
      if (ficha.origem === 'esquecido') {
        ficha.ryBase = 0;
        ficha.atributosBase = { ...ficha.atributosBase, yan: 0 };
        ficha.aumentos = ficha.aumentos.filter((a) => a.atributo !== 'yan');
      }
      limitarRecursos(ficha);
      c.fichas.push(ficha);
      return;
    }
    case 'ficha.atualizar': {
      const f = fichaDe(c, cmd.fichaId);
      const a = cmd.alteracoes;
      if (a.donoJogadorId !== undefined) jogadorExiste(c, a.donoJogadorId);
      const nucleo: Array<keyof typeof a> = ['origem', 'nivel', 'cla', 'faccao', 'estiloMarcial', 'donoJogadorId', 'compartilhamento'];
      for (const campo of nucleo) {
        if (a[campo] !== undefined && a[campo] !== f[campo]) {
          registrarAlteracao(f, ctx, autor, campo, String(f[campo] ?? '—'), String(a[campo] ?? '—'));
        }
      }
      if (a.atributosBase) {
        for (const k of ATRIBUTOS) {
          if (a.atributosBase[k] !== f.atributosBase[k]) {
            registrarAlteracao(f, ctx, autor, `${SIGLA_ATRIBUTO[k]} base`, f.atributosBase[k], a.atributosBase[k], 'Edição manual');
          }
        }
      }
      Object.assign(f, a);
      if (f.origem === 'esquecido') {
        // Esquecidos não possuem Yant: reserva 0 e YAN 0, sem exceção por edição.
        f.ryBase = 0;
        f.atributosBase.yan = 0;
        f.aumentos = f.aumentos.filter((x) => x.atributo !== 'yan');
      }
      f.aumentos = f.aumentos.filter((x) => x.nivel <= f.nivel);
      limitarRecursos(f);
      return;
    }
    case 'ficha.excluir': {
      const indice = c.fichas.findIndex((f) => f.id === cmd.fichaId);
      if (indice < 0) falhar('Ficha não encontrada.');
      c.fichas.splice(indice, 1);
      for (const cena of c.cenas) for (const t of cena.tokens) if (t.fichaId === cmd.fichaId) t.fichaId = null;
      if (c.combate) for (const p of c.combate.participantes) if (p.fichaId === cmd.fichaId) p.fichaId = null;
      c.pendencias = c.pendencias.filter((p) => p.executorFichaId !== cmd.fichaId && p.alvoFichaId !== cmd.fichaId);
      return;
    }
    case 'ficha.duplicar': {
      const f = fichaDe(c, cmd.fichaId);
      if (c.fichas.length >= 500) falhar('Limite de fichas atingido.');
      const copia: Ficha = structuredClone(JSON.parse(JSON.stringify(f)) as Ficha);
      copia.id = `ficha_${ctx.novoId()}`;
      copia.nome = `${f.nome} (cópia)`.slice(0, 80);
      copia.donoJogadorId = null;
      copia.registro = [];
      copia.equipamento = copia.equipamento.map((i) => ({ ...i, id: `item_${ctx.novoId()}` }));
      copia.tecnicas = copia.tecnicas.map((t) => ({ ...t, id: `tec_${ctx.novoId()}` }));
      copia.ajustes = copia.ajustes.map((x) => ({ ...x, id: `aj_${ctx.novoId()}` }));
      c.fichas.push(copia);
      return;
    }
    case 'ficha.recurso': {
      const f = fichaDe(c, cmd.fichaId);
      const antes = cmd.recurso === 'pv' ? f.pvAtual : cmd.recurso === 'vig' ? f.vigAtual : f.ryAtual;
      const alvo = cmd.modo === 'delta' ? antes + cmd.valor : cmd.valor;
      alterarRecursoFicha(f, cmd.recurso, alvo);
      const depois = cmd.recurso === 'pv' ? f.pvAtual : cmd.recurso === 'vig' ? f.vigAtual : f.ryAtual;
      if (antes !== depois) registrarAlteracao(f, ctx, autor, cmd.recurso.toUpperCase(), antes, depois, cmd.motivo);
      return;
    }
    case 'ficha.aumento': {
      // [criacao-atributos] [aumento-fis]
      const f = fichaDe(c, cmd.fichaId);
      if (f.nivel < cmd.nivel) falhar(`O aumento do nível ${cmd.nivel} só pode ser registrado a partir desse nível.`);
      if (f.aumentos.some((a) => a.nivel === cmd.nivel)) falhar(`O aumento do nível ${cmd.nivel} já foi registrado.`);
      if (f.origem === 'esquecido' && cmd.atributo === 'yan') falhar('Esquecidos mantêm YAN 0.');
      const atual = atributosPermanentes(f)[cmd.atributo];
      if (atual + 1 > TETO_ATRIBUTO) falhar(`${SIGLA_ATRIBUTO[cmd.atributo]} já está no teto de +${TETO_ATRIBUTO}.`);
      f.aumentos.push({ nivel: cmd.nivel, atributo: cmd.atributo });
      f.aumentos.sort((a, b) => a.nivel - b.nivel);
      registrarAlteracao(f, ctx, autor, SIGLA_ATRIBUTO[cmd.atributo], atual, atual + 1, `Aumento do nível ${cmd.nivel}`);
      if (cmd.atributo === 'fis') {
        // +2 aos PV e à VIG atuais, uma única vez: o aumento de cada nível só pode ser registrado uma vez.
        const pv = f.pvAtual;
        const vig = f.vigAtual;
        alterarRecursoFicha(f, 'pv', pv + 2);
        alterarRecursoFicha(f, 'vig', vig + 2);
        registrarAlteracao(f, ctx, autor, 'PV', pv, f.pvAtual, '+1 permanente em FIS');
        registrarAlteracao(f, ctx, autor, 'VIG', vig, f.vigAtual, '+1 permanente em FIS');
      }
      limitarRecursos(f);
      return;
    }
    case 'ficha.removerAumento': {
      const f = fichaDe(c, cmd.fichaId);
      const aumento = f.aumentos.find((a) => a.nivel === cmd.nivel) ?? falhar('Aumento não encontrado.');
      f.aumentos = f.aumentos.filter((a) => a !== aumento);
      registrarAlteracao(f, ctx, autor, SIGLA_ATRIBUTO[aumento.atributo], 'aumento', 'removido', `Correção do nível ${cmd.nivel}`);
      limitarRecursos(f);
      return;
    }
    case 'ficha.ajuste': {
      const f = fichaDe(c, cmd.fichaId);
      if (f.ajustes.length >= 50) falhar('Limite de ajustes manuais atingido.');
      f.ajustes.push({ id: `aj_${ctx.novoId()}`, alvo: cmd.alvo, valor: cmd.valor, motivo: cmd.motivo, em: ctx.agora, autor: autor.slice(0, 80) });
      registrarAlteracao(f, ctx, autor, `Ajuste manual: ${cmd.alvo}`, '—', cmd.valor > 0 ? `+${cmd.valor}` : cmd.valor, cmd.motivo);
      limitarRecursos(f);
      return;
    }
    case 'ficha.removerAjuste': {
      const f = fichaDe(c, cmd.fichaId);
      const ajuste = f.ajustes.find((a) => a.id === cmd.ajusteId) ?? falhar('Ajuste não encontrado.');
      f.ajustes = f.ajustes.filter((a) => a !== ajuste);
      registrarAlteracao(f, ctx, autor, `Ajuste manual: ${ajuste.alvo}`, ajuste.valor, 'removido');
      limitarRecursos(f);
      return;
    }
    case 'ficha.ry': {
      const f = fichaDe(c, cmd.fichaId);
      if (f.origem === 'esquecido') falhar('Esquecidos não possuem Yant: a reserva é 0.');
      const antes = f.ryBase;
      if (cmd.modo === 'sortear') {
        const r = sortearRy(f.origem, ctx.fonte);
        f.ryBase = r.valor;
        f.ryDetalhe = r.detalhe;
      } else {
        f.ryBase = cmd.valor ?? falhar('Informe o valor da reserva.');
        f.ryDetalhe = 'Valor definido manualmente pelo mestre.';
      }
      registrarAlteracao(f, ctx, autor, 'Reserva de Yant', antes, f.ryBase, f.ryDetalhe);
      f.ryAtual = Math.min(f.ryAtual, derivar(f).ryMax.total);
      if (antes === 0) f.ryAtual = derivar(f).ryMax.total;
      return;
    }
    case 'ficha.item': {
      const f = fichaDe(c, cmd.fichaId);
      const indice = f.equipamento.findIndex((i) => i.id === cmd.item.id);
      if (indice >= 0) f.equipamento[indice] = cmd.item;
      else {
        if (f.equipamento.length >= 200) falhar('Limite de itens atingido.');
        f.equipamento.push(cmd.item);
      }
      // Uma armadura e um escudo equipados por vez.
      if (cmd.item.equipado && (cmd.item.tipo === 'armadura' || cmd.item.tipo === 'escudo')) {
        for (const i of f.equipamento) if (i.id !== cmd.item.id && i.tipo === cmd.item.tipo) i.equipado = false;
      }
      return;
    }
    case 'ficha.removerItem': {
      const f = fichaDe(c, cmd.fichaId);
      f.equipamento = f.equipamento.filter((i) => i.id !== cmd.itemId);
      return;
    }
    case 'ficha.tecnica': {
      const f = fichaDe(c, cmd.fichaId);
      if (cmd.tecnica.tipo === 'yant' && f.origem === 'esquecido') falhar('Esquecidos não usam Yant: não é possível registrar técnicas de Yant.');
      const indice = f.tecnicas.findIndex((t) => t.id === cmd.tecnica.id);
      if (indice >= 0) f.tecnicas[indice] = cmd.tecnica;
      else {
        if (f.tecnicas.length >= 100) falhar('Limite de técnicas atingido.');
        f.tecnicas.push(cmd.tecnica);
      }
      return;
    }
    case 'ficha.removerTecnica': {
      const f = fichaDe(c, cmd.fichaId);
      f.tecnicas = f.tecnicas.filter((t) => t.id !== cmd.tecnicaId);
      return;
    }
    case 'ficha.descanso': {
      // [recuperacao]
      for (const id of cmd.fichaIds) {
        const f = fichaDe(c, id);
        const d = derivar(f);
        const marcar = (recurso: 'pv' | 'vig' | 'ry', valor: number, motivo: string) => {
          const antes = recurso === 'pv' ? f.pvAtual : recurso === 'vig' ? f.vigAtual : f.ryAtual;
          alterarRecursoFicha(f, recurso, Math.max(antes, valor));
          const depois = recurso === 'pv' ? f.pvAtual : recurso === 'vig' ? f.vigAtual : f.ryAtual;
          if (antes !== depois) registrarAlteracao(f, ctx, autor, recurso.toUpperCase(), antes, depois, motivo);
        };
        if (cmd.descanso === 'vig-10min') marcar('vig', d.vigMax.total, 'Descanso seguro de 10 min');
        else if (cmd.descanso === 'ry-30min') {
          marcar('vig', d.vigMax.total, 'Descanso seguro de 30 min');
          marcar('ry', d.ryMax.total, 'Descanso seguro de 30 min');
        } else if (cmd.descanso === '1h') {
          marcar('vig', d.vigMax.total, 'Descanso de 1 h');
          marcar('ry', d.ryMax.total, 'Descanso de 1 h');
          const antes = f.pvAtual;
          alterarRecursoFicha(f, 'pv', antes + Math.floor(d.pvMax.total / 2));
          if (antes !== f.pvAtual) registrarAlteracao(f, ctx, autor, 'PV', antes, f.pvAtual, 'Descanso de 1 h (metade dos PV máximos)');
        } else {
          marcar('vig', d.vigMax.total, 'Descanso de 8 h');
          marcar('ry', d.ryMax.total, 'Descanso de 8 h');
          marcar('pv', d.pvMax.total, 'Descanso de 8 h');
        }
      }
      return;
    }
    case 'ficha.recuperar': {
      // [recuperacao] ação principal: VIG +3 ou RY +2.
      const f = fichaDe(c, cmd.fichaId);
      if (cmd.recurso === 'ry' && f.origem === 'esquecido') falhar('Esquecidos não possuem Yant.');
      const p = c.combate?.participantes.find((x) => x.fichaId === f.id);
      if (p?.acaoPrincipal) falhar(`${f.nome} já usou a ação principal nesta rodada.`);
      const antes = cmd.recurso === 'vig' ? f.vigAtual : f.ryAtual;
      alterarRecursoFicha(f, cmd.recurso, antes + (cmd.recurso === 'vig' ? 3 : 2));
      const depois = cmd.recurso === 'vig' ? f.vigAtual : f.ryAtual;
      registrarAlteracao(f, ctx, autor, cmd.recurso.toUpperCase(), antes, depois, 'Recuperação com ação principal');
      if (c.combate && p) {
        const marcadas = consumirAcaoPrincipal(c.combate, p.id, null);
        for (const linha of concluirAcao(c.combate, marcadas)) registrarEvento(c, ctx, linha);
      }
      registrarEvento(c, ctx, `${f.nome} recupera ${cmd.recurso === 'vig' ? 'vigor' : 'Yant'}: ${cmd.recurso.toUpperCase()} ${antes} → ${depois}`);
      return;
    }
    case 'ficha.conjurar': {
      // [graus-yant] custo fixo por grau; sem desconto de eficiência.
      const f = fichaDe(c, cmd.fichaId);
      const v = verificarGrauYant(f, cmd.grau);
      if (!v.ok) return falhar(v.erro);
      const antes = f.ryAtual;
      alterarRecursoFicha(f, 'ry', antes - v.custo);
      const nome = cmd.nome.trim() || `técnica de grau ${ROTULO_GRAU[cmd.grau]}`;
      registrarAlteracao(f, ctx, autor, 'RY', antes, f.ryAtual, `Yant grau ${ROTULO_GRAU[cmd.grau]}: ${nome}`);
      registrarEvento(c, ctx, `${f.nome} usa Yant grau ${ROTULO_GRAU[cmd.grau]} (${nome}): RY ${antes} → ${f.ryAtual} (custo ${CUSTO_GRAU_YANT[cmd.grau]})`);
      return;
    }
    case 'ficha.condicao': {
      const f = fichaDe(c, cmd.fichaId);
      const antes = f.condicao.estado;
      f.condicao = { estado: cmd.estado, sucessos: cmd.sucessos, falhas: cmd.falhas };
      if (antes !== cmd.estado) registrarAlteracao(f, ctx, autor, 'Condição', antes, cmd.estado, 'Ajuste do mestre');
      return;
    }
    case 'ficha.estabilizacao': {
      // [zero-pv]
      const f = fichaDe(c, cmd.fichaId);
      if (f.condicao.estado !== 'incapacitado') falhar(`${f.nome} não está incapacitado.`);
      if (cmd.modo === 'ajuda') {
        const ajudante = fichaDe(c, cmd.ajudanteFichaId ?? falhar('Escolha quem presta ajuda.'));
        if (ajudante.id === f.id) falhar('A ajuda precisa vir de outro personagem.');
        const p = c.combate?.participantes.find((x) => x.fichaId === ajudante.id);
        if (p?.acaoPrincipal) falhar(`${ajudante.nome} já usou a ação principal nesta rodada.`);
        const mod = derivar(ajudante).atributosTeste.men;
        const r = rolarD20(mod, ctx.fonte);
        if (c.combate && p) {
          const marcadas = consumirAcaoPrincipal(c.combate, p.id, null);
          for (const linha of concluirAcao(c.combate, marcadas)) registrarEvento(c, ctx, linha);
        }
        const base = `${ajudante.nome} tenta estabilizar ${f.nome}: MEN ${descreverRolagem(r)} contra CD 12`;
        if (r.total > 12) {
          f.condicao = { estado: 'estabilizado', sucessos: 0, falhas: 0 };
          registrarEvento(c, ctx, `${base} — estabilizado.`);
        } else if (r.total === 12) registrarEvento(c, ctx, `${base} — total igual à CD: decisão do mestre.`);
        else registrarEvento(c, ctx, `${base} — sem sucesso.`);
        return;
      }
      const mod = derivar(f).atributosTeste.fis;
      const r = rolarD20(mod, ctx.fonte);
      const base = `${f.nome}, teste de estabilização: FIS ${descreverRolagem(r)} contra CD 10`;
      if (r.total === 10) {
        registrarEvento(c, ctx, `${base} — total igual à CD: decisão do mestre.`);
        return;
      }
      if (r.total > 10) f.condicao.sucessos = Math.min(3, f.condicao.sucessos + 1);
      else f.condicao.falhas = Math.min(3, f.condicao.falhas + 1);
      let fim = r.total > 10 ? `sucesso (${f.condicao.sucessos}/3)` : `falha (${f.condicao.falhas}/3)`;
      if (f.condicao.sucessos >= 3) {
        f.condicao = { estado: 'estabilizado', sucessos: 0, falhas: 0 };
        fim += ' — estabilizado';
      } else if (f.condicao.falhas >= 3) {
        f.condicao = { estado: 'critico', sucessos: 0, falhas: 0 };
        fim += ' — estado crítico: exige ajuda (sem morte instantânea)';
      }
      registrarEvento(c, ctx, `${base} — ${fim}.`);
      return;
    }

    // ── Jogadores ──
    case 'jogador.adicionar':
      if (c.jogadores.some((j) => j.id === cmd.jogador.id)) falhar('Já existe um jogador com este identificador.');
      if (c.jogadores.length >= 40) falhar('Limite de jogadores atingido.');
      c.jogadores.push(cmd.jogador);
      return;
    case 'jogador.renomear': {
      const j = c.jogadores.find((x) => x.id === cmd.jogadorId) ?? falhar('Jogador não encontrado.');
      j.nome = cmd.nome.trim() || j.nome;
      return;
    }
    case 'jogador.remover': {
      c.jogadores = c.jogadores.filter((j) => j.id !== cmd.jogadorId);
      for (const f of c.fichas) if (f.donoJogadorId === cmd.jogadorId) f.donoJogadorId = null;
      for (const cena of c.cenas) for (const t of cena.tokens) if (t.donoJogadorId === cmd.jogadorId) t.donoJogadorId = null;
      return;
    }

    // ── Dados ──
    case 'dados.rolar': {
      const analise = analisarExpressao(cmd.expressao);
      if (!analise.ok) return falhar(analise.erro);
      const resultado = rolar(analise.expressao, ctx.fonte);
      c.historico.push({
        id: ctx.novoId(),
        em: ctx.agora,
        autor: { papel: ctx.ator.papel, jogadorId: ctx.ator.jogadorId, nome: ctx.ator.nome.slice(0, 60) },
        tipo: 'rolagem',
        rotulo: (cmd.rotulo.trim() || 'Rolagem livre').slice(0, 160),
        resultado,
        visibilidade: cmd.visibilidade,
      });
      apararHistorico(c);
      return;
    }
    case 'teste.atributo': {
      const f = fichaDe(c, cmd.fichaId);
      const d = derivar(f);
      const resultado = rolarD20(d.atributosTeste[cmd.atributo], ctx.fonte);
      const penalidade = d.penalidadeRyZero === 'ativa' && (cmd.atributo === 'men' || cmd.atributo === 'yan') ? ' (−2 por RY 0)' : '';
      c.historico.push({
        id: ctx.novoId(),
        em: ctx.agora,
        autor: { papel: ctx.ator.papel, jogadorId: ctx.ator.jogadorId, nome: ctx.ator.nome.slice(0, 60) },
        tipo: 'rolagem',
        rotulo: `${f.nome} · Teste de ${SIGLA_ATRIBUTO[cmd.atributo]}${penalidade}`.slice(0, 160),
        resultado: { expressao: resultado.expressao, termos: resultado.termos, modificador: resultado.modificador, total: resultado.total },
        visibilidade: cmd.visibilidade,
      });
      apararHistorico(c);
      return;
    }
    case 'historico.limpar':
      c.historico = [];
      return;

    // ── Combate ──
    case 'combate.iniciar': {
      const combate = novoCombate();
      for (const p of cmd.participantes) {
        fichaReferenciadaExiste(c, p.fichaId);
        combate.participantes.push({
          id: `part_${ctx.novoId()}`,
          nome: p.nome,
          tokenId: p.tokenId,
          fichaId: p.fichaId,
          iniciativa: null,
          detalheIniciativa: '',
          acaoPrincipal: false,
          movimento: false,
          reacao: false,
          postura: 'em-pe',
        });
      }
      c.combate = combate;
      c.pendencias = [];
      registrarEvento(c, ctx, 'Combate iniciado.');
      return;
    }
    case 'combate.encerrar':
      if (!c.combate) falhar('Não há combate em andamento.');
      c.combate = null;
      c.pendencias = [];
      registrarEvento(c, ctx, 'Combate encerrado.');
      return;
    case 'combate.adicionar': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      fichaReferenciadaExiste(c, cmd.fichaId);
      if (cmd.tokenId && combate.participantes.some((p) => p.tokenId === cmd.tokenId)) falhar('Este token já está na iniciativa.');
      combate.participantes.push({
        id: `part_${ctx.novoId()}`,
        nome: cmd.nome,
        tokenId: cmd.tokenId,
        fichaId: cmd.fichaId,
        iniciativa: null,
        detalheIniciativa: '',
        acaoPrincipal: false,
        movimento: false,
        reacao: false,
        postura: 'em-pe',
      });
      return;
    }
    case 'combate.remover': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      removerParticipante(combate, cmd.participanteId);
      return;
    }
    case 'combate.rolarIniciativa': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      const ids = cmd.participanteIds ?? combate.participantes.map((p) => p.id);
      const linhas = rolarIniciativa(combate, c.fichas, ids, ctx.fonte);
      // Rolagem geral: o combate recomeça do topo da nova ordem.
      if (cmd.participanteIds === null) combate.turno = 0;
      registrarEvento(c, ctx, `Iniciativa (d20 + DES): ${linhas.join('; ')}`, 'mestre');
      if (combate.empates.length > 0) registrarEvento(c, ctx, 'Empate na iniciativa: o mestre decide a ordem.', 'mestre');
      return;
    }
    case 'combate.definirIniciativa': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      const p = participante(combate, cmd.participanteId) ?? falhar('Participante não encontrado.');
      p.iniciativa = cmd.valor;
      p.detalheIniciativa = cmd.valor === null ? '' : 'Ajuste manual do mestre';
      ordenarPorIniciativa(combate);
      return;
    }
    case 'combate.ordenar': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      const atuais = new Set(combate.participantes.map((p) => p.id));
      if (cmd.ordem.length !== atuais.size || cmd.ordem.some((id) => !atuais.has(id)) || new Set(cmd.ordem).size !== atuais.size) {
        falhar('A ordem informada não corresponde aos participantes.');
      }
      const atual = combate.participantes[combate.turno]?.id;
      combate.participantes = cmd.ordem.map((id) => participante(combate, id)!);
      combate.turno = Math.max(0, combate.participantes.findIndex((p) => p.id === atual));
      // A decisão do mestre sobre a ordem resolve os empates pendentes.
      combate.empates = [];
      return;
    }
    case 'combate.avancar': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      const r = avancarTurno(combate);
      if (!r.ok) return falhar(r.erro);
      if (r.novaRodada) registrarEvento(c, ctx, `Rodada ${combate.rodada}.`);
      return;
    }
    case 'combate.voltar': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      voltarTurno(combate);
      return;
    }
    case 'combate.acao': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      const p = participante(combate, cmd.participanteId) ?? falhar('Participante não encontrado.');
      if (cmd.acao === 'principal') {
        if (cmd.usada) {
          if (p.acaoPrincipal) falhar(`${p.nome} já usou a ação principal nesta rodada.`);
          // Ação principal genérica: conta para guardas e satisfaz intervalos de reentrada.
          const marcadas = consumirAcaoPrincipal(combate, p.id, null);
          registrarEvento(c, ctx, `${p.nome} usa a ação principal${cmd.descricao.trim() ? `: ${cmd.descricao.trim()}` : ''}.`);
          for (const linha of concluirAcao(combate, marcadas)) registrarEvento(c, ctx, linha);
        } else p.acaoPrincipal = false;
      } else if (cmd.acao === 'movimento') p.movimento = cmd.usada;
      else p.reacao = cmd.usada;
      return;
    }
    case 'combate.postura': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      const p = participante(combate, cmd.participanteId) ?? falhar('Participante não encontrado.');
      p.postura = cmd.postura;
      return;
    }
    case 'combate.criarGuarda': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      if (cmd.inferiorId === cmd.superiorId) falhar('A guarda envolve dois combatentes diferentes.');
      if (!participante(combate, cmd.inferiorId) || !participante(combate, cmd.superiorId)) falhar('Participante não encontrado.');
      aplicarEfeitos(c, [{ tipo: 'criar-guarda', inferiorId: cmd.inferiorId, superiorId: cmd.superiorId, subcategoria: cmd.subcategoria }], ctx, autor);
      registrarEvento(c, ctx, 'Guarda registrada manualmente pelo mestre.', 'mestre');
      return;
    }
    case 'combate.editarGuarda': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      const g = combate.guardas.find((x) => x.id === cmd.guardaId) ?? falhar('Guarda não encontrada.');
      // Mudar a subcategoria preserva identidade e contador. [Aud. 49]
      if (cmd.subcategoria) g.subcategoria = cmd.subcategoria;
      if (cmd.contador !== undefined) {
        g.contador = cmd.contador;
        registrarEvento(c, ctx, 'Contador de guarda ajustado manualmente pelo mestre.', 'mestre');
      }
      return;
    }
    case 'combate.criarControle': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      if (cmd.controladorId === cmd.controladoId) falhar('O controle envolve dois combatentes diferentes.');
      if (!participante(combate, cmd.controladorId) || !participante(combate, cmd.controladoId)) falhar('Participante não encontrado.');
      aplicarEfeitos(c, [{ tipo: 'criar-controle', controladorId: cmd.controladorId, controladoId: cmd.controladoId, posicao: cmd.posicao }], ctx, autor);
      registrarEvento(c, ctx, 'Controle registrado manualmente pelo mestre.', 'mestre');
      return;
    }
    case 'combate.removerVinculo': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      if (cmd.vinculo === 'guarda') combate.guardas = combate.guardas.filter((g) => g.id !== cmd.id);
      else combate.controles = combate.controles.filter((k) => k.id !== cmd.id);
      registrarEvento(c, ctx, 'Vínculo removido manualmente pelo mestre.', 'mestre');
      return;
    }
    case 'combate.removerIntervalo': {
      const combate = c.combate ?? falhar('Não há combate em andamento.');
      combate.intervalos = combate.intervalos.filter((i) => !(i.combatenteId === cmd.combatenteId && i.oponenteId === cmd.oponenteId));
      registrarEvento(c, ctx, 'Intervalo de reentrada removido manualmente pelo mestre.', 'mestre');
      return;
    }
    case 'combate.resolverAtaque':
    case 'combate.resolverTransicao': {
      if (c.pendencias.length >= 40) falhar('Há resoluções demais aguardando confirmação.');
      const regras = {
        agora: ctx.agora,
        novoId: () => `pend_${ctx.novoId()}`,
        fonte: ctx.fonte,
        autor: { papel: ctx.ator.papel, jogadorId: ctx.ator.jogadorId, nome: ctx.ator.nome.slice(0, 60) },
      };
      const r = cmd.tipo === 'combate.resolverAtaque' ? resolverAtaque(c, cmd.pedido, regras) : resolverTransicao(c, cmd.pedido, regras);
      if (!r.ok) return falhar(r.erro);
      c.pendencias.push(r.pendencia);
      return;
    }
    case 'pendencia.confirmar': {
      const indice = c.pendencias.findIndex((p) => p.id === cmd.pendenciaId);
      if (indice < 0) falhar('Esta resolução não está mais pendente.');
      const pend = c.pendencias[indice];
      const opcao = pend.opcoes[cmd.opcao] ?? falhar('Opção inválida.');
      const substituicoes: Record<number, number> = {};
      for (const [k, v] of Object.entries(cmd.substituicoes)) substituicoes[Number(k)] = v;
      const efeitos = JSON.parse(JSON.stringify(opcao.efeitos)) as typeof opcao.efeitos;
      // Resultado reservado ao mestre: o registro da ficha afetada não cita quem agiu.
      if (cmd.visibilidade === 'mestre') {
        for (const e of efeitos) if (e.tipo === 'recurso') e.motivo = 'Resolução do mestre';
      }
      c.pendencias.splice(indice, 1);
      const linhas = aplicarEfeitos(c, efeitos, ctx, autor, substituicoes);
      registrarEvento(c, ctx, `${pend.titulo} — ${opcao.rotulo}${linhas.length ? ` (${linhas.join('; ')})` : ''}`, cmd.visibilidade);
      return;
    }
    case 'pendencia.cancelar':
      c.pendencias = c.pendencias.filter((p) => p.id !== cmd.pendenciaId);
      return;

    // ── Compêndio ──
    case 'compendio.liberar': {
      const conjunto = new Set(c.compendio.liberadas);
      for (const id of cmd.ids) {
        const propria = c.compendio.proprias.find((e) => e.id === id);
        if (propria) propria.visibilidade = cmd.liberar ? 'jogadores' : 'mestre';
        else if (cmd.liberar) conjunto.add(id);
        else conjunto.delete(id);
      }
      c.compendio.liberadas = [...conjunto];
      return;
    }
    case 'compendio.salvar': {
      const indice = c.compendio.proprias.findIndex((e) => e.id === cmd.entrada.id);
      if (indice >= 0) c.compendio.proprias[indice] = cmd.entrada;
      else {
        if (c.compendio.proprias.length >= 2000) falhar('Limite de entradas próprias atingido.');
        c.compendio.proprias.push(cmd.entrada);
      }
      return;
    }
    case 'compendio.excluir':
      c.compendio.proprias = c.compendio.proprias.filter((e) => e.id !== cmd.entradaId);
      return;
    case 'compendio.importar': {
      for (const entrada of cmd.entradas) {
        const indice = c.compendio.proprias.findIndex((e) => e.id === entrada.id);
        if (indice >= 0) c.compendio.proprias[indice] = entrada;
        else {
          if (c.compendio.proprias.length >= 2000) falhar('Limite de entradas próprias atingido.');
          c.compendio.proprias.push(entrada);
        }
      }
      return;
    }

    // ── Diário e decisões ──
    case 'diario.salvar': {
      const indice = c.diario.findIndex((e) => e.id === cmd.entrada.id);
      if (indice >= 0) c.diario[indice] = cmd.entrada;
      else {
        if (c.diario.length >= 500) falhar('Limite de entradas do diário atingido.');
        c.diario.push(cmd.entrada);
      }
      return;
    }
    case 'diario.excluir':
      c.diario = c.diario.filter((e) => e.id !== cmd.entradaId);
      return;
    case 'decisao.registrar':
      if (c.decisoes.length >= 500) falhar('Limite de decisões registradas atingido.');
      c.decisoes.push({ id: `dec_${ctx.novoId()}`, em: ctx.agora, texto: cmd.texto, referencia: cmd.referencia });
      return;
    case 'decisao.excluir':
      c.decisoes = c.decisoes.filter((d) => d.id !== cmd.decisaoId);
      return;

    // ── Arquivos ──
    case 'arquivo.registrar': {
      const indice = c.arquivos.findIndex((a) => a.id === cmd.meta.id);
      if (indice >= 0) c.arquivos[indice] = cmd.meta;
      else {
        if (c.arquivos.length >= 1000) falhar('Limite de arquivos atingido.');
        c.arquivos.push(cmd.meta);
      }
      return;
    }
    case 'arquivo.remover': {
      c.arquivos = c.arquivos.filter((a) => a.id !== cmd.arquivoId);
      for (const cena of c.cenas) {
        if (cena.mapa.tipo === 'arquivo' && cena.mapa.arquivoId === cmd.arquivoId) cena.mapa = { tipo: 'vazio' };
        if (cena.mapaJogadores?.arquivoId === cmd.arquivoId) cena.mapaJogadores = null;
        for (const t of cena.tokens) if (t.retratoArquivoId === cmd.arquivoId) t.retratoArquivoId = null;
      }
      for (const f of c.fichas) if (f.retratoArquivoId === cmd.arquivoId) f.retratoArquivoId = null;
      return;
    }
  }
}

/** Valida a forma de um comando recebido de fora (rede, importação). */
export function validarComando(bruto: unknown): { ok: true; comando: Comando } | { ok: false; erro: string } {
  const r = esquemaComando.safeParse(bruto);
  if (r.success) return { ok: true, comando: r.data };
  const primeiro = r.error.issues[0];
  return { ok: false, erro: `Comando inválido${primeiro ? `: ${primeiro.path.join('.')} — ${primeiro.message}` : '.'}` };
}

/**
 * Valida, autoriza e aplica um comando. A campanha de entrada nunca é alterada:
 * em caso de sucesso devolve uma nova versão, com a revisão incrementada.
 */
export function executarComando(campanha: Campanha, bruto: unknown, ctx: ContextoComando): ResultadoComando {
  const v = validarComando(bruto);
  if (!v.ok) return v;
  const recusa = autorizar(campanha, v.comando, ctx.ator);
  if (recusa) return { ok: false, erro: recusa };
  try {
    const nova = produce(campanha, (rascunho) => {
      aplicar(rascunho as Campanha, v.comando, ctx);
      rascunho.revisao += 1;
      rascunho.atualizadaEm = ctx.agora;
    });
    return { ok: true, campanha: nova };
  } catch (e) {
    if (e instanceof ErroComando) return { ok: false, erro: e.message };
    throw e;
  }
}

export { detectarEmpates };
