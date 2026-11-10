import { describe, expect, it } from 'vitest';
import type { Campanha } from '../src/dominio/esquema';
import { campanhaVazia, novaFicha } from '../src/dominio/fabrica';
import { derivar } from '../src/dominio/regras/ficha';
import { exec, recusa } from './apoio';
import type { PedidoTransicao } from '../src/dominio/regras/combate';

/** Combate com três Esquecidos (A, B, C) de FIS 3 / DES 3, todos com LET-ESP-001/002 na ficha. */
function arena() {
  let c = campanhaVazia('Arena');
  const tecnicas = ['LET-ESP-001', 'LET-ESP-002', 'LET-ESP-003', 'LET-ESP-016'].map((ref, i) => ({
    id: `tec${i}`, nome: ref, tipo: 'fisica' as const, grau: null, categoria: 'especial' as const, refCatalogo: ref, notas: '',
  }));
  const fichas = ['A', 'B', 'C'].map((nome) =>
    novaFicha({ nome, origem: 'esquecido', atributosBase: { fis: 3, des: 3, men: 2, yan: 0 }, tecnicas }));
  for (const f of fichas) c = exec(c, { tipo: 'ficha.criar', ficha: f });
  c = exec(c, { tipo: 'combate.iniciar', participantes: fichas.map((f) => ({ nome: f.nome, tokenId: null, fichaId: f.id })) });
  const [a, b, t] = c.combate!.participantes.map((p) => p.id);
  return { c, a, b, t, fichas };
}

const pedido = (p: Partial<PedidoTransicao> & Pick<PedidoTransicao, 'transicao' | 'executorId'>): PedidoTransicao => ({
  alvoId: null, abordagemExecutor: 'fis', abordagemAlvo: 'fis', forcaBrutaExecutor: false, forcaBrutaAlvo: false,
  acompanharQueda: true, subcategoria: 'fechada', destino: 'manual', comOposicao: false, guardaId: null, tecnica: '', ...p,
});

/** Resolve uma transição com as faces dadas [executor, alvo] e confirma a opção. */
function resolver(c: Campanha, p: PedidoTransicao, faces: number[], opcao = 0): Campanha {
  c = exec(c, { tipo: 'combate.resolverTransicao', pedido: p }, undefined, faces);
  const pend = c.pendencias.at(-1)!;
  return exec(c, { tipo: 'pendencia.confirmar', pendenciaId: pend.id, opcao, substituicoes: {}, visibilidade: 'publica' });
}

const novaRodada = (c: Campanha): Campanha => {
  const n = c.combate!.participantes.length - c.combate!.turno;
  for (let i = 0; i < n; i++) c = exec(c, { tipo: 'combate.avancar' });
  return c;
};

/** Leva A e B ao solo e põe A na guarda inferior com B. */
function comGuarda(subcategoria: PedidoTransicao['subcategoria'] = 'fechada') {
  const base = arena();
  let c = base.c;
  c = resolver(c, pedido({ transicao: 'queda', executorId: base.a, alvoId: base.b }), [12, 10]); // margem +2: ambos em solo neutro
  c = novaRodada(c);
  c = resolver(c, pedido({ transicao: 'entrar-guarda', executorId: base.a, alvoId: base.b, subcategoria }), [15, 5]);
  return { ...base, c };
}

describe('iniciativa e turnos', () => {
  it('d20 + DES, ordenação e empate decidido pelo mestre', () => {
    let { c } = arena();
    c = exec(c, { tipo: 'combate.rolarIniciativa', participanteIds: null }, undefined, [10, 15, 10]);
    const cb = c.combate!;
    expect(cb.participantes.map((p) => [p.nome, p.iniciativa])).toEqual([['B', 18], ['A', 13], ['C', 13]]);
    expect(cb.empates).toHaveLength(1);
    // Sem regra aprovada de desempate, o turno não avança até o mestre decidir.
    expect(recusa(c, { tipo: 'combate.avancar' })).toMatch(/empate/i);
    const [b, a, t] = cb.participantes.map((p) => p.id);
    c = exec(c, { tipo: 'combate.ordenar', ordem: [b, t, a] });
    expect(c.combate!.empates).toHaveLength(0);
    c = exec(c, { tipo: 'combate.avancar' });
    expect(c.combate!.participantes[c.combate!.turno].nome).toBe('C');
  });

  it('nova rodada libera ação principal, movimento e reação', () => {
    let { c, a } = arena();
    c = exec(c, { tipo: 'combate.acao', participanteId: a, acao: 'principal', usada: true, descricao: '' });
    c = exec(c, { tipo: 'combate.acao', participanteId: a, acao: 'reacao', usada: true, descricao: '' });
    expect(recusa(c, { tipo: 'combate.acao', participanteId: a, acao: 'principal', usada: true, descricao: '' })).toMatch(/já usou/);
    c = novaRodada(c);
    expect(c.combate!.rodada).toBe(2);
    expect(c.combate!.participantes[0]).toMatchObject({ acaoPrincipal: false, movimento: false, reacao: false });
  });
});

describe('ataque', () => {
  it('acerto aplica dano com redução, somente após a confirmação', () => {
    let { c, fichas } = arena();
    const [fa, fb] = fichas;
    const pvAntes = c.fichas[1].pvAtual;
    c = exec(c, { tipo: 'combate.resolverAtaque', pedido: { atacanteFichaId: fa.id, alvoFichaId: fb.id, atributo: 'fis', arma: 'pesada' } }, undefined, [15, 7]);
    expect(c.fichas[1].pvAtual).toBe(pvAntes); // nada muda antes de confirmar
    expect(c.combate!.participantes[0].acaoPrincipal).toBe(false);
    const pend = c.pendencias[0];
    expect(pend.linhas.join(' ')).toContain('18 contra Defesa 13');
    c = exec(c, { tipo: 'pendencia.confirmar', pendenciaId: pend.id, opcao: 0, substituicoes: {}, visibilidade: 'publica' });
    // d8 (7) + FIS 3 = 10; redução natural do Esquecido 3 (+1 da armadura? não: sem armadura) → 7. Sem multiplicador 10×.
    expect(c.fichas[1].pvAtual).toBe(pvAntes - 7);
    expect(c.combate!.participantes[0].acaoPrincipal).toBe(true);
    expect(c.pendencias).toHaveLength(0);
  });

  it('20 natural dobra apenas os dados de dano', () => {
    let { c, fichas } = arena();
    const pvAntes = c.fichas[1].pvAtual;
    c = exec(c, { tipo: 'combate.resolverAtaque', pedido: { atacanteFichaId: fichas[0].id, alvoFichaId: fichas[1].id, atributo: 'fis', arma: 'leve' } }, undefined, [20, 3, 4]);
    c = exec(c, { tipo: 'pendencia.confirmar', pendenciaId: c.pendencias[0].id, opcao: 0, substituicoes: {}, visibilidade: 'publica' });
    expect(c.fichas[1].pvAtual).toBe(pvAntes - (3 + 4 + 3 - 3));
  });

  it('erro não causa dano; total igual à Defesa pede decisão do mestre; cancelar não gasta nada', () => {
    let { c, fichas } = arena();
    const defesa = derivar(c.fichas[1]).defesa.total; // 13
    c = exec(c, { tipo: 'combate.resolverAtaque', pedido: { atacanteFichaId: fichas[0].id, alvoFichaId: fichas[1].id, atributo: 'fis', arma: 'media' } }, undefined, [2]);
    expect(c.pendencias[0].opcoes).toHaveLength(1);
    expect(c.pendencias[0].opcoes[0].efeitos.some((e) => e.tipo === 'recurso')).toBe(false);
    c = exec(c, { tipo: 'pendencia.cancelar', pendenciaId: c.pendencias[0].id });
    expect(c.combate!.participantes[0].acaoPrincipal).toBe(false);
    c = exec(c, { tipo: 'combate.resolverAtaque', pedido: { atacanteFichaId: fichas[0].id, alvoFichaId: fichas[1].id, atributo: 'fis', arma: 'media' } }, undefined, [defesa - 3, 4]);
    expect(c.pendencias[0].opcoes.map((o) => o.rotulo)).toEqual(['Considerar acerto', 'Considerar erro']);
  });

  it('o mestre pode ajustar o dano final na confirmação', () => {
    let { c, fichas } = arena();
    const pvAntes = c.fichas[1].pvAtual;
    c = exec(c, { tipo: 'combate.resolverAtaque', pedido: { atacanteFichaId: fichas[0].id, alvoFichaId: fichas[1].id, atributo: 'fis', arma: 'pesada' } }, undefined, [15, 7]);
    const pend = c.pendencias[0];
    const indice = pend.opcoes[0].efeitos.findIndex((e) => e.tipo === 'recurso');
    c = exec(c, { tipo: 'pendencia.confirmar', pendenciaId: pend.id, opcao: 0, substituicoes: { [String(indice)]: -2 }, visibilidade: 'publica' });
    expect(c.fichas[1].pvAtual).toBe(pvAntes - 2);
  });
});

describe('quedas e transições', () => {
  it('margens de queda: sem queda, sem controle, com controle', () => {
    const { c, a, b } = arena();
    const q = pedido({ transicao: 'queda', executorId: a, alvoId: b });
    let r = resolver(c, q, [10, 10]);
    expect(r.combate!.participantes.map((p) => p.postura)).toEqual(['em-pe', 'em-pe', 'em-pe']);
    expect(r.combate!.participantes[0].acaoPrincipal).toBe(true); // tentativa legítima consome a ação
    r = resolver(c, q, [13, 10]);
    expect(r.combate!.participantes.slice(0, 2).map((p) => p.postura)).toEqual(['solo-neutro', 'solo-neutro']);
    expect(r.combate!.controles).toHaveLength(0);
    r = resolver(c, q, [15, 10]);
    expect(r.combate!.controles[0]).toMatchObject({ controladorId: a, controladoId: b, posicao: 'lateral' });
    r = resolver(c, { ...q, acompanharQueda: false }, [18, 10]);
    expect(r.combate!.participantes.slice(0, 2).map((p) => p.postura)).toEqual(['em-pe', 'solo-neutro']);
    expect(r.combate!.controles).toHaveLength(0);
  });

  it('2d20 (maior) só para Esquecido em força bruta pura com FIS', () => {
    let { c, a, b } = arena();
    c = exec(c, { tipo: 'combate.resolverTransicao', pedido: pedido({ transicao: 'queda', executorId: a, alvoId: b, forcaBrutaExecutor: true }) }, undefined, [3, 16, 10]);
    expect(c.pendencias[0].linhas.join(' ')).toContain('2d20 (16, descartado 3)');
    // Com abordagem de DES a força bruta não se aplica: apenas um dado por lado.
    const { c: c2, a: a2, b: b2 } = arena();
    const r = exec(c2, { tipo: 'combate.resolverTransicao', pedido: pedido({ transicao: 'queda', executorId: a2, alvoId: b2, forcaBrutaExecutor: true, abordagemExecutor: 'des' }) }, undefined, [3, 16]);
    expect(r.pendencias[0].linhas.join(' ')).not.toContain('2d20');
  });

  it('transição inválida não consome ação nem VIG', () => {
    const { c, a, b } = arena();
    expect(recusa(c, { tipo: 'combate.resolverTransicao', pedido: pedido({ transicao: 'raspagem', executorId: a, alvoId: b }) })).toMatch(/guarda inferior/);
    expect(recusa(c, { tipo: 'combate.resolverTransicao', pedido: pedido({ transicao: 'levantar', executorId: a }) })).toMatch(/solo neutro/);
    expect(c.combate!.participantes[0].acaoPrincipal).toBe(false);
  });

  it('escape de controle lateral e passagem de guarda', () => {
    let { c, a, b } = comGuarda();
    c = novaRodada(c);
    c = resolver(c, pedido({ transicao: 'passar-guarda', executorId: b, alvoId: a }), [14, 9]);
    expect(c.combate!.guardas).toHaveLength(0);
    expect(c.combate!.controles[0]).toMatchObject({ controladorId: b, controladoId: a, posicao: 'lateral' });
    // A passagem encerra a guarda sem criar intervalo de reentrada.
    expect(c.combate!.intervalos).toHaveLength(0);
    c = novaRodada(c);
    c = resolver(c, pedido({ transicao: 'escape-lateral', executorId: a, alvoId: b }), [12, 11]);
    expect(c.combate!.controles).toHaveLength(0);
    expect(c.combate!.participantes[0].postura).toBe('solo-neutro');
  });
});

describe('guardas: identidade, contador compartilhado e reentrada', () => {
  it('a entrada em guarda cria o vínculo com contador em 0', () => {
    const { c, a, b } = comGuarda();
    expect(c.combate!.guardas).toHaveLength(1);
    expect(c.combate!.guardas[0]).toMatchObject({ inferiorId: a, superiorId: b, subcategoria: 'fechada', contador: 0 });
  });

  it('duas ações principais compartilhadas expiram a guarda e criam intervalos individuais', () => {
    let { c, a, b } = comGuarda();
    const guardaId = c.combate!.guardas[0].id;
    // 1ª ação compartilhada: B usa sua ação principal dentro da guarda.
    c = exec(c, { tipo: 'combate.acao', participanteId: b, acao: 'principal', usada: true, descricao: 'ataque comum' });
    expect(c.combate!.guardas[0]).toMatchObject({ id: guardaId, contador: 1 });
    c = novaRodada(c);
    // Mudar a subcategoria preserva identidade e contador (Aud. 49).
    c = exec(c, { tipo: 'combate.editarGuarda', guardaId, subcategoria: 'meia' });
    expect(c.combate!.guardas[0]).toMatchObject({ id: guardaId, subcategoria: 'meia', contador: 1 });
    // 2ª ação compartilhada, agora de A: resolve e então a guarda expira.
    c = exec(c, { tipo: 'combate.acao', participanteId: a, acao: 'principal', usada: true, descricao: '' });
    const cb = c.combate!;
    expect(cb.guardas).toHaveLength(0);
    expect(cb.participantes.slice(0, 2).map((p) => p.postura)).toEqual(['solo-neutro', 'solo-neutro']);
    expect(cb.controles).toHaveLength(0);
    expect(cb.intervalos).toEqual(expect.arrayContaining([
      { combatenteId: a, oponenteId: b, motivo: 'expiracao' },
      { combatenteId: b, oponenteId: a, motivo: 'expiracao' },
    ]));
  });

  it('exemplo 6: contador em 1, B usa ação especializada válida; resolve inteira e só então expira', () => {
    // A na guarda borboleta inferior com B; aqui o executor da técnica é o próprio A (inferior).
    let { c, a, b } = comGuarda('borboleta');
    c = exec(c, { tipo: 'combate.acao', participanteId: b, acao: 'principal', usada: true, descricao: '' });
    expect(c.combate!.guardas[0].contador).toBe(1);
    c = novaRodada(c);
    const vigAntes = c.fichas[0].vigAtual;
    // LET-ESP-002 com derrota (margem ≤ 0): posição mantida → a guarda ainda existe ao fim da 2ª ação → expira.
    c = resolver(c, pedido({ transicao: 'tecnica', tecnica: 'LET-ESP-002', executorId: a, alvoId: b }), [5, 15]);
    expect(c.fichas[0].vigAtual).toBe(vigAntes - 2); // sem reembolso
    expect(c.combate!.guardas).toHaveLength(0);
    expect(c.combate!.intervalos).toHaveLength(2);
  });

  it('a segunda ação especializada que encerra a guarda não gera expiração nem intervalo', () => {
    let { c, a, b } = comGuarda('borboleta');
    c = exec(c, { tipo: 'combate.acao', participanteId: b, acao: 'principal', usada: true, descricao: '' });
    c = novaRodada(c);
    c = resolver(c, pedido({ transicao: 'tecnica', tecnica: 'LET-ESP-002', executorId: a, alvoId: b }), [15, 5]);
    expect(c.combate!.guardas).toHaveLength(0);
    expect(c.combate!.controles[0]).toMatchObject({ controladorId: a, controladoId: b, posicao: 'lateral' });
    expect(c.combate!.intervalos).toHaveLength(0);
  });

  it('reentrada: bloqueada até consumir outra ação principal; tentar iniciar guarda contra o mesmo oponente não conta', () => {
    let { c, a, b } = comGuarda();
    c = exec(c, { tipo: 'combate.acao', participanteId: b, acao: 'principal', usada: true, descricao: '' });
    c = exec(c, { tipo: 'combate.editarGuarda', guardaId: c.combate!.guardas[0].id, contador: 1 });
    c = novaRodada(c);
    c = exec(c, { tipo: 'combate.acao', participanteId: b, acao: 'principal', usada: true, descricao: '' }); // expira
    expect(c.combate!.guardas).toHaveLength(0);
    const entrar = pedido({ transicao: 'entrar-guarda', executorId: a, alvoId: b });
    // A ainda não consumiu ação alguma depois da expiração: reentrada bloqueada, sem gastar a ação.
    expect(recusa(c, { tipo: 'combate.resolverTransicao', pedido: entrar })).toMatch(/Reentrada bloqueada/);
    expect(c.combate!.participantes[0].acaoPrincipal).toBe(false);
    // Movimento e reação não satisfazem o intervalo.
    c = exec(c, { tipo: 'combate.acao', participanteId: a, acao: 'movimento', usada: true, descricao: '' });
    c = exec(c, { tipo: 'combate.acao', participanteId: a, acao: 'reacao', usada: true, descricao: '' });
    expect(recusa(c, { tipo: 'combate.resolverTransicao', pedido: entrar })).toMatch(/Reentrada bloqueada/);
    // O intervalo persiste na passagem de turnos e rodadas.
    c = novaRodada(c);
    expect(recusa(c, { tipo: 'combate.resolverTransicao', pedido: entrar })).toMatch(/Reentrada bloqueada/);
    // Uma ação principal legítima qualquer satisfaz o intervalo de A — e somente o de A.
    c = exec(c, { tipo: 'combate.acao', participanteId: a, acao: 'principal', usada: true, descricao: 'ataque' });
    expect(c.combate!.intervalos).toEqual([{ combatenteId: b, oponenteId: a, motivo: 'expiracao' }]);
    c = novaRodada(c);
    c = resolver(c, entrar, [15, 5]);
    expect(c.combate!.guardas).toHaveLength(1);
    expect(c.combate!.guardas[0].contador).toBe(0);
  });

  it('interferência externa: vitória encerra só a guarda A–B; derrota preserva guarda e contador', () => {
    let { c, a, b, t } = comGuarda();
    c = exec(c, { tipo: 'combate.acao', participanteId: b, acao: 'principal', usada: true, descricao: '' });
    const guardaId = c.combate!.guardas[0].id;
    const interferir = pedido({ transicao: 'interferencia', executorId: t, alvoId: b, guardaId });
    const derrota = resolver(c, interferir, [4, 12]);
    expect(derrota.combate!.guardas[0]).toMatchObject({ id: guardaId, contador: 1 }); // não conta no contador A–B
    const vitoria = resolver(c, interferir, [15, 8]);
    expect(vitoria.combate!.guardas).toHaveLength(0);
    expect(vitoria.combate!.controles).toHaveLength(0);
    expect(vitoria.combate!.participantes.map((p) => p.postura)).toEqual(['solo-neutro', 'solo-neutro', 'em-pe']);
    expect(vitoria.combate!.intervalos).toEqual(expect.arrayContaining([
      { combatenteId: a, oponenteId: b, motivo: 'interferencia' },
      { combatenteId: b, oponenteId: a, motivo: 'interferencia' },
    ]));
    expect(vitoria.combate!.intervalos).toHaveLength(2); // o terceiro não recebe intervalo
    // Um integrante não pode "interferir" na própria guarda, e é preciso escolher um defensor da guarda.
    const proxima = novaRodada(c);
    expect(recusa(proxima, { tipo: 'combate.resolverTransicao', pedido: { ...interferir, executorId: a } })).toMatch(/terceiro/);
    expect(recusa(proxima, { tipo: 'combate.resolverTransicao', pedido: { ...interferir, alvoId: null } })).toMatch(/defensor/);
  });

  it('raspagem: +1 a +3 inverte sem controle; ≥ +4 pode dar controle lateral', () => {
    const { c, a, b } = comGuarda();
    const c2 = novaRodada(c);
    const baixa = resolver(c2, pedido({ transicao: 'raspagem', executorId: a, alvoId: b }), [12, 10]);
    expect(baixa.combate!.guardas[0]).toMatchObject({ inferiorId: b, superiorId: a, contador: 1 });
    expect(baixa.combate!.controles).toHaveLength(0);
    const alta = resolver(c2, pedido({ transicao: 'raspagem', executorId: a, alvoId: b }), [16, 10]);
    expect(alta.combate!.guardas).toHaveLength(0);
    expect(alta.combate!.controles[0]).toMatchObject({ controladorId: a, controladoId: b });
  });
});

describe('técnicas especializadas', () => {
  /** A sob controle lateral de B. */
  function sobControle() {
    const base = arena();
    let c = resolver(base.c, pedido({ transicao: 'queda', executorId: base.b, alvoId: base.a }), [18, 10]);
    c = novaRodada(c);
    return { ...base, c };
  }

  it('LET-ESP-001: margens e exceção de derrota estreita', () => {
    const { c, a, b } = sobControle();
    const p = pedido({ transicao: 'tecnica', tecnica: 'LET-ESP-001', executorId: a, alvoId: b });
    const vig = c.fichas[0].vigAtual;
    const vitoria = resolver(c, p, [12, 10]);
    expect(vitoria.combate!.controles).toHaveLength(0);
    expect(vitoria.combate!.guardas[0]).toMatchObject({ inferiorId: a, superiorId: b, subcategoria: 'aberta', contador: 0 });
    expect(vitoria.fichas[0].vigAtual).toBe(vig - 2);
    const estreita = resolver(c, p, [9, 10]);
    expect(estreita.combate!.guardas[0]).toMatchObject({ subcategoria: 'meia' });
    const empate = resolver(c, p, [10, 10]);
    expect(empate.combate!.controles).toHaveLength(1);
    expect(empate.combate!.guardas).toHaveLength(0);
    expect(empate.fichas[0].vigAtual).toBe(vig - 2); // sem reembolso
    const larga = resolver(c, p, [5, 10]);
    expect(larga.combate!.controles).toHaveLength(1);
  });

  it('LET-ESP-001 exige controle lateral e técnica aprendida; LET-ESP-002 exige guarda borboleta', () => {
    const { c, a, b } = arena();
    expect(recusa(c, { tipo: 'combate.resolverTransicao', pedido: pedido({ transicao: 'tecnica', tecnica: 'LET-ESP-001', executorId: a, alvoId: b }) })).toMatch(/controle lateral/);
    const g = comGuarda('fechada');
    expect(recusa(novaRodada(g.c), { tipo: 'combate.resolverTransicao', pedido: pedido({ transicao: 'tecnica', tecnica: 'LET-ESP-002', executorId: g.a, alvoId: g.b }) })).toMatch(/borboleta/);
    let semTecnica = exec(c, { tipo: 'ficha.removerTecnica', fichaId: c.fichas[0].id, tecnicaId: 'tec0' });
    semTecnica = resolver(semTecnica, pedido({ transicao: 'queda', executorId: b, alvoId: a }), [18, 10]);
    semTecnica = novaRodada(semTecnica);
    expect(recusa(semTecnica, { tipo: 'combate.resolverTransicao', pedido: pedido({ transicao: 'tecnica', tecnica: 'LET-ESP-001', executorId: a, alvoId: b }) })).toMatch(/não tem LET-ESP-001/);
  });

  it('exemplo 2: LET-ESP-016 v0.2 pendente não consome recurso nem aplica efeito', () => {
    const { c, a, b } = arena();
    const vig = c.fichas[0].vigAtual;
    const erro = recusa(c, { tipo: 'combate.resolverTransicao', pedido: pedido({ transicao: 'tecnica', tecnica: 'LET-ESP-016', executorId: a, alvoId: b }) });
    expect(erro).toMatch(/Auditoria 132/);
    expect(c.fichas[0].vigAtual).toBe(vig);
    expect(c.combate!.participantes[0].acaoPrincipal).toBe(false);
    expect(c.pendencias).toHaveLength(0);
    // O mestre pode registrar uma decisão de sessão, que não muda o status da técnica.
    const comDecisao = exec(c, { tipo: 'decisao.registrar', texto: 'Nesta sessão, permitido uma vez.', referencia: 'LET-ESP-016' });
    expect(comDecisao.decisoes).toHaveLength(1);
    expect(recusa(comDecisao, { tipo: 'combate.resolverTransicao', pedido: pedido({ transicao: 'tecnica', tecnica: 'LET-ESP-016', executorId: a, alvoId: b }) })).toMatch(/Auditoria 132/);
    expect(recusa(c, { tipo: 'combate.resolverTransicao', pedido: pedido({ transicao: 'tecnica', tecnica: 'LET-ESP-010', executorId: a, alvoId: b }) })).toMatch(/Rejeitada/);
  });

  it('exemplo 3: técnica aprovada sem ficha completa → resolução manual, sem efeito inventado', () => {
    let { c, a, b } = arena();
    const vig = c.fichas[0].vigAtual;
    c = exec(c, { tipo: 'combate.resolverTransicao', pedido: pedido({ transicao: 'tecnica', tecnica: 'LET-ESP-003', executorId: a, alvoId: b }) });
    const pend = c.pendencias[0];
    expect(pend.opcoes).toHaveLength(1);
    expect(pend.opcoes[0].rotulo).toMatch(/manual/);
    expect(pend.opcoes[0].efeitos.map((e) => e.tipo).sort()).toEqual(['acao-principal', 'recurso']);
    c = exec(c, { tipo: 'pendencia.confirmar', pendenciaId: pend.id, opcao: 0, substituicoes: {}, visibilidade: 'publica' });
    expect(c.fichas[0].vigAtual).toBe(vig - 2);
    expect(c.combate!.guardas).toHaveLength(0);
    expect(c.combate!.controles).toHaveLength(0);
    expect(c.combate!.participantes.map((p) => p.postura)).toEqual(['em-pe', 'em-pe', 'em-pe']);
  });
});

describe('0 PV e estabilização', () => {
  it('três falhas levam a estado crítico, sem morte; três sucessos estabilizam', () => {
    let { c, fichas } = arena();
    const id = fichas[0].id;
    c = exec(c, { tipo: 'ficha.recurso', fichaId: id, recurso: 'pv', modo: 'definir', valor: 0, motivo: '' });
    expect(c.fichas[0].condicao.estado).toBe('incapacitado');
    let falhas = c;
    for (const face of [2, 3, 1]) falhas = exec(falhas, { tipo: 'ficha.estabilizacao', fichaId: id, modo: 'proprio', ajudanteFichaId: null }, undefined, [face]);
    expect(falhas.fichas[0].condicao.estado).toBe('critico');
    let sucessos = c;
    for (const face of [15, 2, 12, 18]) sucessos = exec(sucessos, { tipo: 'ficha.estabilizacao', fichaId: id, modo: 'proprio', ajudanteFichaId: null }, undefined, [face]);
    expect(sucessos.fichas[0].condicao.estado).toBe('estabilizado');
    const ajuda = exec(c, { tipo: 'ficha.estabilizacao', fichaId: id, modo: 'ajuda', ajudanteFichaId: fichas[1].id }, undefined, [14]);
    expect(ajuda.fichas[0].condicao.estado).toBe('estabilizado');
    expect(ajuda.combate!.participantes[1].acaoPrincipal).toBe(true);
  });

  it('recuperar vigor: ação principal, +3, respeitando o máximo', () => {
    let { c, fichas } = arena();
    const id = fichas[0].id;
    c = exec(c, { tipo: 'ficha.recurso', fichaId: id, recurso: 'vig', modo: 'delta', valor: -2, motivo: '' });
    c = exec(c, { tipo: 'ficha.recuperar', fichaId: id, recurso: 'vig' });
    expect(c.fichas[0].vigAtual).toBe(16);
    expect(c.combate!.participantes[0].acaoPrincipal).toBe(true);
    expect(recusa(c, { tipo: 'ficha.recuperar', fichaId: id, recurso: 'vig' })).toMatch(/já usou/);
    expect(recusa(c, { tipo: 'ficha.recuperar', fichaId: fichas[1].id, recurso: 'ry' })).toMatch(/Esquecidos/);
  });
});
