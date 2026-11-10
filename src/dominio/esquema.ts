/**
 * Esquema dos dados de campanha (fonte única de tipos e de validação).
 *
 * Tudo o que é persistido, exportado, importado ou recebido pela rede passa por
 * estes esquemas. Os tipos TypeScript são derivados deles, para que validação e
 * tipagem nunca divirjam.
 */
import { z } from 'zod';

export const VERSAO_ESQUEMA = 1;

export const esquemaId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'identificador inválido');
const texto = (max: number) => z.string().max(max);
const inteiro = (min: number, max: number) => z.number().int().min(min).max(max);
const numero = (min: number, max: number) => z.number().min(min).max(max);
const dataIso = z.string().max(40);

export const ORIGENS = ['normal', 'luzionne', 'esquecido'] as const;
export const ATRIBUTOS = ['fis', 'des', 'men', 'yan'] as const;
export const CLAS = ['', 'gionatte', 'matior', 'opartyn'] as const;
export const ESTILOS = ['', 'gartio', 'corpo-armado', 'letalitas'] as const;
export const RECURSOS = ['pv', 'vig', 'ry'] as const;
export const NIVEIS_AUMENTO = [5, 10, 15, 20] as const;

export type Origem = (typeof ORIGENS)[number];
export type ChaveAtributo = (typeof ATRIBUTOS)[number];
export type ChaveRecurso = (typeof RECURSOS)[number];
export type Id = string;

// ───────────────────────── Fichas ─────────────────────────

export const esquemaAtributos = z.object({
  fis: inteiro(-5, 10),
  des: inteiro(-5, 10),
  men: inteiro(-5, 10),
  yan: inteiro(-5, 10),
});
export type Atributos = z.infer<typeof esquemaAtributos>;

export const esquemaAumento = z.object({
  nivel: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
  atributo: z.enum(ATRIBUTOS),
});
export type AumentoAtributo = z.infer<typeof esquemaAumento>;

export const ALVOS_AJUSTE = ['pvMax', 'vigMax', 'ryMax', 'defesa', 'reducao', 'carga'] as const;
export const esquemaAjuste = z.object({
  id: esquemaId,
  alvo: z.enum(ALVOS_AJUSTE),
  valor: inteiro(-999, 999),
  motivo: texto(300),
  em: dataIso,
  autor: texto(80),
});
export type AjusteManual = z.infer<typeof esquemaAjuste>;

export const esquemaItem = z.object({
  id: esquemaId,
  nome: texto(80),
  tipo: z.enum(['arma', 'armadura', 'escudo', 'item']),
  categoria: z.enum(['leve', 'media', 'pesada']).nullable(),
  espacos: numero(0, 99),
  quantidade: inteiro(0, 9999),
  equipado: z.boolean(),
  notas: texto(500),
});
export type ItemEquipamento = z.infer<typeof esquemaItem>;

export const esquemaTecnicaFicha = z.object({
  id: esquemaId,
  nome: texto(120),
  tipo: z.enum(['yant', 'fisica']),
  grau: inteiro(1, 4).nullable(),
  categoria: z.enum(['especial', 'avancada', 'suprema']).nullable(),
  refCatalogo: texto(40).nullable(),
  notas: texto(1000),
});
export type TecnicaFicha = z.infer<typeof esquemaTecnicaFicha>;

export const esquemaRegistro = z.object({
  id: esquemaId,
  em: dataIso,
  autor: texto(80),
  campo: texto(60),
  de: texto(200),
  para: texto(200),
  motivo: texto(300),
});
export type RegistroAlteracao = z.infer<typeof esquemaRegistro>;

export const esquemaCondicao = z.object({
  estado: z.enum(['normal', 'incapacitado', 'estabilizado', 'critico']),
  sucessos: inteiro(0, 3),
  falhas: inteiro(0, 3),
});

export const esquemaFicha = z.object({
  id: esquemaId,
  nome: texto(80),
  subtitulo: texto(120),
  /** Ficha de exemplo: estatísticas explicitamente fictícias. */
  demo: z.boolean(),
  tipo: z.enum(['pj', 'pnj']),
  origem: z.enum(ORIGENS),
  faccao: texto(60),
  cla: z.enum(CLAS),
  estiloMarcial: z.enum(ESTILOS),
  nivel: inteiro(1, 20),
  atributosBase: esquemaAtributos,
  aumentos: z.array(esquemaAumento).max(4),
  /** Reserva de Yant inata (fixa). 0 para Esquecidos. */
  ryBase: inteiro(0, 999),
  ryDetalhe: texto(200),
  pvAtual: inteiro(0, 9999),
  vigAtual: inteiro(0, 9999),
  ryAtual: inteiro(0, 9999),
  ajustes: z.array(esquemaAjuste).max(50),
  equipamento: z.array(esquemaItem).max(200),
  creditos: inteiro(0, 99_999_999),
  tecnicas: z.array(esquemaTecnicaFicha).max(100),
  notasPublicas: texto(5000),
  /** Visíveis ao dono da ficha e ao mestre. */
  notasPrivadas: texto(5000),
  /** Visíveis apenas ao mestre. */
  notasMestre: texto(5000),
  retratoArquivoId: esquemaId.nullable(),
  donoJogadorId: esquemaId.nullable(),
  /** O que os demais jogadores recebem desta ficha. */
  compartilhamento: z.enum(['oculta', 'resumo', 'completa']),
  condicao: esquemaCondicao,
  registroOrigem: texto(600),
  registro: z.array(esquemaRegistro).max(400),
  /** Marcado apenas em visões filtradas: a ficha chegou reduzida ao resumo público. */
  visaoParcial: z.boolean().optional(),
});
export type Ficha = z.infer<typeof esquemaFicha>;

// ───────────────────────── Cenas ─────────────────────────

export const MODOS_MEDICAO = ['euclidiana', 'diagonal-1', 'sem-diagonal'] as const;
export const esquemaGrade = z.object({
  visivel: z.boolean(),
  /** Lado da célula em unidades de mundo (pixels do mapa em resolução nativa). */
  tamanhoCelula: numero(8, 1000),
  /** Calibração explícita: quantos metros representa o lado de uma célula. */
  metrosPorCelula: numero(0.1, 1000),
  origemX: numero(-20000, 20000),
  origemY: numero(-20000, 20000),
  /** Convenção de medição da mesa; não é regra de Wendlands. */
  medicao: z.enum(MODOS_MEDICAO),
  encaixar: z.boolean(),
});
export type Grade = z.infer<typeof esquemaGrade>;

export const CORES_TOKEN = ['neutro', 'latao', 'vinho', 'azul', 'verde'] as const;
export const esquemaToken = z.object({
  id: esquemaId,
  nome: texto(60),
  /** Centro do token em coordenadas de mundo. */
  x: numero(-50000, 50000),
  y: numero(-50000, 50000),
  /** Diâmetro em células. */
  tamanho: numero(0.25, 10),
  fichaId: esquemaId.nullable(),
  retratoArquivoId: esquemaId.nullable(),
  donoJogadorId: esquemaId.nullable(),
  /** Oculto para jogadores independentemente da névoa. */
  oculto: z.boolean(),
  cor: z.enum(CORES_TOKEN),
});
export type Token = z.infer<typeof esquemaToken>;

export const CORES_DESENHO = ['marfim', 'latao', 'verde', 'vinho', 'azul'] as const;
export const esquemaDesenho = z.object({
  id: esquemaId,
  tipo: z.enum(['linha', 'retangulo', 'elipse', 'livre']),
  pontos: z.array(z.tuple([numero(-50000, 50000), numero(-50000, 50000)])).min(2).max(1500),
  cor: z.enum(CORES_DESENHO),
  espessura: numero(1, 40),
  visivelJogadores: z.boolean(),
});
export type Desenho = z.infer<typeof esquemaDesenho>;

export const MAPAS_DEMO = ['wenor-baixa', 'farlands', 'fosso'] as const;
export type MapaDemoId = (typeof MAPAS_DEMO)[number];
export const esquemaMapa = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('vazio') }),
  z.object({ tipo: z.literal('demo'), demoId: z.enum(MAPAS_DEMO) }),
  z.object({ tipo: z.literal('arquivo'), arquivoId: esquemaId }),
]);
export type MapaCena = z.infer<typeof esquemaMapa>;

export const esquemaChaveCelula = z.string().regex(/^-?\d{1,5},-?\d{1,5}$/);

export const esquemaCena = z.object({
  id: esquemaId,
  nome: texto(80),
  demo: z.boolean(),
  mapa: esquemaMapa,
  largura: numero(64, 20000),
  altura: numero(64, 20000),
  grade: esquemaGrade,
  tokens: z.array(esquemaToken).max(500),
  desenhos: z.array(esquemaDesenho).max(500),
  /** Células ocultas pela névoa manual, como "coluna,linha". */
  nevoa: z.array(esquemaChaveCelula).max(250_000),
  /**
   * Versão do mapa preparada para jogadores (mesa online): imagem com as células
   * listadas já apagadas. O original nunca é enviado a jogadores.
   */
  mapaJogadores: z
    .object({ arquivoId: esquemaId, celulas: z.array(esquemaChaveCelula).max(250_000) })
    .nullable(),
  notaMestre: texto(5000),
});
export type Cena = z.infer<typeof esquemaCena>;

// ───────────────────────── Dados e histórico ─────────────────────────

export const esquemaResultadoTermo = z.object({
  texto: texto(24),
  sinal: z.union([z.literal(1), z.literal(-1)]),
  /** Faces obtidas (vazio para constantes). */
  dados: z.array(inteiro(1, 100)).max(200),
  /** Dados descartados (ex.: o menor de 2d20). */
  descartados: z.array(inteiro(1, 100)).max(200),
  subtotal: inteiro(-1_000_000, 1_000_000),
});
export const esquemaResultadoRolagem = z.object({
  expressao: texto(80),
  termos: z.array(esquemaResultadoTermo).max(16),
  modificador: inteiro(-1_000_000, 1_000_000),
  total: inteiro(-1_000_000, 1_000_000),
});
export type ResultadoRolagem = z.infer<typeof esquemaResultadoRolagem>;

export const esquemaAutor = z.object({
  papel: z.enum(['mestre', 'jogador']),
  jogadorId: esquemaId.nullable(),
  nome: texto(60),
});
export type Autor = z.infer<typeof esquemaAutor>;

export const esquemaEntradaHistorico = z.object({
  id: esquemaId,
  em: dataIso,
  autor: esquemaAutor,
  tipo: z.enum(['rolagem', 'evento']),
  rotulo: texto(160),
  resultado: esquemaResultadoRolagem.nullable(),
  /** "mestre": visível apenas ao mestre e a quem rolou. */
  visibilidade: z.enum(['publica', 'mestre']),
});
export type EntradaHistorico = z.infer<typeof esquemaEntradaHistorico>;

// ───────────────────────── Combate ─────────────────────────

export const POSTURAS = ['em-pe', 'solo-neutro', 'tartaruga'] as const;
export type Postura = (typeof POSTURAS)[number];
export const SUBCATEGORIAS_GUARDA = ['fechada', 'aberta', 'meia', 'borboleta'] as const;
export type SubcategoriaGuarda = (typeof SUBCATEGORIAS_GUARDA)[number];
export const POSICOES_CONTROLE = ['lateral', 'montada', 'costas', 'norte-sul'] as const;
export type PosicaoControle = (typeof POSICOES_CONTROLE)[number];

export const esquemaParticipante = z.object({
  id: esquemaId,
  nome: texto(60),
  tokenId: esquemaId.nullable(),
  fichaId: esquemaId.nullable(),
  iniciativa: inteiro(-99, 999).nullable(),
  detalheIniciativa: texto(120),
  acaoPrincipal: z.boolean(),
  movimento: z.boolean(),
  reacao: z.boolean(),
  postura: z.enum(POSTURAS),
});
export type Participante = z.infer<typeof esquemaParticipante>;

export const esquemaGuarda = z.object({
  /** Identidade da guarda: preservada em mudanças de subcategoria (Aud. 49). */
  id: esquemaId,
  inferiorId: esquemaId,
  superiorId: esquemaId,
  subcategoria: z.enum(SUBCATEGORIAS_GUARDA),
  /** Ações principais compartilhadas já consumidas (máximo 2 — Aud. 46). */
  contador: inteiro(0, 2),
});
export type Guarda = z.infer<typeof esquemaGuarda>;

export const esquemaControle = z.object({
  id: esquemaId,
  controladorId: esquemaId,
  controladoId: esquemaId,
  posicao: z.enum(POSICOES_CONTROLE),
});
export type Controle = z.infer<typeof esquemaControle>;

export const esquemaIntervalo = z.object({
  combatenteId: esquemaId,
  oponenteId: esquemaId,
  motivo: z.enum(['expiracao', 'interferencia']),
});
export type IntervaloReentrada = z.infer<typeof esquemaIntervalo>;

export const esquemaCombate = z.object({
  rodada: inteiro(1, 9999),
  turno: inteiro(0, 999),
  participantes: z.array(esquemaParticipante).max(200),
  /** Grupos empatados na iniciativa aguardando decisão do mestre. */
  empates: z.array(z.array(esquemaId).min(2).max(200)).max(100),
  guardas: z.array(esquemaGuarda).max(100),
  controles: z.array(esquemaControle).max(100),
  intervalos: z.array(esquemaIntervalo).max(400),
});
export type Combate = z.infer<typeof esquemaCombate>;

// Efeitos: mutações propostas por uma resolução, aplicadas só após confirmação do mestre.
export const esquemaEfeito = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('recurso'),
    fichaId: esquemaId,
    recurso: z.enum(RECURSOS),
    delta: inteiro(-9999, 9999),
    motivo: texto(200),
    /** O mestre pode substituir o valor na confirmação (ex.: dano final). */
    ajustavel: z.boolean(),
  }),
  z.object({
    tipo: z.literal('acao-principal'),
    participanteId: esquemaId,
    /** Preenchido quando a ação é uma tentativa de iniciar guarda contra este oponente. */
    iniciaGuardaContra: esquemaId.nullable(),
  }),
  z.object({ tipo: z.literal('postura'), participanteId: esquemaId, postura: z.enum(POSTURAS) }),
  z.object({
    tipo: z.literal('criar-guarda'),
    inferiorId: esquemaId,
    superiorId: esquemaId,
    subcategoria: z.enum(SUBCATEGORIAS_GUARDA),
  }),
  z.object({
    tipo: z.literal('encerrar-guarda'),
    guardaId: esquemaId,
    /** "interferencia" cria intervalos de reentrada para ambos (Aud. 60). */
    motivo: z.enum(['transicao', 'interferencia']),
  }),
  z.object({ tipo: z.literal('inverter-guarda'), guardaId: esquemaId }),
  z.object({
    tipo: z.literal('subcategoria-guarda'),
    guardaId: esquemaId,
    subcategoria: z.enum(SUBCATEGORIAS_GUARDA),
  }),
  z.object({
    tipo: z.literal('criar-controle'),
    controladorId: esquemaId,
    controladoId: esquemaId,
    posicao: z.enum(POSICOES_CONTROLE),
  }),
  z.object({ tipo: z.literal('encerrar-controle'), controleId: esquemaId }),
]);
export type Efeito = z.infer<typeof esquemaEfeito>;

export const esquemaOpcaoPendencia = z.object({
  rotulo: texto(160),
  descricao: texto(600),
  efeitos: z.array(esquemaEfeito).max(24),
});
export type OpcaoPendencia = z.infer<typeof esquemaOpcaoPendencia>;

export const esquemaPendencia = z.object({
  id: esquemaId,
  em: dataIso,
  tipo: z.enum(['ataque', 'transicao', 'tecnica', 'recuperacao']),
  autor: esquemaAutor,
  titulo: texto(160),
  executorFichaId: esquemaId.nullable(),
  alvoFichaId: esquemaId.nullable(),
  /** Linhas legíveis: dados individuais, modificadores, totais e margem. */
  linhas: z.array(texto(300)).max(24),
  /** Regras que sustentam a resolução (ids de referencias.ts). */
  regras: z.array(texto(40)).max(12),
  /** Desfechos possíveis; mais de um quando a regra pede validação do mestre. */
  opcoes: z.array(esquemaOpcaoPendencia).min(1).max(6),
});
export type Pendencia = z.infer<typeof esquemaPendencia>;

// ───────────────────────── Compêndio, diário e decisões ─────────────────────────

export const CATEGORIAS_COMPENDIO = [
  'historia',
  'local',
  'faccao',
  'personagem',
  'yant',
  'material',
  'bestiario',
  'tecnica',
  'regra',
] as const;
export type CategoriaCompendio = (typeof CATEGORIAS_COMPENDIO)[number];

export const STATUS_COMPENDIO = [
  'canone',
  'crenca',
  'lenda',
  'lacuna',
  'proposta',
  'aprovado',
  'nao-aprovado',
  'rejeitado',
  'pendente',
  'contexto',
] as const;
export type StatusCompendio = (typeof STATUS_COMPENDIO)[number];

export const VISIBILIDADES = ['mestre', 'jogadores'] as const;
export type Visibilidade = (typeof VISIBILIDADES)[number];

export const esquemaEntradaCompendio = z.object({
  id: esquemaId,
  titulo: texto(160),
  categoria: z.enum(CATEGORIAS_COMPENDIO),
  resumo: texto(400),
  corpo: z.array(texto(4000)).max(40),
  /** Documento de origem e seção ou auditoria. */
  fonte: texto(200),
  secao: texto(200),
  versao: texto(60),
  status: z.enum(STATUS_COMPENDIO),
  visibilidade: z.enum(VISIBILIDADES),
  aliases: z.array(texto(80)).max(20),
  /** Aparência: vazio quando não documentada. */
  aparencia: texto(1000),
  conflitos: z.array(texto(600)).max(12),
});
export type EntradaCompendio = z.infer<typeof esquemaEntradaCompendio>;

export const esquemaEntradaDiario = z.object({
  id: esquemaId,
  titulo: texto(160),
  texto: texto(20000),
  criadaEm: dataIso,
  atualizadaEm: dataIso,
  visibilidade: z.enum(VISIBILIDADES),
});
export type EntradaDiario = z.infer<typeof esquemaEntradaDiario>;

export const esquemaDecisao = z.object({
  id: esquemaId,
  em: dataIso,
  texto: texto(2000),
  /** Regra ou técnica a que a decisão de sessão se refere (não altera o cânone). */
  referencia: texto(60),
});
export type DecisaoMestre = z.infer<typeof esquemaDecisao>;

export const esquemaJogador = z.object({ id: esquemaId, nome: texto(60) });
export type Jogador = z.infer<typeof esquemaJogador>;

export const esquemaMetaArquivo = z.object({
  id: esquemaId,
  nome: texto(200),
  tipo: texto(80),
  tamanho: inteiro(0, 200_000_000),
  uso: z.enum(['mapa', 'retrato', 'mapa-jogadores']),
});
export type MetaArquivo = z.infer<typeof esquemaMetaArquivo>;

// ───────────────────────── Campanha ─────────────────────────

export const esquemaCampanha = z.object({
  versaoEsquema: z.literal(VERSAO_ESQUEMA),
  id: esquemaId,
  nome: texto(80),
  criadaEm: dataIso,
  atualizadaEm: dataIso,
  revisao: inteiro(0, Number.MAX_SAFE_INTEGER),
  cenas: z.array(esquemaCena).max(200),
  cenaAtivaId: esquemaId.nullable(),
  fichas: z.array(esquemaFicha).max(500),
  jogadores: z.array(esquemaJogador).max(40),
  combate: esquemaCombate.nullable(),
  pendencias: z.array(esquemaPendencia).max(40),
  historico: z.array(esquemaEntradaHistorico).max(600),
  diario: z.array(esquemaEntradaDiario).max(500),
  compendio: z.object({
    /** Entradas criadas ou importadas pelo mestre (inclui o pacote do mestre). */
    proprias: z.array(esquemaEntradaCompendio).max(2000),
    /** Ids de entradas embutidas liberadas aos jogadores. */
    liberadas: z.array(esquemaId).max(2000),
  }),
  decisoes: z.array(esquemaDecisao).max(500),
  arquivos: z.array(esquemaMetaArquivo).max(1000),
});
export type Campanha = z.infer<typeof esquemaCampanha>;

export type Papel = 'mestre' | 'jogador';
/** Quem executa um comando. O papel é sempre decidido pelo lado autoritativo. */
export interface Ator {
  papel: Papel;
  jogadorId: Id | null;
  nome: string;
}
