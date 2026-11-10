/**
 * Catálogo de técnicas especializadas e seus estados de aprovação.
 *
 * Importante: o registro de aprovação não reproduz as fichas completas da maioria
 * das técnicas. Somente LET-ESP-001 v1.0 e LET-ESP-002 v1.0 têm resolução descrita
 * nas fontes e, por isso, são as únicas automatizadas. As demais aprovadas ficam
 * como "Aprovada — resolução manual"; candidatas e rejeitadas não executam.
 */

export type StatusTecnica = 'aprovada' | 'nao-aprovada' | 'rejeitada' | 'pendente';
export type Automacao = 'automatica' | 'manual' | 'bloqueada';

export interface TecnicaCatalogo {
  codigo: string;
  nome: string;
  estilo: 'letalitas';
  categoria: 'especial';
  versao: string;
  status: StatusTecnica;
  auditoria: string;
  automacao: Automacao;
  /** Texto exibido ao usuário sobre o estado da técnica. */
  nota: string;
  /** Resumo da resolução, apenas quando a fonte a descreve. */
  resolucao?: string[];
}

const MANUAL =
  'Aprovada individualmente, mas a ficha completa não está reproduzida nas fontes. O aplicativo registra a ação principal e a VIG da categoria; requisitos, teste e resultado são resolvidos pelo mestre.';

function aprovadaManual(codigo: string, nome: string, auditoria: string, base?: string): TecnicaCatalogo {
  return {
    codigo,
    nome,
    estilo: 'letalitas',
    categoria: 'especial',
    versao: 'v1.0',
    status: 'aprovada',
    auditoria: base ? `Auditoria ${auditoria} (baseada em ${base})` : `Auditoria ${auditoria}`,
    automacao: 'manual',
    nota: MANUAL,
  };
}

export const CATALOGO_TECNICAS: TecnicaCatalogo[] = [
  {
    codigo: 'LET-ESP-001',
    nome: 'Recomposição de Guarda',
    estilo: 'letalitas',
    categoria: 'especial',
    versao: 'v1.0',
    status: 'aprovada',
    auditoria: 'Auditoria 103',
    automacao: 'automatica',
    nota: 'Aprovada individualmente. Versões v0.1 e v0.2 não aprovadas.',
    resolucao: [
      'Especial, 2 VIG, uma ação principal.',
      'Requisito: executor sob controle lateral adversário; alvo é o controlador.',
      'Teste resistido 1d20 + FIS/DES de cada parte, conforme abordagem validada antes; o defensor não gasta reação.',
      'Margem ≥ +1: termina o controle lateral e estabelece guarda aberta defensiva.',
      'Margem −1 ou −2: termina o controle lateral e estabelece meia-guarda defensiva (exceção individual de derrota estreita).',
      'Margem 0 ou ≤ −3: mantém posição e controle.',
      'Sem dano, bônus, penalidade, finalização, controle superior, persistência especializada, segunda transição ou reembolso.',
    ],
  },
  {
    codigo: 'LET-ESP-002',
    nome: 'Raspagem de Alavanca',
    estilo: 'letalitas',
    categoria: 'especial',
    versao: 'v1.0',
    status: 'aprovada',
    auditoria: 'Auditoria 104',
    automacao: 'automatica',
    nota: 'Aprovada individualmente. A candidata v0.1 foi substituída pela v1.0.',
    resolucao: [
      'Especial, 2 VIG, uma ação principal.',
      'Requisito: exclusivamente a partir de guarda borboleta defensiva; alvo é o adversário da guarda.',
      'Teste resistido independente FIS/DES validado antes; o defensor não gasta reação.',
      'Margem ≥ +1: inversão e controle lateral contra o mesmo oponente (exceção individual à raspagem fundamental para margens +1 a +3).',
      'Margem ≤ 0: mantém posição.',
      'Sem dano, bônus, penalidade, ataque, finalização, montada, costas, persistência especializada, reembolso ou segunda transição.',
    ],
  },
  aprovadaManual('LET-ESP-003', 'Escape de Quadril', '107', 'v0.3'),
  aprovadaManual('LET-ESP-004', 'Passagem de Guarda por Pressão', '108'),
  aprovadaManual('LET-ESP-005', 'Reversão de Quadril', '110', 'v0.2'),
  aprovadaManual('LET-ESP-006', 'Queda de Quadril', '112', 'v0.2'),
  aprovadaManual('LET-ESP-007', 'Passagem de Meia-Guarda', '115', 'v0.3'),
  aprovadaManual('LET-ESP-008', 'Saída de Tartaruga', '118', 'v0.3'),
  aprovadaManual('LET-ESP-009', 'Transição Norte-Sul', '120', 'v0.2'),
  {
    codigo: 'LET-ESP-010',
    nome: 'Retenção de Controle Lateral',
    estilo: 'letalitas',
    categoria: 'especial',
    versao: 'v0.1',
    status: 'rejeitada',
    auditoria: 'Auditoria 121',
    automacao: 'bloqueada',
    nota: 'Rejeitada na Auditoria 121. O código permanece reservado; não pode ser executada.',
  },
  aprovadaManual('LET-ESP-011', 'Desencaixe Norte-Sul', '122'),
  aprovadaManual('LET-ESP-012', 'Raspagem de Meia-Guarda', '124', 'v0.2'),
  aprovadaManual('LET-ESP-013', 'Desencaixe de Costas', '126', 'v0.2'),
  aprovadaManual('LET-ESP-014', 'Desengajamento de Guarda Aberta', '128', 'v0.2; nome anterior: Reposição de Guarda Aberta'),
  aprovadaManual('LET-ESP-015', 'Quebra de Montada', '130', 'v0.2'),
  {
    codigo: 'LET-ESP-016',
    nome: 'Desengajamento de Meia-Guarda',
    estilo: 'letalitas',
    categoria: 'especial',
    versao: 'v0.2',
    status: 'pendente',
    auditoria: 'Auditoria 132',
    automacao: 'bloqueada',
    nota:
      'Candidata não aprovada: decisão pendente na Auditoria 132 (a v0.1, "Reversão de Meia-Guarda", não foi aprovada na Auditoria 131). Não consome recurso nem aplica efeito como regra vigente. O mestre pode registrar uma decisão de sessão, que não altera o cânone.',
  },
];

export function tecnicaDoCatalogo(codigo: string | null | undefined): TecnicaCatalogo | null {
  if (!codigo) return null;
  const alvo = codigo.trim().toUpperCase();
  return CATALOGO_TECNICAS.find((t) => t.codigo === alvo) ?? null;
}

export const ROTULO_STATUS_TECNICA: Record<StatusTecnica, string> = {
  aprovada: 'Aprovada',
  'nao-aprovada': 'Não aprovada',
  rejeitada: 'Rejeitada',
  pendente: 'Pendente',
};

export function rotuloAutomacao(t: TecnicaCatalogo): string {
  if (t.status !== 'aprovada') return `${ROTULO_STATUS_TECNICA[t.status]} — sem execução`;
  return t.automacao === 'automatica' ? 'Aprovada — resolução automática' : 'Aprovada — resolução manual';
}

/**
 * Poderes hereditários lendários. Editar o clã de uma ficha nunca os concede.
 * [Bíblia §5; limites para jogadores registrados no prompt antigo de mestre]
 */
export const PODERES_DE_CLA = {
  gionatte: {
    nome: 'Horologium temporis',
    jogavel: false,
    nota: 'Poder lendário reservado a personagens não jogadores. Definir o clã como Gionatte não o concede.',
  },
  matior: {
    nome: 'Tancto',
    jogavel: true,
    nota:
      'Manifestação hereditária rara. Versão jogável limitada a um uso por combate e causa exaustão. Não é concedida automaticamente pelo clã: depende de decisão do mestre.',
  },
  opartyn: {
    nome: 'Herodes',
    jogavel: true,
    nota:
      'Versão jogável admite um uso por combate, sem exaustão. Não é concedida automaticamente pelo clã: depende de decisão do mestre.',
  },
} as const;
