/**
 * Fábricas de objetos de campanha, com valores padrão explícitos.
 * Conteúdo de demonstração é sempre marcado como fictício (demo: true).
 */
import {
  VERSAO_ESQUEMA,
  type Atributos,
  type Campanha,
  type Cena,
  type Ficha,
  type Grade,
  type Id,
  type ItemEquipamento,
  type MapaDemoId,
  type Origem,
  type Token,
} from './esquema';
import { chaveCelula, centroCelula } from './mapa';
import { derivar } from './regras/ficha';

const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Identificador aleatório curto (Web Crypto). */
export function novoId(prefixo = ''): Id {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length];
  return prefixo ? `${prefixo}_${s}` : s;
}

export function agoraIso(): string {
  return new Date().toISOString();
}

/** Padrão do aplicativo (não é regra de Wendlands): células de 1,5 m. */
export const METROS_POR_CELULA_PADRAO = 1.5;

export function gradePadrao(tamanhoCelula = 64): Grade {
  return {
    visivel: true,
    tamanhoCelula,
    metrosPorCelula: METROS_POR_CELULA_PADRAO,
    origemX: 0,
    origemY: 0,
    medicao: 'euclidiana',
    encaixar: true,
  };
}

export function novaCena(parcial: Partial<Cena> & { nome: string }): Cena {
  return {
    id: novoId('cena'),
    demo: false,
    mapa: { tipo: 'vazio' },
    largura: 1920,
    altura: 1280,
    grade: gradePadrao(),
    tokens: [],
    desenhos: [],
    nevoa: [],
    mapaJogadores: null,
    notaMestre: '',
    ...parcial,
  };
}

export function novoToken(parcial: Partial<Token> & { nome: string; x: number; y: number }): Token {
  return {
    id: novoId('tok'),
    tamanho: 1,
    fichaId: null,
    retratoArquivoId: null,
    donoJogadorId: null,
    oculto: false,
    cor: 'neutro',
    ...parcial,
  };
}

export function novoItem(parcial: Partial<ItemEquipamento> & { nome: string }): ItemEquipamento {
  return {
    id: novoId('item'),
    tipo: 'item',
    categoria: null,
    espacos: 1,
    quantidade: 1,
    equipado: false,
    notas: '',
    ...parcial,
  };
}

/** [equipamento-inicial] 150 Cr, arma básica, armadura leve, rações, água, lanterna, primeiros socorros. */
export function equipamentoInicial(): ItemEquipamento[] {
  return [
    novoItem({ nome: 'Arma básica', tipo: 'arma', categoria: 'leve', equipado: true, notas: 'Defina o tipo com o mestre.' }),
    novoItem({ nome: 'Armadura leve', tipo: 'armadura', categoria: 'leve', equipado: true }),
    novoItem({ nome: 'Rações' }),
    novoItem({ nome: 'Água' }),
    novoItem({ nome: 'Lanterna' }),
    novoItem({ nome: 'Primeiros socorros' }),
  ];
}
export const CREDITOS_INICIAIS = 150;

export function novaFicha(
  parcial: Partial<Ficha> & { nome: string; origem: Origem; atributosBase: Atributos },
): Ficha {
  const ficha: Ficha = {
    id: novoId('ficha'),
    subtitulo: '',
    demo: false,
    tipo: 'pj',
    faccao: '',
    cla: '',
    estiloMarcial: '',
    nivel: 1,
    aumentos: [],
    ryBase: 0,
    ryDetalhe: '',
    pvAtual: 0,
    vigAtual: 0,
    ryAtual: 0,
    ajustes: [],
    equipamento: [],
    creditos: 0,
    tecnicas: [],
    notasPublicas: '',
    notasPrivadas: '',
    notasMestre: '',
    retratoArquivoId: null,
    donoJogadorId: null,
    compartilhamento: 'resumo',
    condicao: { estado: 'normal', sucessos: 0, falhas: 0 },
    registroOrigem: '',
    registro: [],
    ...parcial,
  };
  if (ficha.origem === 'esquecido') {
    ficha.ryBase = 0;
    ficha.atributosBase = { ...ficha.atributosBase, yan: 0 };
  }
  // Uma ficha nova começa com os recursos cheios, salvo valores informados.
  const d = derivar(ficha);
  if (parcial.pvAtual === undefined) ficha.pvAtual = d.pvMax.total;
  if (parcial.vigAtual === undefined) ficha.vigAtual = d.vigMax.total;
  if (parcial.ryAtual === undefined) ficha.ryAtual = d.ryMax.total;
  return ficha;
}

export const DIMENSOES_DEMO: Record<MapaDemoId, { largura: number; altura: number }> = {
  'wenor-baixa': { largura: 1792, altura: 1344 },
  farlands: { largura: 1920, altura: 1280 },
  fosso: { largura: 1536, altura: 1536 },
};

export const NOME_MAPA_DEMO: Record<MapaDemoId, string> = {
  'wenor-baixa': 'Wenor Baixa',
  farlands: 'Farlands',
  fosso: 'O Fosso',
};

export function cenaDemo(demoId: MapaDemoId): Cena {
  const { largura, altura } = DIMENSOES_DEMO[demoId];
  return novaCena({
    nome: NOME_MAPA_DEMO[demoId],
    demo: true,
    mapa: { tipo: 'demo', demoId },
    largura,
    altura,
    notaMestre:
      demoId === 'fosso'
        ? 'Mapa de demonstração. "O Fosso" vem do antigo prompt de sessão: é uma opção de cena inicial, não o início obrigatório de toda campanha. Geometria não canônica.'
        : 'Mapa de demonstração. A geometria é uma proposta visual e não define a localização oficial de nenhum lugar de Wendlands.',
  });
}

export function campanhaVazia(nome: string): Campanha {
  const agora = agoraIso();
  return {
    versaoEsquema: VERSAO_ESQUEMA,
    id: novoId('camp'),
    nome,
    criadaEm: agora,
    atualizadaEm: agora,
    revisao: 0,
    cenas: [],
    cenaAtivaId: null,
    fichas: [],
    jogadores: [],
    combate: null,
    pendencias: [],
    historico: [],
    diario: [],
    compendio: { proprias: [], liberadas: [] },
    decisoes: [],
    arquivos: [],
  };
}

/**
 * Campanha de demonstração: três cenas de exemplo e três personagens genéricos.
 * Nenhum protagonista da história recebe estatísticas; tudo aqui é fictício.
 */
export function campanhaDemo(nome = 'Mesa de Wendlands'): Campanha {
  const c = campanhaVazia(nome);
  const baixa = cenaDemo('wenor-baixa');
  const farlands = cenaDemo('farlands');
  const fosso = cenaDemo('fosso');

  const esquecido = novaFicha({
    nome: 'Esquecido',
    subtitulo: 'Personagem de exemplo',
    demo: true,
    origem: 'esquecido',
    atributosBase: { fis: 3, des: 3, men: 2, yan: 0 },
    estiloMarcial: 'letalitas',
    equipamento: equipamentoInicial(),
    creditos: CREDITOS_INICIAIS,
    notasPublicas: 'Ficha de demonstração com estatísticas fictícias.',
    tecnicas: [
      { id: novoId('tec'), nome: 'Recomposição de Guarda', tipo: 'fisica', grau: null, categoria: 'especial', refCatalogo: 'LET-ESP-001', notas: '' },
      { id: novoId('tec'), nome: 'Raspagem de Alavanca', tipo: 'fisica', grau: null, categoria: 'especial', refCatalogo: 'LET-ESP-002', notas: '' },
    ],
  });
  const normal = novaFicha({
    nome: 'Normal',
    subtitulo: 'Personagem de exemplo',
    demo: true,
    origem: 'normal',
    atributosBase: { fis: 1, des: 3, men: 2, yan: 2 },
    ryBase: 11,
    ryDetalhe: 'Valor de exemplo (8 + 3).',
    equipamento: equipamentoInicial(),
    creditos: CREDITOS_INICIAIS,
    notasPublicas: 'Ficha de demonstração com estatísticas fictícias.',
  });
  const luzionne = novaFicha({
    nome: 'Luzionne',
    subtitulo: 'Personagem de exemplo',
    demo: true,
    tipo: 'pnj',
    origem: 'luzionne',
    atributosBase: { fis: 1, des: 2, men: 2, yan: 3 },
    ryBase: 24,
    ryDetalhe: 'Valor de exemplo (dobro de 8 + 4).',
    equipamento: equipamentoInicial(),
    creditos: CREDITOS_INICIAIS,
    compartilhamento: 'oculta',
    notasPublicas: 'Ficha de demonstração com estatísticas fictícias.',
  });
  c.fichas.push(esquecido, normal, luzionne);

  const g = baixa.grade;
  const em = (cx: number, cy: number) => centroCelula(cx, cy, g);
  baixa.tokens.push(
    novoToken({ nome: 'Esquecido', ...em(9, 9), fichaId: esquecido.id, cor: 'verde' }),
    novoToken({ nome: 'Normal', ...em(11, 15), fichaId: normal.id, cor: 'latao' }),
    novoToken({ nome: 'Luzionne', ...em(15, 12), fichaId: luzionne.id, cor: 'vinho' }),
  );
  // Névoa de exemplo no canto nordeste, com borda em degraus.
  const colunas = Math.ceil(baixa.largura / g.tamanhoCelula);
  for (let cy = 0; cy < 7; cy++) {
    const inicio = colunas - 9 + cy;
    for (let cx = Math.max(inicio, colunas - 9); cx < colunas; cx++) {
      if (cx >= inicio) baixa.nevoa.push(chaveCelula(cx, cy));
    }
  }

  c.cenas.push(baixa, farlands, fosso);
  c.cenaAtivaId = baixa.id;
  c.diario.push({
    id: novoId('dia'),
    titulo: 'Sobre esta mesa de demonstração',
    texto:
      'Os mapas, os personagens e os números desta campanha são exemplos fictícios para conhecer a ferramenta. A geometria dos mapas é uma proposta visual, não cânone. Crie uma campanha nova ou edite esta à vontade.',
    criadaEm: c.criadaEm,
    atualizadaEm: c.criadaEm,
    visibilidade: 'jogadores',
  });
  return c;
}

/** Cópia profunda com ids novos para cena, tokens e desenhos. */
export function duplicarCena(cena: Cena, gerarId: () => Id = () => novoId()): Cena {
  const copia: Cena = structuredClone(cena);
  copia.id = `cena_${gerarId()}`;
  copia.nome = `${cena.nome} (cópia)`.slice(0, 80);
  copia.tokens = copia.tokens.map((t) => ({ ...t, id: `tok_${gerarId()}` }));
  copia.desenhos = copia.desenhos.map((d) => ({ ...d, id: `des_${gerarId()}` }));
  copia.mapaJogadores = null;
  return copia;
}
