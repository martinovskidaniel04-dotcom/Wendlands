/**
 * Regras puras de combate: iniciativa, economia de ações, ataques, transições de
 * agarramento, guardas (identidade + contador compartilhado), intervalos de
 * reentrada e interferência externa.
 *
 * As resoluções nunca alteram o estado diretamente: produzem uma Pendência com
 * os dados rolados, a margem e os efeitos propostos. O mestre confirma (ou
 * cancela) e só então `aplicarEfeitos` muda a campanha.
 */
import { rolar, rolarD20, analisarExpressao, type FonteAleatoria } from '../dados';
import type {
  Autor,
  Campanha,
  ChaveAtributo,
  Combate,
  Efeito,
  Ficha,
  Guarda,
  Id,
  OpcaoPendencia,
  Participante,
  Pendencia,
  Postura,
  SubcategoriaGuarda,
} from '../esquema';
import { CUSTO_CATEGORIA_FISICA, SIGLA_ATRIBUTO, derivar, formatarModificador, limitarRecursos } from './ficha';
import { tecnicaDoCatalogo } from './tecnicas';

export const NOME_POSTURA: Record<Postura, string> = {
  'em-pe': 'Em pé',
  'solo-neutro': 'Solo neutro',
  tartaruga: 'Tartaruga',
};
export const NOME_SUBCATEGORIA: Record<SubcategoriaGuarda, string> = {
  fechada: 'Guarda fechada',
  aberta: 'Guarda aberta',
  meia: 'Meia-guarda',
  borboleta: 'Guarda borboleta',
};
export const NOME_CONTROLE = {
  lateral: 'Controle lateral',
  montada: 'Montada',
  costas: 'Controle de costas',
  'norte-sul': 'Norte-sul',
} as const;

export interface ContextoRegras {
  agora: string;
  novoId(): Id;
  fonte: FonteAleatoria;
  autor: Autor;
}

export type Resolucao = { ok: true; pendencia: Pendencia } | { ok: false; erro: string };

// ───────────────────────── Consultas ─────────────────────────

export function participante(c: Combate, id: Id): Participante | undefined {
  return c.participantes.find((p) => p.id === id);
}

export function guardaEntre(c: Combate, a: Id, b: Id): Guarda | undefined {
  return c.guardas.find(
    (g) => (g.inferiorId === a && g.superiorId === b) || (g.inferiorId === b && g.superiorId === a),
  );
}

export function vinculosDe(c: Combate, id: Id) {
  return {
    guardas: c.guardas.filter((g) => g.inferiorId === id || g.superiorId === id),
    controlado: c.controles.filter((k) => k.controladoId === id),
    controlador: c.controles.filter((k) => k.controladorId === id),
  };
}

export function temVinculo(c: Combate, id: Id): boolean {
  const v = vinculosDe(c, id);
  return v.guardas.length + v.controlado.length + v.controlador.length > 0;
}

export function intervaloPendente(c: Combate, combatenteId: Id, oponenteId: Id): boolean {
  return c.intervalos.some((i) => i.combatenteId === combatenteId && i.oponenteId === oponenteId);
}

/** Descrição da situação posicional de um participante, para a interface. */
export function descreverSituacao(c: Combate, id: Id): string {
  const p = participante(c, id);
  if (!p) return '';
  const nome = (pid: Id) => participante(c, pid)?.nome ?? '—';
  const partes: string[] = [];
  const v = vinculosDe(c, id);
  for (const g of v.guardas) {
    const sub = NOME_SUBCATEGORIA[g.subcategoria].toLowerCase();
    if (g.inferiorId === id) partes.push(`Guarda inferior (${sub}) com ${nome(g.superiorId)} · ${g.contador}/2`);
    else partes.push(`Na guarda de ${nome(g.inferiorId)} (${sub}) · ${g.contador}/2`);
  }
  for (const k of v.controlado) partes.push(`Sob ${NOME_CONTROLE[k.posicao].toLowerCase()} de ${nome(k.controladorId)}`);
  for (const k of v.controlador) partes.push(`${NOME_CONTROLE[k.posicao]} sobre ${nome(k.controladoId)}`);
  if (partes.length === 0 || p.postura === 'tartaruga') partes.unshift(NOME_POSTURA[p.postura]);
  return partes.join(' · ');
}

// ───────────────────────── Iniciativa e turnos ─────────────────────────

export function novoCombate(): Combate {
  return { rodada: 1, turno: 0, participantes: [], empates: [], guardas: [], controles: [], intervalos: [] };
}

/** Ordena por iniciativa (maior primeiro; sem valor por último) preservando a ordem relativa. */
export function ordenarPorIniciativa(c: Combate): void {
  const atual = c.participantes[c.turno]?.id ?? null;
  const indexado = c.participantes.map((p, i) => ({ p, i }));
  indexado.sort((a, b) => {
    const ia = a.p.iniciativa;
    const ib = b.p.iniciativa;
    if (ia === ib) return a.i - b.i;
    if (ia === null) return 1;
    if (ib === null) return -1;
    return ib - ia;
  });
  c.participantes = indexado.map((x) => x.p);
  if (atual) c.turno = Math.max(0, c.participantes.findIndex((p) => p.id === atual));
  c.empates = detectarEmpates(c);
}

/** Não há regra aprovada de desempate: os grupos empatados aguardam decisão do mestre. */
export function detectarEmpates(c: Combate): Id[][] {
  const grupos = new Map<number, Id[]>();
  for (const p of c.participantes) {
    if (p.iniciativa === null) continue;
    const g = grupos.get(p.iniciativa);
    if (g) g.push(p.id);
    else grupos.set(p.iniciativa, [p.id]);
  }
  return [...grupos.values()].filter((g) => g.length > 1);
}

export function rolarIniciativa(c: Combate, fichas: Ficha[], ids: Id[], fonte: FonteAleatoria): string[] {
  const linhas: string[] = [];
  for (const id of ids) {
    const p = participante(c, id);
    if (!p) continue;
    const ficha = p.fichaId ? fichas.find((f) => f.id === p.fichaId) : undefined;
    const des = ficha ? derivar(ficha).atributos.des : 0;
    const r = rolarD20(des, fonte);
    p.iniciativa = r.total;
    p.detalheIniciativa = `d20 (${r.natural}) ${des < 0 ? '−' : '+'} DES ${Math.abs(des)}${ficha ? '' : ' (sem ficha)'}`;
    linhas.push(`${p.nome}: ${r.natural} ${des < 0 ? '−' : '+'} ${Math.abs(des)} = ${r.total}`);
  }
  ordenarPorIniciativa(c);
  return linhas;
}

export function avancarTurno(c: Combate): { ok: true; novaRodada: boolean } | { ok: false; erro: string } {
  if (c.participantes.length === 0) return { ok: false, erro: 'Não há participantes na iniciativa.' };
  if (c.empates.length > 0) {
    return { ok: false, erro: 'Há empate de iniciativa aguardando a decisão do mestre sobre a ordem.' };
  }
  let novaRodada = false;
  c.turno += 1;
  if (c.turno >= c.participantes.length) {
    c.turno = 0;
    c.rodada += 1;
    novaRodada = true;
    for (const p of c.participantes) {
      p.acaoPrincipal = false;
      p.movimento = false;
      p.reacao = false;
    }
  }
  return { ok: true, novaRodada };
}

export function voltarTurno(c: Combate): void {
  if (c.participantes.length === 0) return;
  if (c.turno > 0) c.turno -= 1;
  else if (c.rodada > 1) {
    c.rodada -= 1;
    c.turno = c.participantes.length - 1;
  }
}

export function removerParticipante(c: Combate, id: Id): void {
  const indice = c.participantes.findIndex((p) => p.id === id);
  if (indice < 0) return;
  c.participantes.splice(indice, 1);
  c.guardas = c.guardas.filter((g) => g.inferiorId !== id && g.superiorId !== id);
  c.controles = c.controles.filter((k) => k.controladorId !== id && k.controladoId !== id);
  c.intervalos = c.intervalos.filter((i) => i.combatenteId !== id && i.oponenteId !== id);
  if (indice < c.turno) c.turno -= 1;
  if (c.turno >= c.participantes.length) c.turno = 0;
  c.empates = detectarEmpates(c);
}

// ───────────────────────── Aplicação de efeitos ─────────────────────────

function definirPostura(c: Combate, id: Id, postura: Postura): void {
  const p = participante(c, id);
  if (p) p.postura = postura;
}

function criarIntervalos(c: Combate, a: Id, b: Id, motivo: 'expiracao' | 'interferencia'): void {
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    if (!intervaloPendente(c, x, y)) c.intervalos.push({ combatenteId: x, oponenteId: y, motivo });
  }
}

/** Encerra a guarda pondo ambos em solo neutro e criando os intervalos de reentrada. [Aud. 46, 50, 59, 60] */
function encerrarGuardaComIntervalo(c: Combate, g: Guarda, motivo: 'expiracao' | 'interferencia'): void {
  c.guardas = c.guardas.filter((x) => x.id !== g.id);
  definirPostura(c, g.inferiorId, 'solo-neutro');
  definirPostura(c, g.superiorId, 'solo-neutro');
  criarIntervalos(c, g.inferiorId, g.superiorId, motivo);
}

/**
 * Registra uma ação principal legitimamente consumida.
 * - Satisfaz os intervalos de reentrada do executor, exceto contra o oponente
 *   contra quem a própria ação tenta iniciar guarda. [Aud. 50, 52, 68, 75]
 * - Devolve as guardas em que o executor está agora: elas contam esta ação no
 *   contador compartilhado quando a ação terminar de resolver. [Aud. 46–48]
 */
export function consumirAcaoPrincipal(c: Combate, participanteId: Id, iniciaGuardaContra: Id | null): Id[] {
  const p = participante(c, participanteId);
  if (!p) return [];
  p.acaoPrincipal = true;
  c.intervalos = c.intervalos.filter(
    (i) => !(i.combatenteId === participanteId && i.oponenteId !== iniciaGuardaContra),
  );
  return c.guardas.filter((g) => g.inferiorId === participanteId || g.superiorId === participanteId).map((g) => g.id);
}

/** Conclui a ação: avança o contador das guardas marcadas e expira as que chegaram a 2. */
export function concluirAcao(c: Combate, guardasMarcadas: Id[]): string[] {
  const linhas: string[] = [];
  for (const id of guardasMarcadas) {
    const g = c.guardas.find((x) => x.id === id);
    if (!g) continue; // a guarda terminou durante a própria ação
    g.contador = Math.min(2, g.contador + 1);
    if (g.contador >= 2) {
      const a = participante(c, g.inferiorId)?.nome ?? '—';
      const b = participante(c, g.superiorId)?.nome ?? '—';
      encerrarGuardaComIntervalo(c, g, 'expiracao');
      linhas.push(`Guarda entre ${a} e ${b} expirou após a segunda ação compartilhada: ambos em solo neutro.`);
    }
  }
  return linhas;
}

export function alterarRecursoFicha(f: Ficha, recurso: 'pv' | 'vig' | 'ry', novoValor: number): void {
  const d = derivar(f);
  const max = recurso === 'pv' ? d.pvMax.total : recurso === 'vig' ? d.vigMax.total : d.ryMax.total;
  const valor = Math.min(max, Math.max(0, Math.round(novoValor)));
  if (recurso === 'pv') {
    const antes = f.pvAtual;
    f.pvAtual = valor;
    // [zero-pv] a 0 PV fica incapacitado; ao recuperar PV, volta ao normal.
    if (valor === 0 && antes > 0) f.condicao = { estado: 'incapacitado', sucessos: 0, falhas: 0 };
    else if (valor > 0 && f.condicao.estado !== 'normal') f.condicao = { estado: 'normal', sucessos: 0, falhas: 0 };
  } else if (recurso === 'vig') f.vigAtual = valor;
  else f.ryAtual = valor;
}

export function registrarAlteracao(
  f: Ficha,
  ctx: { agora: string; novoId(): Id },
  autor: string,
  campo: string,
  de: string | number,
  para: string | number,
  motivo = '',
): void {
  f.registro.push({
    id: ctx.novoId(),
    em: ctx.agora,
    autor: autor.slice(0, 80),
    campo: campo.slice(0, 60),
    de: String(de).slice(0, 200),
    para: String(para).slice(0, 200),
    motivo: motivo.slice(0, 300),
  });
  if (f.registro.length > 400) f.registro.splice(0, f.registro.length - 400);
}

/**
 * Aplica, em ordem, os efeitos confirmados pelo mestre. `substituicoes` permite
 * trocar o valor de efeitos de recurso ajustáveis (ex.: dano final decidido).
 */
export function aplicarEfeitos(
  campanha: Campanha,
  efeitos: Efeito[],
  ctx: { agora: string; novoId(): Id },
  autor: string,
  substituicoes: Record<number, number> = {},
): string[] {
  const linhas: string[] = [];
  const c = campanha.combate;
  let marcadas: Id[] = [];
  efeitos.forEach((e, indice) => {
    switch (e.tipo) {
      case 'recurso': {
        const f = campanha.fichas.find((x) => x.id === e.fichaId);
        if (!f) return;
        const delta = e.ajustavel && indice in substituicoes ? substituicoes[indice] : e.delta;
        const antes = e.recurso === 'pv' ? f.pvAtual : e.recurso === 'vig' ? f.vigAtual : f.ryAtual;
        alterarRecursoFicha(f, e.recurso, antes + delta);
        const depois = e.recurso === 'pv' ? f.pvAtual : e.recurso === 'vig' ? f.vigAtual : f.ryAtual;
        if (antes !== depois) {
          registrarAlteracao(f, ctx, autor, e.recurso.toUpperCase(), antes, depois, e.motivo);
          linhas.push(`${f.nome}: ${e.recurso.toUpperCase()} ${antes} → ${depois}`);
        }
        return;
      }
      case 'acao-principal':
        if (c) marcadas = marcadas.concat(consumirAcaoPrincipal(c, e.participanteId, e.iniciaGuardaContra));
        return;
      case 'postura':
        if (c) definirPostura(c, e.participanteId, e.postura);
        return;
      case 'criar-guarda':
        if (!c) return;
        c.guardas = c.guardas.filter((g) => !guardaEntre({ ...c, guardas: [g] }, e.inferiorId, e.superiorId));
        c.guardas.push({
          id: ctx.novoId(),
          inferiorId: e.inferiorId,
          superiorId: e.superiorId,
          subcategoria: e.subcategoria,
          contador: 0,
        });
        definirPostura(c, e.inferiorId, 'solo-neutro');
        definirPostura(c, e.superiorId, 'solo-neutro');
        return;
      case 'encerrar-guarda': {
        if (!c) return;
        const g = c.guardas.find((x) => x.id === e.guardaId);
        if (!g) return;
        if (e.motivo === 'interferencia') encerrarGuardaComIntervalo(c, g, 'interferencia');
        else c.guardas = c.guardas.filter((x) => x.id !== g.id);
        return;
      }
      case 'inverter-guarda': {
        const g = c?.guardas.find((x) => x.id === e.guardaId);
        if (g) [g.inferiorId, g.superiorId] = [g.superiorId, g.inferiorId];
        return;
      }
      case 'subcategoria-guarda': {
        // [Aud. 49] muda a subcategoria preservando identidade e contador.
        const g = c?.guardas.find((x) => x.id === e.guardaId);
        if (g) g.subcategoria = e.subcategoria;
        return;
      }
      case 'criar-controle':
        if (!c) return;
        c.controles = c.controles.filter(
          (k) =>
            !(
              (k.controladorId === e.controladorId && k.controladoId === e.controladoId) ||
              (k.controladorId === e.controladoId && k.controladoId === e.controladorId)
            ),
        );
        c.controles.push({
          id: ctx.novoId(),
          controladorId: e.controladorId,
          controladoId: e.controladoId,
          posicao: e.posicao,
        });
        definirPostura(c, e.controladorId, 'solo-neutro');
        definirPostura(c, e.controladoId, 'solo-neutro');
        return;
      case 'encerrar-controle':
        if (c) c.controles = c.controles.filter((k) => k.id !== e.controleId);
        return;
    }
  });
  if (c) linhas.push(...concluirAcao(c, [...new Set(marcadas)]));
  return linhas;
}

// ───────────────────────── Ataque ─────────────────────────

export const CATEGORIAS_ARMA = ['leve', 'media', 'pesada', 'sem-dado'] as const;
export type CategoriaArma = (typeof CATEGORIAS_ARMA)[number];
export const DADO_ARMA: Record<Exclude<CategoriaArma, 'sem-dado'>, number> = { leve: 4, media: 6, pesada: 8 };
export const NOME_ARMA: Record<CategoriaArma, string> = {
  leve: 'Arma leve (d4)',
  media: 'Arma média (d6)',
  pesada: 'Arma pesada (d8)',
  'sem-dado': 'Sem dado aprovado (dano pelo mestre)',
};

export interface PedidoAtaque {
  atacanteFichaId: Id;
  alvoFichaId: Id;
  atributo: ChaveAtributo;
  arma: CategoriaArma;
}

function participanteDaFicha(c: Combate | null, fichaId: Id): Participante | undefined {
  return c?.participantes.find((p) => p.fichaId === fichaId);
}

/** Ataque comum: d20 + atributo contra Defesa; dano com redução. [ataque] [armaduras] */
export function resolverAtaque(campanha: Campanha, pedido: PedidoAtaque, ctx: ContextoRegras): Resolucao {
  const atacante = campanha.fichas.find((f) => f.id === pedido.atacanteFichaId);
  const alvo = campanha.fichas.find((f) => f.id === pedido.alvoFichaId);
  if (!atacante || !alvo) return { ok: false, erro: 'Atacante e alvo precisam ter ficha.' };
  if (atacante.id === alvo.id) return { ok: false, erro: 'Escolha um alvo diferente do atacante.' };
  const p = participanteDaFicha(campanha.combate, atacante.id);
  if (p?.acaoPrincipal) return { ok: false, erro: `${atacante.nome} já usou a ação principal nesta rodada.` };

  const dA = derivar(atacante);
  const dB = derivar(alvo);
  const mod = dA.atributosTeste[pedido.atributo];
  const sigla = SIGLA_ATRIBUTO[pedido.atributo];
  const teste = rolarD20(mod, ctx.fonte);
  const defesa = dB.defesa.total;
  const linhas = [
    `Ataque: d20 (${teste.natural}) ${mod < 0 ? '−' : '+'} ${sigla} ${Math.abs(mod)} = ${teste.total} contra Defesa ${defesa} de ${alvo.nome}.`,
  ];
  const acao: Efeito[] = p ? [{ tipo: 'acao-principal', participanteId: p.id, iniciaGuardaContra: null }] : [];

  const erro: OpcaoPendencia = {
    rotulo: 'Registrar erro',
    descricao: 'O ataque não acerta. Nenhum dano é aplicado.',
    efeitos: acao,
  };
  if (teste.total < defesa) {
    linhas.push('Resultado: erro (total abaixo da Defesa).');
    return pendencia(ctx, 'ataque', `Ataque de ${atacante.nome} em ${alvo.nome}`, atacante.id, alvo.id, linhas, ['ataque'], [erro]);
  }

  let efeitoDano: Efeito;
  if (pedido.arma === 'sem-dado') {
    linhas.push('Dano: não há dado de dano aprovado para este ataque; o mestre define o valor na confirmação.');
    efeitoDano = { tipo: 'recurso', fichaId: alvo.id, recurso: 'pv', delta: 0, motivo: `Ataque de ${atacante.nome}`, ajustavel: true };
  } else {
    const lados = DADO_ARMA[pedido.arma];
    const quantidade = teste.natural === 20 ? 2 : 1;
    const analise = analisarExpressao(`${quantidade}d${lados}`);
    if (!analise.ok) return { ok: false, erro: analise.erro };
    const dados = rolar(analise.expressao, ctx.fonte);
    const bruto = Math.max(0, dados.total + mod);
    const reducao = dB.reducao.total;
    const final = Math.max(0, bruto - reducao);
    linhas.push(
      `Dano: ${quantidade}d${lados} (${dados.termos[0].dados.join(' + ')})${teste.natural === 20 ? ' — 20 natural dobra apenas os dados' : ''} ${mod < 0 ? '−' : '+'} ${sigla} ${Math.abs(mod)} = ${bruto}; redução ${reducao} → ${final} PV.`,
    );
    efeitoDano = { tipo: 'recurso', fichaId: alvo.id, recurso: 'pv', delta: -final, motivo: `Ataque de ${atacante.nome}`, ajustavel: true };
  }
  const acerto: OpcaoPendencia = {
    rotulo: 'Aplicar acerto',
    descricao: 'Aplica o dano calculado aos PV do alvo. O valor final pode ser ajustado pelo mestre antes de confirmar.',
    efeitos: [...acao, efeitoDano],
  };
  if (teste.total === defesa) {
    linhas.push('Resultado: total igual à Defesa. A fonte não define este caso — decisão do mestre.');
    return pendencia(ctx, 'ataque', `Ataque de ${atacante.nome} em ${alvo.nome}`, atacante.id, alvo.id, linhas, ['ataque', 'armaduras'], [
      { ...acerto, rotulo: 'Considerar acerto' },
      { ...erro, rotulo: 'Considerar erro' },
    ]);
  }
  linhas.push('Resultado: acerto.');
  return pendencia(ctx, 'ataque', `Ataque de ${atacante.nome} em ${alvo.nome}`, atacante.id, alvo.id, linhas, ['ataque', 'armaduras'], [acerto]);
}

function pendencia(
  ctx: ContextoRegras,
  tipo: Pendencia['tipo'],
  titulo: string,
  executorFichaId: Id | null,
  alvoFichaId: Id | null,
  linhas: string[],
  regras: string[],
  opcoes: OpcaoPendencia[],
): Resolucao {
  return {
    ok: true,
    pendencia: {
      id: ctx.novoId(),
      em: ctx.agora,
      tipo,
      autor: ctx.autor,
      titulo: titulo.slice(0, 160),
      executorFichaId,
      alvoFichaId,
      linhas: linhas.map((l) => l.slice(0, 300)),
      regras,
      opcoes,
    },
  };
}

// ───────────────────────── Transições de agarramento ─────────────────────────

export const TRANSICOES = [
  'queda',
  'entrar-guarda',
  'recuperar-guarda',
  'passar-guarda',
  'raspagem',
  'escape-lateral',
  'reversao-lateral',
  'escape-dominante',
  'sair-tartaruga',
  'levantar',
  'deslocamento-guarda',
  'interferencia',
  'tecnica',
] as const;
export type Transicao = (typeof TRANSICOES)[number];

export const NOME_TRANSICAO: Record<Transicao, string> = {
  queda: 'Queda',
  'entrar-guarda': 'Entrar em guarda (desde solo neutro)',
  'recuperar-guarda': 'Recuperar guarda (sob controle)',
  'passar-guarda': 'Passagem de guarda',
  raspagem: 'Raspagem',
  'escape-lateral': 'Escape do controle lateral',
  'reversao-lateral': 'Reversão do controle lateral',
  'escape-dominante': 'Escape de montada, costas ou norte-sul',
  'sair-tartaruga': 'Sair da tartaruga',
  levantar: 'Levantar-se',
  'deslocamento-guarda': 'Deslocamento conjunto em guarda (até 2 m)',
  interferencia: 'Interferir em guarda alheia',
  tecnica: 'Técnica especializada',
};

export const DESTINOS = ['fechada', 'aberta', 'meia', 'borboleta', 'tartaruga', 'lateral', 'manual'] as const;
export type DestinoIntermediario = (typeof DESTINOS)[number];
export const NOME_DESTINO: Record<DestinoIntermediario, string> = {
  fechada: 'Guarda fechada',
  aberta: 'Guarda aberta',
  meia: 'Meia-guarda',
  borboleta: 'Guarda borboleta',
  tartaruga: 'Tartaruga',
  lateral: 'Controle lateral do mesmo oponente',
  manual: 'Outro (aplicar manualmente)',
};

export interface PedidoTransicao {
  transicao: Transicao;
  executorId: Id;
  alvoId: Id | null;
  abordagemExecutor: 'fis' | 'des';
  abordagemAlvo: 'fis' | 'des';
  /** Força bruta pura validada pelo mestre: Esquecidos rolam 2d20 e ficam com o maior. */
  forcaBrutaExecutor: boolean;
  forcaBrutaAlvo: boolean;
  acompanharQueda: boolean;
  subcategoria: SubcategoriaGuarda;
  destino: DestinoIntermediario;
  comOposicao: boolean;
  guardaId: Id | null;
  tecnica: string;
}

interface Disputa {
  margem: number;
  linhas: string[];
}

function disputar(
  campanha: Campanha,
  executor: Participante,
  alvo: Participante,
  pedido: PedidoTransicao,
  ctx: ContextoRegras,
): Disputa {
  const lado = (p: Participante, abordagem: 'fis' | 'des', forcaBruta: boolean) => {
    const ficha = p.fichaId ? campanha.fichas.find((f) => f.id === p.fichaId) : undefined;
    const mod = ficha ? derivar(ficha).atributosTeste[abordagem] : 0;
    // [forca-bruta] 2d20 apenas para Esquecidos, com abordagem de FIS, em força bruta pura.
    const dois = forcaBruta && abordagem === 'fis' && ficha?.origem === 'esquecido';
    const r = rolarD20(mod, ctx.fonte, dois);
    const dado = dois ? `2d20 (${r.natural}, descartado ${r.termos[0].descartados[0]})` : `d20 (${r.natural})`;
    return {
      total: r.total,
      linha: `${p.nome}: ${dado} ${mod < 0 ? '−' : '+'} ${SIGLA_ATRIBUTO[abordagem]} ${Math.abs(mod)}${ficha ? '' : ' (sem ficha)'} = ${r.total}`,
    };
  };
  const a = lado(executor, pedido.abordagemExecutor, pedido.forcaBrutaExecutor);
  const b = lado(alvo, pedido.abordagemAlvo, pedido.forcaBrutaAlvo);
  const margem = a.total - b.total;
  return { margem, linhas: [a.linha, b.linha, `Margem: ${formatarModificador(margem)}`] };
}

const MANTEM = (acao: Efeito[], texto = 'A posição é mantida. Empate preserva a posição.'): OpcaoPendencia => ({
  rotulo: 'Registrar: posição mantida',
  descricao: texto,
  efeitos: acao,
});

/**
 * Valida e resolve uma transição de agarramento. Uma tentativa inválida devolve
 * erro e não consome ação nem VIG. [transicoes] [tecnica-execucao]
 */
export function resolverTransicao(campanha: Campanha, pedido: PedidoTransicao, ctx: ContextoRegras): Resolucao {
  const c = campanha.combate;
  if (!c) return { ok: false, erro: 'Inicie um combate para resolver transições.' };
  const executor = participante(c, pedido.executorId);
  if (!executor) return { ok: false, erro: 'Executor não encontrado na iniciativa.' };
  if (executor.acaoPrincipal) return { ok: false, erro: `${executor.nome} já usou a ação principal nesta rodada.` };
  const alvo = pedido.alvoId ? participante(c, pedido.alvoId) : undefined;
  if (pedido.alvoId && !alvo) return { ok: false, erro: 'Alvo não encontrado na iniciativa.' };
  if (alvo && alvo.id === executor.id) return { ok: false, erro: 'Executor e alvo precisam ser diferentes.' };

  const fichaExecutor = executor.fichaId ? campanha.fichas.find((f) => f.id === executor.fichaId) ?? null : null;
  const titulo = (nome: string) => `${nome}: ${executor.nome}${alvo ? ` × ${alvo.nome}` : ''}`;
  const acao = (iniciaGuardaContra: Id | null = null): Efeito => ({
    tipo: 'acao-principal',
    participanteId: executor.id,
    iniciaGuardaContra,
  });
  const exigirAlvo = (): string | null => (alvo ? null : 'Escolha o oponente desta transição.');
  const semReentrada = (): string | null =>
    alvo && intervaloPendente(c, executor.id, alvo.id)
      ? `Reentrada bloqueada: ${executor.nome} precisa antes consumir uma ação principal que não seja tentar iniciar guarda contra ${alvo.nome}.`
      : null;
  const monta = (regras: string[], linhas: string[], opcoes: OpcaoPendencia[], tipo: Pendencia['tipo'] = 'transicao') =>
    pendencia(ctx, tipo, titulo(NOME_TRANSICAO[pedido.transicao]), fichaExecutor?.id ?? null, alvo?.fichaId ?? null, linhas, regras, opcoes);

  const v = vinculosDe(c, executor.id);

  switch (pedido.transicao) {
    case 'queda': {
      const falta = exigirAlvo();
      if (falta) return { ok: false, erro: falta };
      if (executor.postura !== 'em-pe' || temVinculo(c, executor.id)) {
        return { ok: false, erro: 'A queda parte de um executor em pé e sem guarda ou controle ativos.' };
      }
      if (alvo!.postura !== 'em-pe' || temVinculo(c, alvo!.id)) {
        return { ok: false, erro: 'O alvo da queda precisa estar em pé e sem guarda ou controle ativos.' };
      }
      const d = disputar(campanha, executor, alvo!, pedido, ctx);
      const linhas = [`Declarado: ${pedido.acompanharQueda ? 'acompanha a queda' : 'não acompanha a queda'}.`, ...d.linhas];
      if (d.margem <= 0) return monta(['quedas', 'transicoes'], linhas, [MANTEM([acao()], 'Sem queda.')]);
      const derruba: Efeito = { tipo: 'postura', participanteId: alvo!.id, postura: 'solo-neutro' };
      const acompanha: Efeito = { tipo: 'postura', participanteId: executor.id, postura: 'solo-neutro' };
      if (!pedido.acompanharQueda) {
        return monta(['quedas', 'transicoes'], linhas, [
          { rotulo: 'Aplicar queda sem acompanhamento', descricao: `${alvo!.nome} vai a solo neutro; ${executor.nome} permanece em pé.`, efeitos: [acao(), derruba] },
        ]);
      }
      const semControle: OpcaoPendencia = {
        rotulo: 'Aplicar queda sem controle',
        descricao: 'Queda acompanhada: ambos em solo neutro, sem controle.',
        efeitos: [acao(), derruba, acompanha],
      };
      if (d.margem <= 3) return monta(['quedas', 'transicoes'], linhas, [semControle]);
      return monta(['quedas', 'transicoes'], linhas, [
        {
          rotulo: 'Aplicar queda com controle lateral',
          descricao: 'Margem alta com acompanhamento: controle lateral, se compatível com a abordagem declarada. Montada e costas não são obtidas automaticamente.',
          efeitos: [acao(), { tipo: 'criar-controle', controladorId: executor.id, controladoId: alvo!.id, posicao: 'lateral' }],
        },
        { ...semControle, descricao: 'Use se o controle lateral não for compatível com a abordagem declarada: ambos em solo neutro.' },
      ]);
    }

    case 'entrar-guarda': {
      const falta = exigirAlvo() ?? semReentrada();
      if (falta) return { ok: false, erro: falta };
      if (executor.postura !== 'solo-neutro' || temVinculo(c, executor.id)) {
        return { ok: false, erro: 'A entrada em guarda parte de solo neutro, sem guarda ou controle ativos.' };
      }
      const d = disputar(campanha, executor, alvo!, pedido, ctx);
      const tentativa = acao(alvo!.id);
      if (d.margem <= 0) return monta(['guardas-raspagens', 'reentrada'], d.linhas, [MANTEM([tentativa])]);
      return monta(['guardas-raspagens', 'guarda-contador'], d.linhas, [
        {
          rotulo: `Estabelecer ${NOME_SUBCATEGORIA[pedido.subcategoria].toLowerCase()}`,
          descricao: `${executor.nome} fica na guarda inferior; contador compartilhado começa em 0/2.`,
          efeitos: [tentativa, { tipo: 'criar-guarda', inferiorId: executor.id, superiorId: alvo!.id, subcategoria: pedido.subcategoria }],
        },
      ]);
    }

    case 'recuperar-guarda': {
      const falta = exigirAlvo() ?? semReentrada();
      if (falta) return { ok: false, erro: falta };
      const controle = v.controlado.find((k) => k.controladorId === alvo!.id);
      const tartarugaComOposicao = executor.postura === 'tartaruga' && v.controlado.length === 0 && v.guardas.length === 0;
      if (!controle && !tartarugaComOposicao) {
        return { ok: false, erro: 'A recuperação de guarda exige estar sob controle do oponente (ou em tartaruga com oposição efetiva).' };
      }
      const d = disputar(campanha, executor, alvo!, pedido, ctx);
      const tentativa = acao(alvo!.id);
      if (d.margem <= 0) return monta(['guardas-raspagens', 'tartaruga'], d.linhas, [MANTEM([tentativa])]);
      const efeitos: Efeito[] = [tentativa];
      if (controle) efeitos.push({ tipo: 'encerrar-controle', controleId: controle.id });
      efeitos.push({ tipo: 'criar-guarda', inferiorId: executor.id, superiorId: alvo!.id, subcategoria: pedido.subcategoria });
      return monta(['guardas-raspagens', 'guarda-contador'], d.linhas, [
        {
          rotulo: `Recuperar ${NOME_SUBCATEGORIA[pedido.subcategoria].toLowerCase()}`,
          descricao: `${controle ? 'O controle termina e ' : ''}${executor.nome} estabelece a guarda; contador em 0/2.`,
          efeitos,
        },
      ]);
    }

    case 'passar-guarda': {
      const falta = exigirAlvo();
      if (falta) return { ok: false, erro: falta };
      const g = v.guardas.find((x) => x.superiorId === executor.id && x.inferiorId === alvo!.id);
      if (!g) return { ok: false, erro: `${executor.nome} precisa estar na guarda de ${alvo!.nome} para passá-la.` };
      const d = disputar(campanha, executor, alvo!, pedido, ctx);
      if (d.margem <= 0) return monta(['guardas-raspagens'], d.linhas, [MANTEM([acao()])]);
      return monta(['guardas-raspagens'], d.linhas, [
        {
          rotulo: 'Aplicar passagem até controle lateral',
          descricao: 'A guarda termina e o executor chega a controle lateral (guarda compatível). Não concede dano nem ataque gratuito.',
          efeitos: [
            acao(),
            { tipo: 'encerrar-guarda', guardaId: g.id, motivo: 'transicao' },
            { tipo: 'criar-controle', controladorId: executor.id, controladoId: alvo!.id, posicao: 'lateral' },
          ],
        },
      ]);
    }

    case 'raspagem': {
      const falta = exigirAlvo();
      if (falta) return { ok: false, erro: falta };
      const g = v.guardas.find((x) => x.inferiorId === executor.id && x.superiorId === alvo!.id);
      if (!g) return { ok: false, erro: `${executor.nome} precisa estar na guarda inferior com ${alvo!.nome} para raspar.` };
      const d = disputar(campanha, executor, alvo!, pedido, ctx);
      if (d.margem <= 0) return monta(['guardas-raspagens'], d.linhas, [MANTEM([acao()])]);
      const inversao: OpcaoPendencia = {
        rotulo: 'Aplicar inversão sem controle lateral',
        descricao:
          'Inverte a relação superior/inferior, sem controle lateral automático. Interpretação do aplicativo: os papéis trocam dentro do mesmo vínculo de guarda (mesmo contador); ajuste manualmente se a mesa decidir de outra forma.',
        efeitos: [acao(), { tipo: 'inverter-guarda', guardaId: g.id }],
      };
      if (d.margem <= 3) return monta(['guardas-raspagens'], d.linhas, [inversao]);
      return monta(['guardas-raspagens'], d.linhas, [
        {
          rotulo: 'Aplicar inversão com controle lateral',
          descricao: 'Margem ≥ +4: controle lateral, se compatível com a abordagem declarada.',
          efeitos: [
            acao(),
            { tipo: 'encerrar-guarda', guardaId: g.id, motivo: 'transicao' },
            { tipo: 'criar-controle', controladorId: executor.id, controladoId: alvo!.id, posicao: 'lateral' },
          ],
        },
        inversao,
      ]);
    }

    case 'escape-lateral':
    case 'reversao-lateral': {
      const falta = exigirAlvo();
      if (falta) return { ok: false, erro: falta };
      const k = v.controlado.find((x) => x.controladorId === alvo!.id && x.posicao === 'lateral');
      if (!k) return { ok: false, erro: `${executor.nome} precisa estar sob controle lateral de ${alvo!.nome}.` };
      const d = disputar(campanha, executor, alvo!, pedido, ctx);
      if (d.margem <= 0) return monta(['escapes'], d.linhas, [MANTEM([acao()])]);
      const reversaoAlta = pedido.transicao === 'reversao-lateral' && d.margem >= 4;
      return monta(['escapes'], d.linhas, [
        {
          rotulo: reversaoAlta ? 'Aplicar inversão simples' : 'Aplicar saída para solo neutro',
          descricao: reversaoAlta
            ? 'O controle termina com inversão simples, sem controle lateral automático. O aplicativo registra ambos em solo neutro; a inversão é narrativa.'
            : pedido.transicao === 'reversao-lateral'
              ? 'Reversão com margem de +1 a +3: solo neutro, sem inversão.'
              : 'O controle lateral termina; ambos em solo neutro.',
          efeitos: [
            acao(),
            { tipo: 'encerrar-controle', controleId: k.id },
            { tipo: 'postura', participanteId: executor.id, postura: 'solo-neutro' },
            { tipo: 'postura', participanteId: alvo!.id, postura: 'solo-neutro' },
          ],
        },
      ]);
    }

    case 'escape-dominante': {
      const falta = exigirAlvo();
      if (falta) return { ok: false, erro: falta };
      const k = v.controlado.find((x) => x.controladorId === alvo!.id && x.posicao !== 'lateral');
      if (!k) return { ok: false, erro: `${executor.nome} precisa estar sob montada, costas ou norte-sul de ${alvo!.nome}.` };
      const destinoGuarda = (['fechada', 'aberta', 'meia', 'borboleta'] as const).find((s) => s === pedido.destino);
      if (destinoGuarda) {
        const bloqueio = semReentrada();
        if (bloqueio) return { ok: false, erro: `${bloqueio} Declare outro destino intermediário.` };
      }
      const d = disputar(campanha, executor, alvo!, pedido, ctx);
      const linhas = [`Destino intermediário declarado: ${NOME_DESTINO[pedido.destino]}.`, ...d.linhas];
      const tentativa = acao(destinoGuarda ? alvo!.id : null);
      if (d.margem <= 0) return monta(['escapes'], linhas, [MANTEM([tentativa])]);
      if (d.margem >= 4) {
        return monta(['escapes'], linhas, [
          {
            rotulo: 'Aplicar saída para solo neutro',
            descricao: 'Margem ≥ +4: o controle termina; ambos em solo neutro.',
            efeitos: [
              tentativa,
              { tipo: 'encerrar-controle', controleId: k.id },
              { tipo: 'postura', participanteId: executor.id, postura: 'solo-neutro' },
              { tipo: 'postura', participanteId: alvo!.id, postura: 'solo-neutro' },
            ],
          },
        ]);
      }
      const efeitos: Efeito[] = [tentativa];
      let descricao = 'Margem de +1 a +3: alcança o destino defensivo intermediário declarado e validado antes do teste.';
      if (destinoGuarda) {
        efeitos.push({ tipo: 'encerrar-controle', controleId: k.id });
        efeitos.push({ tipo: 'criar-guarda', inferiorId: executor.id, superiorId: alvo!.id, subcategoria: destinoGuarda });
      } else if (pedido.destino === 'tartaruga') {
        efeitos.push({ tipo: 'encerrar-controle', controleId: k.id });
        efeitos.push({ tipo: 'postura', participanteId: executor.id, postura: 'tartaruga' });
        descricao += ' Controle adversário sobre a tartaruga, se houver, deve ser registrado separadamente pelo mestre.';
      } else if (pedido.destino === 'lateral') {
        efeitos.push({ tipo: 'encerrar-controle', controleId: k.id });
        efeitos.push({ tipo: 'criar-controle', controladorId: alvo!.id, controladoId: executor.id, posicao: 'lateral' });
      } else {
        descricao += ' Aplique o destino manualmente no painel de posições.';
      }
      return monta(['escapes'], linhas, [{ rotulo: `Aplicar destino: ${NOME_DESTINO[pedido.destino]}`, descricao, efeitos }]);
    }

    case 'sair-tartaruga': {
      if (executor.postura !== 'tartaruga') return { ok: false, erro: `${executor.nome} não está em tartaruga.` };
      if (v.controlado.length > 0) {
        return { ok: false, erro: 'Há controle estabelecido: resolva-o pelo procedimento próprio. A postura não apaga o controle.' };
      }
      const sai: Efeito = { tipo: 'postura', participanteId: executor.id, postura: 'solo-neutro' };
      if (!pedido.comOposicao) {
        return monta(['tartaruga'], ['Sem oposição efetiva: ação principal, sem teste.'], [
          { rotulo: 'Aplicar saída para solo neutro', descricao: `${executor.nome} passa a solo neutro.`, efeitos: [acao(), sai] },
        ]);
      }
      const falta = exigirAlvo();
      if (falta) return { ok: false, erro: falta };
      const d = disputar(campanha, executor, alvo!, pedido, ctx);
      if (d.margem <= 0) return monta(['tartaruga'], d.linhas, [MANTEM([acao()])]);
      return monta(['tartaruga'], d.linhas, [
        { rotulo: 'Aplicar saída para solo neutro', descricao: `${executor.nome} passa a solo neutro.`, efeitos: [acao(), sai] },
      ]);
    }

    case 'levantar': {
      if (executor.postura !== 'solo-neutro') return { ok: false, erro: 'Só é possível levantar-se desde solo neutro.' };
      if (temVinculo(c, executor.id)) {
        return { ok: false, erro: 'Guardas e controles precisam ser resolvidos antes de levantar-se.' };
      }
      const levanta: Efeito = { tipo: 'postura', participanteId: executor.id, postura: 'em-pe' };
      if (!pedido.comOposicao) {
        return monta(['levantar'], ['Sem oposição efetiva: ação principal, sem teste.'], [
          { rotulo: 'Aplicar: em pé', descricao: `${executor.nome} se levanta.`, efeitos: [acao(), levanta] },
        ]);
      }
      const falta = exigirAlvo();
      if (falta) return { ok: false, erro: falta };
      const d = disputar(campanha, executor, alvo!, pedido, ctx);
      if (d.margem <= 0) {
        return monta(['levantar'], d.linhas, [
          MANTEM([acao()], 'Vitória do opositor ou empate: permanece em solo neutro, sem controle, ataque ou queda gratuita.'),
        ]);
      }
      return monta(['levantar'], d.linhas, [
        { rotulo: 'Aplicar: em pé', descricao: `${executor.nome} se levanta.`, efeitos: [acao(), levanta] },
      ]);
    }

    case 'deslocamento-guarda': {
      const falta = exigirAlvo();
      if (falta) return { ok: false, erro: falta };
      const g = guardaEntre(c, executor.id, alvo!.id);
      if (!g) return { ok: false, erro: 'O deslocamento conjunto exige uma guarda entre os dois.' };
      const d = disputar(campanha, executor, alvo!, pedido, ctx);
      if (d.margem <= 0) return monta(['guarda-deslocamento'], d.linhas, [MANTEM([acao()], 'Derrota ou empate mantêm o estado.')]);
      return monta(['guarda-deslocamento'], d.linhas, [
        {
          rotulo: 'Registrar deslocamento conjunto',
          descricao: 'Mova os dois tokens juntos no mapa, até 2 m e respeitando obstáculos. Sem bônus, dano, posição, VIG ou ação gratuita.',
          efeitos: [acao()],
        },
      ]);
    }

    case 'interferencia': {
      const g = c.guardas.find((x) => x.id === pedido.guardaId);
      if (!g) return { ok: false, erro: 'Escolha a guarda em que o terceiro vai interferir.' };
      if (g.inferiorId === executor.id || g.superiorId === executor.id) {
        return { ok: false, erro: 'A interferência externa é feita por um terceiro, não por um integrante da guarda.' };
      }
      if (!alvo || (alvo.id !== g.inferiorId && alvo.id !== g.superiorId)) {
        return { ok: false, erro: 'Escolha um único defensor direto entre os dois integrantes da guarda.' };
      }
      const d = disputar(campanha, executor, alvo, pedido, ctx);
      const linhas = [`Defensor direto: ${alvo.nome}.`, ...d.linhas];
      if (d.margem <= 0) {
        return monta(['interferencia'], linhas, [MANTEM([acao()], 'Empate ou derrota preservam a guarda e o contador.')]);
      }
      return monta(['interferencia', 'reentrada'], linhas, [
        {
          rotulo: 'Encerrar a guarda',
          descricao: 'A guarda termina; os dois integrantes ficam em solo neutro, sem controle, e cada um recebe seu intervalo de reentrada. O terceiro não ganha controle nem transição.',
          efeitos: [acao(), { tipo: 'encerrar-guarda', guardaId: g.id, motivo: 'interferencia' }],
        },
      ]);
    }

    case 'tecnica':
      return resolverTecnica(campanha, c, executor, alvo, fichaExecutor, pedido, ctx);
  }
}

function resolverTecnica(
  campanha: Campanha,
  c: Combate,
  executor: Participante,
  alvo: Participante | undefined,
  ficha: Ficha | null,
  pedido: PedidoTransicao,
  ctx: ContextoRegras,
): Resolucao {
  const tecnica = tecnicaDoCatalogo(pedido.tecnica);
  if (!tecnica) return { ok: false, erro: 'Técnica não encontrada no catálogo.' };
  if (tecnica.status !== 'aprovada') {
    return { ok: false, erro: `${tecnica.codigo} ${tecnica.nome} ${tecnica.versao}: ${tecnica.nota}` };
  }
  if (!ficha) return { ok: false, erro: 'O executor precisa de uma ficha para usar técnicas especializadas.' };
  const aprendida = ficha.tecnicas.some((t) => (t.refCatalogo ?? '').toUpperCase() === tecnica.codigo);
  if (!aprendida) {
    return { ok: false, erro: `${ficha.nome} não tem ${tecnica.codigo} registrada na ficha. O mestre valida o aprendizado antes do uso.` };
  }
  const custo = CUSTO_CATEGORIA_FISICA[tecnica.categoria];
  if (ficha.vigAtual < custo) return { ok: false, erro: `VIG insuficiente: custo ${custo}, disponível ${ficha.vigAtual}.` };

  const nomeTecnica = `${tecnica.codigo} ${tecnica.nome} ${tecnica.versao}`;
  const titulo = `${nomeTecnica}: ${executor.nome}${alvo ? ` × ${alvo.nome}` : ''}`;
  const vig: Efeito = { tipo: 'recurso', fichaId: ficha.id, recurso: 'vig', delta: -custo, motivo: nomeTecnica, ajustavel: false };
  const acao = (contra: Id | null): Efeito => ({ tipo: 'acao-principal', participanteId: executor.id, iniciaGuardaContra: contra });
  const cabecalho = `Custo comprometido no início legítimo: ação principal e ${custo} VIG, sem reembolso.`;
  const monta = (linhas: string[], opcoes: OpcaoPendencia[]) =>
    pendencia(ctx, 'tecnica', titulo, ficha.id, alvo?.fichaId ?? null, [cabecalho, ...linhas], ['tecnica-execucao', 'tecnicas-fisicas'], opcoes);

  if (tecnica.automacao === 'manual') {
    return monta(
      ['Ficha completa não reproduzida nas fontes: requisitos, teste e resultado são resolvidos pelo mestre.'],
      [
        {
          rotulo: 'Registrar uso (resolução manual)',
          descricao: 'Consome a ação principal e a VIG da categoria. Aplique o resultado manualmente no painel de posições; nenhum efeito é inventado pelo aplicativo.',
          efeitos: [acao(null), vig],
        },
      ],
    );
  }

  if (!alvo) return { ok: false, erro: 'Escolha o oponente desta técnica.' };
  const v = vinculosDe(c, executor.id);

  if (tecnica.codigo === 'LET-ESP-001') {
    const k = v.controlado.find((x) => x.controladorId === alvo.id && x.posicao === 'lateral');
    if (!k) return { ok: false, erro: `${tecnica.codigo} exige o executor sob controle lateral do alvo.` };
    if (intervaloPendente(c, executor.id, alvo.id)) {
      return { ok: false, erro: `Reentrada bloqueada contra ${alvo.nome}: consuma antes outra ação principal.` };
    }
    const d = disputar(campanha, executor, alvo, pedido, ctx);
    const base = [acao(alvo.id), vig];
    const guarda = (subcategoria: SubcategoriaGuarda): Efeito[] => [
      ...base,
      { tipo: 'encerrar-controle', controleId: k.id },
      { tipo: 'criar-guarda', inferiorId: executor.id, superiorId: alvo.id, subcategoria },
    ];
    if (d.margem >= 1) {
      return monta(d.linhas, [
        { rotulo: 'Estabelecer guarda aberta defensiva', descricao: 'Margem ≥ +1: termina o controle lateral e estabelece guarda aberta defensiva.', efeitos: guarda('aberta') },
      ]);
    }
    if (d.margem === -1 || d.margem === -2) {
      return monta(d.linhas, [
        { rotulo: 'Estabelecer meia-guarda defensiva', descricao: 'Margem −1 ou −2 (exceção individual de derrota estreita): termina o controle lateral e estabelece meia-guarda defensiva.', efeitos: guarda('meia') },
      ]);
    }
    return monta(d.linhas, [MANTEM(base, 'Margem 0 ou ≤ −3: mantém posição e controle. Sem reembolso.')]);
  }

  if (tecnica.codigo === 'LET-ESP-002') {
    const g = v.guardas.find((x) => x.inferiorId === executor.id && x.superiorId === alvo.id);
    if (!g || g.subcategoria !== 'borboleta') {
      return { ok: false, erro: `${tecnica.codigo} parte exclusivamente de guarda borboleta defensiva contra o alvo.` };
    }
    const d = disputar(campanha, executor, alvo, pedido, ctx);
    const base = [acao(null), vig];
    if (d.margem >= 1) {
      return monta(d.linhas, [
        {
          rotulo: 'Aplicar inversão com controle lateral',
          descricao: 'Margem ≥ +1: inversão e controle lateral contra o mesmo oponente (exceção individual à raspagem fundamental).',
          efeitos: [
            ...base,
            { tipo: 'encerrar-guarda', guardaId: g.id, motivo: 'transicao' },
            { tipo: 'criar-controle', controladorId: executor.id, controladoId: alvo.id, posicao: 'lateral' },
          ],
        },
      ]);
    }
    return monta(d.linhas, [MANTEM(base, 'Margem ≤ 0: mantém posição. Sem reembolso.')]);
  }

  return { ok: false, erro: 'Técnica sem resolução automática disponível.' };
}

/** Quais transições fazem sentido para o executor na situação atual (para a interface). */
export function transicoesDisponiveis(c: Combate, executorId: Id): Transicao[] {
  const p = participante(c, executorId);
  if (!p) return [];
  const v = vinculosDe(c, executorId);
  const lista: Transicao[] = [];
  const livre = !temVinculo(c, executorId);
  if (p.postura === 'em-pe' && livre) lista.push('queda');
  if (p.postura === 'solo-neutro' && livre) lista.push('entrar-guarda', 'levantar');
  if (v.controlado.length > 0 || (p.postura === 'tartaruga' && livre)) lista.push('recuperar-guarda');
  if (v.guardas.some((g) => g.superiorId === executorId)) lista.push('passar-guarda');
  if (v.guardas.some((g) => g.inferiorId === executorId)) lista.push('raspagem');
  if (v.controlado.some((k) => k.posicao === 'lateral')) lista.push('escape-lateral', 'reversao-lateral');
  if (v.controlado.some((k) => k.posicao !== 'lateral')) lista.push('escape-dominante');
  if (p.postura === 'tartaruga' && v.controlado.length === 0) lista.push('sair-tartaruga');
  if (v.guardas.length > 0) lista.push('deslocamento-guarda');
  if (c.guardas.some((g) => g.inferiorId !== executorId && g.superiorId !== executorId)) lista.push('interferencia');
  lista.push('tecnica');
  return lista;
}

export { limitarRecursos };
