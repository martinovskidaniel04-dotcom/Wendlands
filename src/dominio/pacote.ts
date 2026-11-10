/**
 * Portabilidade: validação, migração e empacotamento de campanhas.
 *
 * - Backup completo: um .zip com manifesto, dados e todas as imagens.
 * - Somente dados: um .json sem imagens — nunca chamado de backup completo.
 * Toda importação é validada pelo esquema antes de tocar o armazenamento.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';
import {
  VERSAO_ESQUEMA,
  esquemaCampanha,
  esquemaEntradaCompendio,
  esquemaFicha,
  esquemaId,
  esquemaMetaArquivo,
  type Campanha,
  type EntradaCompendio,
  type Ficha,
  type Id,
  type MetaArquivo,
} from './esquema';

export const VERSAO_PACOTE = 1;
export const VERSAO_APLICATIVO = '0.1.0';

/** Limites de importação (protegem contra arquivos corrompidos ou maliciosos). */
export const LIMITES_PACOTE = {
  dadosJson: 30 * 1024 * 1024,
  arquivo: 40 * 1024 * 1024,
  total: 400 * 1024 * 1024,
  arquivos: 1000,
} as const;

export const LIMITES_ARQUIVO = {
  mapa: 30 * 1024 * 1024,
  retrato: 6 * 1024 * 1024,
} as const;

export const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'] as const;

/**
 * Migrações explícitas entre versões do esquema: MIGRACOES[n] leva da versão n
 * para n + 1. A versão 1 é a primeira publicada, então a tabela começa vazia.
 */
const MIGRACOES: Record<number, (dados: Record<string, unknown>) => Record<string, unknown>> = {};

export type ResultadoValidacao =
  | { ok: true; campanha: Campanha; avisos: string[] }
  | { ok: false; erro: string };

function descreverErro(erro: z.ZodError): string {
  const itens = erro.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'raiz'}: ${i.message}`);
  const resto = erro.issues.length > 3 ? ` (e mais ${erro.issues.length - 3})` : '';
  return `${itens.join('; ')}${resto}`;
}

/** Migra (se preciso), valida pelo esquema e conserta referências soltas, avisando o que mudou. */
export function validarCampanha(bruto: unknown): ResultadoValidacao {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    return { ok: false, erro: 'O conteúdo não é uma campanha de Wendlands.' };
  }
  let dados = bruto as Record<string, unknown>;
  const versao = dados.versaoEsquema;
  if (typeof versao !== 'number' || !Number.isInteger(versao) || versao < 1) {
    return { ok: false, erro: 'A campanha não informa uma versão de esquema válida.' };
  }
  if (versao > VERSAO_ESQUEMA) {
    return {
      ok: false,
      erro: `Esta campanha foi criada por uma versão mais nova do aplicativo (esquema ${versao}; este aplicativo entende até ${VERSAO_ESQUEMA}). Atualize o aplicativo para importá-la.`,
    };
  }
  const avisos: string[] = [];
  for (let v = versao; v < VERSAO_ESQUEMA; v++) {
    const migrar = MIGRACOES[v];
    if (!migrar) return { ok: false, erro: `Não há migração disponível do esquema ${v} para o ${v + 1}.` };
    dados = migrar(dados);
    avisos.push(`Dados migrados do esquema ${v} para o ${v + 1}.`);
  }
  const r = esquemaCampanha.safeParse(dados);
  if (!r.success) return { ok: false, erro: `Campanha inválida — ${descreverErro(r.error)}` };
  const c = r.data;

  const duplicado = (ids: Id[]) => new Set(ids).size !== ids.length;
  if (duplicado(c.cenas.map((x) => x.id))) return { ok: false, erro: 'Campanha inválida — cenas com identificador repetido.' };
  if (duplicado(c.fichas.map((x) => x.id))) return { ok: false, erro: 'Campanha inválida — fichas com identificador repetido.' };
  if (duplicado(c.arquivos.map((x) => x.id))) return { ok: false, erro: 'Campanha inválida — arquivos com identificador repetido.' };

  const fichas = new Set(c.fichas.map((f) => f.id));
  const jogadores = new Set(c.jogadores.map((j) => j.id));
  const arquivos = new Set(c.arquivos.map((a) => a.id));
  let soltas = 0;
  if (c.cenaAtivaId && !c.cenas.some((x) => x.id === c.cenaAtivaId)) {
    c.cenaAtivaId = c.cenas[0]?.id ?? null;
    soltas++;
  }
  for (const cena of c.cenas) {
    if (duplicado(cena.tokens.map((t) => t.id))) return { ok: false, erro: `Campanha inválida — tokens repetidos na cena "${cena.nome}".` };
    if (cena.mapa.tipo === 'arquivo' && !arquivos.has(cena.mapa.arquivoId)) {
      cena.mapa = { tipo: 'vazio' };
      soltas++;
    }
    if (cena.mapaJogadores && !arquivos.has(cena.mapaJogadores.arquivoId)) cena.mapaJogadores = null;
    for (const t of cena.tokens) {
      if (t.fichaId && !fichas.has(t.fichaId)) (t.fichaId = null), soltas++;
      if (t.donoJogadorId && !jogadores.has(t.donoJogadorId)) (t.donoJogadorId = null), soltas++;
      if (t.retratoArquivoId && !arquivos.has(t.retratoArquivoId)) (t.retratoArquivoId = null), soltas++;
    }
  }
  for (const f of c.fichas) {
    delete f.visaoParcial;
    if (f.donoJogadorId && !jogadores.has(f.donoJogadorId)) (f.donoJogadorId = null), soltas++;
    if (f.retratoArquivoId && !arquivos.has(f.retratoArquivoId)) (f.retratoArquivoId = null), soltas++;
  }
  if (c.combate) {
    for (const p of c.combate.participantes) if (p.fichaId && !fichas.has(p.fichaId)) (p.fichaId = null), soltas++;
    if (c.combate.turno > c.combate.participantes.length) c.combate.turno = 0;
  }
  if (soltas > 0) avisos.push(`${soltas} referência(s) a itens inexistentes foram removidas.`);
  return { ok: true, campanha: c, avisos };
}

// ───────────────────────── Pacote completo (.zip) ─────────────────────────

const esquemaManifesto = z.object({
  formato: z.literal('wendlands-campanha'),
  versaoPacote: z.number().int().min(1),
  versaoEsquema: z.number().int().min(1),
  aplicativo: z.string().max(40),
  exportadoEm: z.string().max(40),
  campanha: z.object({ id: esquemaId, nome: z.string().max(80) }),
  /** true: contém todas as imagens registradas na campanha. */
  completo: z.boolean(),
  arquivos: z.array(esquemaMetaArquivo.extend({ caminho: z.string().max(120) })).max(LIMITES_PACOTE.arquivos),
});
export type ManifestoPacote = z.infer<typeof esquemaManifesto>;

export interface ArquivoPacote {
  meta: MetaArquivo;
  dados: Uint8Array;
}

export interface PacoteMontado {
  bytes: Uint8Array;
  manifesto: ManifestoPacote;
  /** Arquivos registrados na campanha que não estavam disponíveis para exportar. */
  ausentes: MetaArquivo[];
}

/** Monta o backup completo. `arquivos` traz os bytes de cada imagem da campanha. */
export function montarPacote(campanha: Campanha, arquivos: ReadonlyMap<Id, Uint8Array>, exportadoEm: string): PacoteMontado {
  const conteudo: Record<string, Uint8Array> = {};
  const listados: ManifestoPacote['arquivos'] = [];
  const ausentes: MetaArquivo[] = [];
  for (const meta of campanha.arquivos) {
    const dados = arquivos.get(meta.id);
    if (!dados) {
      ausentes.push(meta);
      continue;
    }
    const caminho = `arquivos/${meta.id}`;
    conteudo[caminho] = dados;
    listados.push({ ...meta, tamanho: dados.byteLength, caminho });
  }
  const manifesto: ManifestoPacote = {
    formato: 'wendlands-campanha',
    versaoPacote: VERSAO_PACOTE,
    versaoEsquema: VERSAO_ESQUEMA,
    aplicativo: VERSAO_APLICATIVO,
    exportadoEm,
    campanha: { id: campanha.id, nome: campanha.nome },
    completo: ausentes.length === 0,
    arquivos: listados,
  };
  conteudo['manifesto.json'] = strToU8(JSON.stringify(manifesto, null, 2));
  conteudo['campanha.json'] = strToU8(JSON.stringify(campanha));
  // Imagens já são comprimidas: nível 0 para elas, compressão só no JSON.
  const bytes = zipSync(
    Object.fromEntries(
      Object.entries(conteudo).map(([nome, dados]) => [nome, [dados, { level: nome.endsWith('.json') ? 6 : 0 }] as const]),
    ) as Parameters<typeof zipSync>[0],
  );
  return { bytes, manifesto, ausentes };
}

export type PacoteLido =
  | { ok: true; manifesto: ManifestoPacote; campanha: Campanha; arquivos: ArquivoPacote[]; avisos: string[] }
  | { ok: false; erro: string };

export function lerPacote(bytes: Uint8Array): PacoteLido {
  let entradas: Record<string, Uint8Array>;
  let total = 0;
  let excedeu = false;
  try {
    entradas = unzipSync(bytes, {
      filter(arquivo) {
        const limite = arquivo.name.endsWith('.json') ? LIMITES_PACOTE.dadosJson : LIMITES_PACOTE.arquivo;
        total += arquivo.originalSize;
        if (arquivo.originalSize > limite || total > LIMITES_PACOTE.total) {
          excedeu = true;
          return false;
        }
        return arquivo.name === 'manifesto.json' || arquivo.name === 'campanha.json' || /^arquivos\/[A-Za-z0-9_-]{1,64}$/.test(arquivo.name);
      },
    });
  } catch {
    return { ok: false, erro: 'Não foi possível abrir o arquivo: ele não é um pacote .zip válido de Wendlands.' };
  }
  if (excedeu) return { ok: false, erro: 'O pacote excede os limites de tamanho aceitos para importação.' };
  const lerJson = (nome: string): unknown => {
    const dados = entradas[nome];
    if (!dados) return undefined;
    try {
      return JSON.parse(strFromU8(dados));
    } catch {
      return undefined;
    }
  };
  const manifestoBruto = lerJson('manifesto.json');
  if (manifestoBruto === undefined) return { ok: false, erro: 'O pacote não contém um manifesto legível.' };
  const m = esquemaManifesto.safeParse(manifestoBruto);
  if (!m.success) return { ok: false, erro: `Manifesto inválido — ${descreverErro(m.error)}` };
  if (m.data.versaoPacote > VERSAO_PACOTE) {
    return { ok: false, erro: 'Este pacote foi criado por uma versão mais nova do aplicativo. Atualize para importá-lo.' };
  }
  const campanhaBruta = lerJson('campanha.json');
  if (campanhaBruta === undefined) return { ok: false, erro: 'O pacote não contém os dados da campanha.' };

  const arquivos: ArquivoPacote[] = [];
  const presentes = new Set<Id>();
  for (const item of m.data.arquivos) {
    const dados = entradas[item.caminho];
    if (!dados) continue;
    const { caminho: _caminho, ...meta } = item;
    arquivos.push({ meta: { ...meta, tamanho: dados.byteLength }, dados });
    presentes.add(meta.id);
  }
  const avisos: string[] = [];
  // Só mantém na campanha os arquivos que realmente vieram no pacote.
  if (typeof campanhaBruta === 'object' && campanhaBruta !== null && Array.isArray((campanhaBruta as { arquivos?: unknown }).arquivos)) {
    const lista = (campanhaBruta as { arquivos: Array<{ id?: unknown }> }).arquivos;
    const mantidos = lista.filter((a) => typeof a?.id === 'string' && presentes.has(a.id));
    if (mantidos.length !== lista.length) {
      avisos.push(`${lista.length - mantidos.length} imagem(ns) registrada(s) na campanha não estavam no pacote.`);
      (campanhaBruta as { arquivos: unknown[] }).arquivos = mantidos;
    }
  }
  const v = validarCampanha(campanhaBruta);
  if (!v.ok) return v;
  if (!m.data.completo) avisos.push('O pacote foi exportado sem todas as imagens (backup incompleto).');
  return { ok: true, manifesto: m.data, campanha: v.campanha, arquivos, avisos: [...avisos, ...v.avisos] };
}

// ───────────────────────── Somente dados (.json) ─────────────────────────

export interface ExportacaoDados {
  formato: 'wendlands-campanha-dados';
  versaoPacote: number;
  aviso: string;
  exportadoEm: string;
  campanha: Campanha;
}

/** Exportação sem imagens. Não é um backup completo e diz isso no próprio arquivo. */
export function exportarSomenteDados(campanha: Campanha, exportadoEm: string): ExportacaoDados {
  return {
    formato: 'wendlands-campanha-dados',
    versaoPacote: VERSAO_PACOTE,
    aviso: 'Somente dados: este arquivo NÃO contém mapas nem retratos e não é um backup completo.',
    exportadoEm,
    campanha,
  };
}

export function lerSomenteDados(bruto: unknown): ResultadoValidacao {
  if (typeof bruto !== 'object' || bruto === null || (bruto as { formato?: unknown }).formato !== 'wendlands-campanha-dados') {
    return { ok: false, erro: 'O arquivo não é uma exportação de dados de Wendlands.' };
  }
  const dados = (bruto as { campanha?: unknown }).campanha;
  // As imagens não acompanham este formato: as referências a elas são removidas na validação.
  if (typeof dados === 'object' && dados !== null) (dados as { arquivos?: unknown }).arquivos = [];
  const v = validarCampanha(dados);
  if (!v.ok) return v;
  return { ...v, avisos: ['Importação somente de dados: mapas importados e retratos não fazem parte deste arquivo.', ...v.avisos] };
}

/** Prepara a campanha importada para entrar como cópia, sem tocar em nenhuma existente. */
export function comoCopia(campanha: Campanha, novoId: Id, agora: string, existentes: readonly string[]): Campanha {
  let nome = campanha.nome;
  if (existentes.includes(nome)) {
    let n = 2;
    while (existentes.includes(`${campanha.nome} (${n})`.slice(0, 80))) n++;
    nome = `${campanha.nome} (${n})`.slice(0, 80);
  }
  return { ...campanha, id: novoId, nome, atualizadaEm: agora };
}

// ───────────────────────── Fichas e compêndio ─────────────────────────

const esquemaFichaExportada = z.object({
  formato: z.literal('wendlands-ficha'),
  versao: z.number().int().min(1).max(VERSAO_PACOTE),
  ficha: esquemaFicha,
});

export function exportarFicha(ficha: Ficha) {
  // Notas do mestre, dono e retrato não acompanham a ficha exportada.
  const limpa: Ficha = { ...ficha, notasMestre: '', donoJogadorId: null, retratoArquivoId: null };
  delete limpa.visaoParcial;
  return { formato: 'wendlands-ficha' as const, versao: VERSAO_PACOTE, ficha: limpa };
}

export function lerFicha(bruto: unknown, novoId: () => Id): { ok: true; ficha: Ficha } | { ok: false; erro: string } {
  const r = esquemaFichaExportada.safeParse(bruto);
  if (!r.success) return { ok: false, erro: `Ficha inválida — ${descreverErro(r.error)}` };
  const f = r.data.ficha;
  if (f.visaoParcial) return { ok: false, erro: 'Esta ficha é apenas um resumo público e não pode ser importada.' };
  delete f.visaoParcial;
  return {
    ok: true,
    ficha: {
      ...f,
      id: `ficha_${novoId()}`,
      donoJogadorId: null,
      retratoArquivoId: null,
      equipamento: f.equipamento.map((i) => ({ ...i, id: `item_${novoId()}` })),
      tecnicas: f.tecnicas.map((t) => ({ ...t, id: `tec_${novoId()}` })),
      ajustes: f.ajustes.map((a) => ({ ...a, id: `aj_${novoId()}` })),
    },
  };
}

const esquemaPacoteCompendio = z.object({
  formato: z.literal('wendlands-compendio'),
  versao: z.number().int().min(1).max(VERSAO_PACOTE),
  titulo: z.string().max(160).optional(),
  entradas: z.array(esquemaEntradaCompendio).min(1).max(500),
});

/** Pacote de entradas de compêndio (ex.: o pacote do mestre). Entram sempre como "somente mestre". */
export function lerPacoteCompendio(bruto: unknown): { ok: true; entradas: EntradaCompendio[]; titulo: string } | { ok: false; erro: string } {
  const r = esquemaPacoteCompendio.safeParse(bruto);
  if (!r.success) return { ok: false, erro: `Pacote de compêndio inválido — ${descreverErro(r.error)}` };
  return {
    ok: true,
    titulo: r.data.titulo ?? 'Pacote de compêndio',
    entradas: r.data.entradas.map((e) => ({ ...e, visibilidade: 'mestre' as const })),
  };
}
