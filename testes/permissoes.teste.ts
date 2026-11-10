import { describe, expect, it } from 'vitest';
import { executarComando } from '../src/dominio/comandos';
import type { Campanha } from '../src/dominio/esquema';
import { campanhaVazia, gradePadrao, novaCena, novaFicha, novoToken } from '../src/dominio/fabrica';
import { arquivoVisivelPara, filtrarVisao, mapaJogadoresCobreNevoa } from '../src/dominio/visao';
import { entradasDoCompendio, buscarNoCompendio } from '../src/dominio/compendio/busca';
import { ENTRADAS_EMBUTIDAS } from '../src/dominio/compendio/semente';
import { MESTRE, contexto, exec, jogador, recusa } from './apoio';

const ANA = jogador('jog_ana', 'Ana');
const BETO = jogador('jog_beto', 'Beto');

/** Mesa com dois jogadores, um PNJ oculto pela névoa e um PNJ marcado como oculto. */
function mesa() {
  let c = campanhaVazia('Mesa');
  c = exec(c, { tipo: 'jogador.adicionar', jogador: { id: 'jog_ana', nome: 'Ana' } });
  c = exec(c, { tipo: 'jogador.adicionar', jogador: { id: 'jog_beto', nome: 'Beto' } });
  const fAna = novaFicha({ nome: 'Personagem da Ana', origem: 'esquecido', atributosBase: { fis: 3, des: 3, men: 2, yan: 0 }, donoJogadorId: 'jog_ana', notasPrivadas: 'segredo-da-ana', notasMestre: 'nota-do-mestre-ana' });
  const fBeto = novaFicha({ nome: 'Personagem do Beto', origem: 'normal', atributosBase: { fis: 2, des: 2, men: 2, yan: 2 }, ryBase: 10, donoJogadorId: 'jog_beto', notasPrivadas: 'segredo-do-beto', compartilhamento: 'resumo' });
  const fPnj = novaFicha({ nome: 'Emboscador', tipo: 'pnj', origem: 'luzionne', atributosBase: { fis: 2, des: 2, men: 2, yan: 2 }, ryBase: 22, compartilhamento: 'oculta', notasMestre: 'segredo-do-pnj', notasPrivadas: 'plano-secreto' });
  for (const f of [fAna, fBeto, fPnj]) c = exec(c, { tipo: 'ficha.criar', ficha: f });
  c = exec(c, { tipo: 'arquivo.registrar', meta: { id: 'arq_mapa', nome: 'mapa.png', tipo: 'image/png', tamanho: 10, uso: 'mapa' } });
  c = exec(c, { tipo: 'arquivo.registrar', meta: { id: 'arq_retrato_pnj', nome: 'pnj.png', tipo: 'image/png', tamanho: 10, uso: 'retrato' } });
  const cena = novaCena({ nome: 'Beco', largura: 500, altura: 500, grade: gradePadrao(50), mapa: { tipo: 'arquivo', arquivoId: 'arq_mapa' }, notaMestre: 'nota-da-cena' });
  cena.tokens.push(
    novoToken({ id: 'tok_ana', nome: 'Ana', x: 75, y: 75, fichaId: fAna.id }),
    novoToken({ id: 'tok_beto', nome: 'Beto', x: 125, y: 75, fichaId: fBeto.id }),
    novoToken({ id: 'tok_nevoa', nome: 'Emboscador', x: 425, y: 425, fichaId: fPnj.id, retratoArquivoId: 'arq_retrato_pnj' }),
    novoToken({ id: 'tok_oculto', nome: 'Vigia escondido', x: 225, y: 225, oculto: true }),
  );
  cena.nevoa = ['8,8', '8,7', '7,8', '7,7'];
  cena.desenhos.push(
    { id: 'des_visivel', tipo: 'linha', pontos: [[10, 10], [60, 10]], cor: 'latao', espessura: 3, visivelJogadores: true },
    { id: 'des_mestre', tipo: 'linha', pontos: [[10, 30], [60, 30]], cor: 'vinho', espessura: 3, visivelJogadores: false },
    { id: 'des_nevoa', tipo: 'retangulo', pontos: [[360, 360], [440, 440]], cor: 'vinho', espessura: 3, visivelJogadores: true },
  );
  c = exec(c, { tipo: 'cena.criar', cena });
  const outra = novaCena({ nome: 'Cena futura', notaMestre: 'surpresa' });
  outra.tokens.push(novoToken({ id: 'tok_futuro', nome: 'Chefe futuro', x: 100, y: 100 }));
  c = exec(c, { tipo: 'cena.criar', cena: outra });
  return { c, cenaId: cena.id, fAna, fBeto, fPnj };
}

describe('permissões do jogador', () => {
  it('move o próprio token, mas não o alheio, o oculto ou um inexistente', () => {
    const { c, cenaId } = mesa();
    const movido = exec(c, { tipo: 'token.mover', cenaId, movimentos: [{ tokenId: 'tok_ana', x: 175, y: 175 }] }, ANA);
    expect(movido.cenas[0].tokens[0]).toMatchObject({ x: 175, y: 175 });
    const esperado = /só pode mover os seus próprios tokens/;
    expect(recusa(c, { tipo: 'token.mover', cenaId, movimentos: [{ tokenId: 'tok_beto', x: 10, y: 10 }] }, ANA)).toMatch(esperado);
    // Token oculto, sob névoa ou inexistente: mesma resposta, para não revelar o que existe.
    for (const id of ['tok_oculto', 'tok_nevoa', 'nao_existe']) {
      expect(recusa(c, { tipo: 'token.mover', cenaId, movimentos: [{ tokenId: id, x: 10, y: 10 }] }, ANA)).toMatch(esperado);
    }
    // Um lote com um token alheio é recusado por inteiro.
    expect(recusa(c, { tipo: 'token.mover', cenaId, movimentos: [{ tokenId: 'tok_ana', x: 1, y: 1 }, { tokenId: 'tok_beto', x: 1, y: 1 }] }, ANA)).toMatch(esperado);
    // Fora da cena ativa também não.
    expect(recusa(c, { tipo: 'token.mover', cenaId: c.cenas[1].id, movimentos: [{ tokenId: 'tok_futuro', x: 1, y: 1 }] }, ANA)).toMatch(/cena ativa/);
  });

  it('não consegue se autoconceder o papel de mestre', () => {
    const { c, cenaId, fAna } = mesa();
    // Campos extras de "papel" no comando são ignorados: o papel vem só do contexto autenticado.
    const comPapel = { tipo: 'nevoa.tudo', cenaId, operacao: 'revelar', papel: 'mestre', ator: { papel: 'mestre' }, mestre: true };
    expect(recusa(c, comPapel, ANA)).toMatch(/Apenas o mestre/);
    for (const comando of [
      { tipo: 'cena.ativar', cenaId: c.cenas[1].id },
      { tipo: 'token.atualizar', cenaId, tokenId: 'tok_beto', alteracoes: { donoJogadorId: 'jog_ana' } },
      { tipo: 'token.atualizar', cenaId, tokenId: 'tok_oculto', alteracoes: { oculto: false } },
      { tipo: 'jogador.adicionar', jogador: { id: 'jog_x', nome: 'X' } },
      { tipo: 'compendio.liberar', ids: ['centryn'], liberar: true },
      { tipo: 'combate.iniciar', participantes: [] },
      { tipo: 'pendencia.confirmar', pendenciaId: 'x', opcao: 0, substituicoes: {}, visibilidade: 'publica' },
      { tipo: 'ficha.ajuste', fichaId: fAna.id, alvo: 'pvMax', valor: 99, motivo: 'trapaça' },
      { tipo: 'ficha.aumento', fichaId: fAna.id, nivel: 5, atributo: 'fis' },
      { tipo: 'historico.limpar' },
    ]) {
      expect(recusa(c, comando, ANA), comando.tipo).toMatch(/Apenas o mestre/);
    }
    // Na própria ficha, só campos permitidos: tomar posse de outra ficha ou mudar atributos é recusado.
    expect(recusa(c, { tipo: 'ficha.atualizar', fichaId: fAna.id, alteracoes: { nivel: 20 } }, ANA)).toMatch(/só pode ser alterado pelo mestre/);
    expect(recusa(c, { tipo: 'ficha.atualizar', fichaId: fAna.id, alteracoes: { notasMestre: 'x' } }, ANA)).toMatch(/só pode ser alterado pelo mestre/);
    expect(recusa(c, { tipo: 'ficha.atualizar', fichaId: fAna.id, alteracoes: { donoJogadorId: 'jog_beto' } }, ANA)).toMatch(/só pode ser alterado pelo mestre/);
  });

  it('edita recursos e notas da própria ficha, nunca da ficha alheia', () => {
    const { c, fAna, fBeto } = mesa();
    const r = exec(c, { tipo: 'ficha.recurso', fichaId: fAna.id, recurso: 'pv', modo: 'delta', valor: -3, motivo: '' }, ANA);
    expect(r.fichas[0].pvAtual).toBe(27);
    exec(c, { tipo: 'ficha.atualizar', fichaId: fAna.id, alteracoes: { notasPublicas: 'Olá' } }, ANA);
    expect(recusa(c, { tipo: 'ficha.recurso', fichaId: fBeto.id, recurso: 'pv', modo: 'definir', valor: 0, motivo: '' }, ANA)).toMatch(/sua própria ficha/);
    expect(recusa(c, { tipo: 'teste.atributo', fichaId: fBeto.id, atributo: 'fis', visibilidade: 'publica' }, ANA)).toMatch(/sua própria ficha/);
  });

  it('jogador desconhecido ou sem identificação não executa nada', () => {
    const { c } = mesa();
    expect(recusa(c, { tipo: 'dados.rolar', expressao: '1d20', rotulo: '', visibilidade: 'publica' }, jogador('intruso'))).toMatch(/não reconhecido/);
    expect(recusa(c, { tipo: 'dados.rolar', expressao: '1d20', rotulo: '', visibilidade: 'publica' }, { papel: 'jogador', jogadorId: null, nome: '' })).toMatch(/não reconhecido/);
  });

  it('comando malformado é recusado sem alterar nada', () => {
    const { c } = mesa();
    for (const bruto of [null, 'texto', { tipo: 'inexistente' }, { tipo: 'token.mover' }, { tipo: 'dados.rolar', expressao: 123, rotulo: '', visibilidade: 'publica' }]) {
      const r = executarComando(c, bruto, contexto(MESTRE));
      expect(r.ok).toBe(false);
    }
    expect(recusa(c, { tipo: 'dados.rolar', expressao: '1d20; rm -rf', rotulo: '', visibilidade: 'publica' })).toBeTruthy();
    expect(c.historico).toHaveLength(0);
  });
});

describe('visão do jogador (dados não enviados)', () => {
  const visao = (c: Campanha, ator = ANA) => filtrarVisao(c, ator, { mascararMapa: true });

  it('exemplo 5: token sob névoa, token oculto e segredos não chegam ao jogador', () => {
    const { c } = mesa();
    const v = visao(c);
    const texto = JSON.stringify(v);
    expect(v.cenas).toHaveLength(1);
    expect(v.cenas[0].tokens.map((t) => t.id).sort()).toEqual(['tok_ana', 'tok_beto']);
    for (const segredo of ['tok_nevoa', 'tok_oculto', 'Emboscador', 'Vigia escondido', 'segredo-do-pnj', 'plano-secreto', 'nota-do-mestre-ana',
      'segredo-do-beto', 'nota-da-cena', 'Cena futura', 'Chefe futuro', 'surpresa', 'des_mestre', 'des_nevoa', 'arq_retrato_pnj', '425']) {
      expect(texto, segredo).not.toContain(segredo);
    }
    // A própria nota privada chega; a do mestre, não.
    expect(texto).toContain('segredo-da-ana');
    expect(v.cenas[0].desenhos.map((d) => d.id)).toEqual(['des_visivel']);
  });

  it('fichas: a própria completa, a alheia só em resumo, a oculta ausente', () => {
    const { c, fAna, fBeto, fPnj } = mesa();
    const v = visao(c);
    expect(v.fichas.map((f) => f.id).sort()).toEqual([fAna.id, fBeto.id].sort());
    const beto = v.fichas.find((f) => f.id === fBeto.id)!;
    expect(beto.visaoParcial).toBe(true);
    expect(beto.atributosBase).toEqual({ fis: 0, des: 0, men: 0, yan: 0 });
    expect(beto.ryBase).toBe(0);
    expect(v.fichas.some((f) => f.id === fPnj.id)).toBe(false);
    expect(visao(c, BETO).fichas.find((f) => f.id === fBeto.id)!.notasPrivadas).toBe('segredo-do-beto');
  });

  it('o mapa original nunca é enviado; só a versão preparada que cobre a névoa atual', () => {
    let { c, cenaId } = mesa();
    expect(visao(c).cenas[0].mapa).toEqual({ tipo: 'vazio' });
    expect(arquivoVisivelPara(c, ANA, 'arq_mapa')).toBe(false);
    expect(arquivoVisivelPara(c, MESTRE, 'arq_mapa')).toBe(true);
    c = exec(c, { tipo: 'arquivo.registrar', meta: { id: 'arq_mapa_jog', nome: 'mapa-jogadores.jpg', tipo: 'image/jpeg', tamanho: 10, uso: 'mapa-jogadores' } });
    c = exec(c, { tipo: 'cena.mapaJogadores', cenaId, arquivoId: 'arq_mapa_jog', celulas: ['8,8', '8,7', '7,8', '7,7'] });
    expect(visao(c).cenas[0].mapa).toEqual({ tipo: 'arquivo', arquivoId: 'arq_mapa_jog' });
    expect(arquivoVisivelPara(c, ANA, 'arq_mapa_jog')).toBe(true);
    expect(arquivoVisivelPara(c, ANA, 'arq_mapa')).toBe(false);
    expect(JSON.stringify(visao(c))).not.toContain('"arq_mapa"');
    // Revelar células continua seguro (a imagem preparada mostra menos, não mais).
    const revelada = exec(c, { tipo: 'nevoa.alterar', cenaId, operacao: 'revelar', celulas: ['7,7'] });
    expect(mapaJogadoresCobreNevoa(revelada.cenas[0])).toBe(true);
    // Ocultar uma célula nova invalida a imagem preparada até o mestre reenviar.
    const maisNevoa = exec(c, { tipo: 'nevoa.alterar', cenaId, operacao: 'ocultar', celulas: ['0,9'] });
    expect(visao(maisNevoa).cenas[0].mapa).toEqual({ tipo: 'vazio' });
    expect(arquivoVisivelPara(maisNevoa, ANA, 'arq_mapa_jog')).toBe(false);
  });

  it('combate: participante oculto some da iniciativa e das pendências', () => {
    let { c, fAna, fPnj } = mesa();
    c = exec(c, { tipo: 'combate.iniciar', participantes: [
      { nome: 'Ana', tokenId: 'tok_ana', fichaId: fAna.id },
      { nome: 'Emboscador', tokenId: 'tok_nevoa', fichaId: fPnj.id },
    ] });
    c = exec(c, { tipo: 'combate.rolarIniciativa', participanteIds: null }, MESTRE, [5, 18]);
    c = exec(c, { tipo: 'combate.resolverAtaque', pedido: { atacanteFichaId: fPnj.id, alvoFichaId: fAna.id, atributo: 'des', arma: 'media' } }, MESTRE, [19, 4]);
    const v = visao(c);
    expect(v.combate!.participantes.map((p) => p.nome)).toEqual(['Ana']);
    expect(v.combate!.turno).toBe(1); // o turno é de alguém oculto: ninguém visível fica destacado
    expect(v.pendencias).toHaveLength(0);
    expect(JSON.stringify(v)).not.toContain('Emboscador');
    // Resultado confirmado como "somente mestre" não vai para o histórico do jogador.
    c = exec(c, { tipo: 'pendencia.confirmar', pendenciaId: c.pendencias[0].id, opcao: 0, substituicoes: {}, visibilidade: 'mestre' });
    expect(JSON.stringify(visao(c))).not.toContain('Emboscador');
  });

  it('rolagem privada ao mestre: só o mestre e quem rolou veem', () => {
    let { c } = mesa();
    c = exec(c, { tipo: 'dados.rolar', expressao: '1d20+3', rotulo: 'secreta-da-ana', visibilidade: 'mestre' }, ANA, [14]);
    c = exec(c, { tipo: 'dados.rolar', expressao: '1d6', rotulo: 'secreta-do-mestre', visibilidade: 'mestre' }, MESTRE, [2]);
    c = exec(c, { tipo: 'dados.rolar', expressao: '1d6', rotulo: 'aberta', visibilidade: 'publica' }, BETO, [5]);
    expect(visao(c, ANA).historico.map((h) => h.rotulo)).toEqual(['secreta-da-ana', 'aberta']);
    expect(visao(c, BETO).historico.map((h) => h.rotulo)).toEqual(['aberta']);
    expect(filtrarVisao(c, MESTRE, { mascararMapa: true }).historico).toHaveLength(3);
    expect(c.historico[0].resultado).toMatchObject({ total: 17, modificador: 3 });
  });

  it('a visão do mestre é a campanha inteira', () => {
    const { c } = mesa();
    expect(filtrarVisao(c, MESTRE, { mascararMapa: true })).toBe(c);
  });
});

describe('compêndio', () => {
  it('nada é liberado automaticamente; o mestre libera entrada por entrada', () => {
    let { c } = mesa();
    expect(entradasDoCompendio(c, ANA)).toHaveLength(0);
    expect(entradasDoCompendio(c, MESTRE).length).toBe(ENTRADAS_EMBUTIDAS.length);
    c = exec(c, { tipo: 'compendio.liberar', ids: ['farlands'], liberar: true });
    expect(entradasDoCompendio(c, ANA).map((e) => e.id)).toEqual(['farlands']);
    c = exec(c, { tipo: 'compendio.salvar', entrada: { id: 'segredo-x', titulo: 'Revelação futura', categoria: 'personagem', resumo: '', corpo: ['spoiler'], fonte: 'Mestre', secao: '', versao: '', status: 'canone', visibilidade: 'mestre', aliases: [], aparencia: '', conflitos: [] } });
    expect(JSON.stringify(filtrarVisao(c, ANA, { mascararMapa: true }).compendio)).not.toContain('spoiler');
    c = exec(c, { tipo: 'compendio.liberar', ids: ['segredo-x'], liberar: true });
    expect(entradasDoCompendio(filtrarVisao(c, ANA, { mascararMapa: true }), ANA).map((e) => e.id).sort()).toEqual(['farlands', 'segredo-x']);
  });

  it('distingue cânone, crença, lenda, aprovado, rejeitado e pendente; segredos não estão embutidos', () => {
    const porId = new Map(ENTRADAS_EMBUTIDAS.map((e) => [e.id, e]));
    expect(porId.get('noite-eterna')!.status).toBe('canone');
    expect(porId.get('sangue-de-darion')!.status).toBe('crenca');
    expect(porId.get('coracao-de-galleone')!.status).toBe('lenda');
    expect(porId.get('let-esp-001')!.status).toBe('aprovado');
    expect(porId.get('let-esp-010')!.status).toBe('rejeitado');
    expect(porId.get('let-esp-016')!.status).toBe('pendente');
    expect(porId.get('expurgatio')!.conflitos.length).toBeGreaterThan(0);
    expect(ENTRADAS_EMBUTIDAS.every((e) => e.visibilidade === 'mestre' && e.fonte && e.secao)).toBe(true);
    expect(new Set(ENTRADAS_EMBUTIDAS.map((e) => e.id)).size).toBe(ENTRADAS_EMBUTIDAS.length);
    // Segredos do mestre (dossiês, prólogo, paternidade) não fazem parte do pacote embutido.
    const tudo = JSON.stringify(ENTRADAS_EMBUTIDAS);
    for (const termo of ['Luciel', 'Luna', 'Galandiel', 'Majok', 'Zack', 'Gryphon', 'Desfigurados', 'paternidade', 'pai biológico']) {
      expect(tudo, termo).not.toContain(termo);
    }
  });

  it('busca por título, alias e texto, sem acentos', () => {
    const { c } = mesa();
    const entradas = entradasDoCompendio(c, MESTRE);
    const buscar = (consulta: string) => buscarNoCompendio(entradas, { consulta, categoria: 'todas', status: 'todos' }).map((e) => e.id);
    expect(buscar('oparthyn')[0]).toBe('cla-opartyn');
    expect(buscar('mascara')[0]).toBe('mascara-de-osso');
    expect(buscar('horologium')).toContain('cla-gionatte');
    expect(buscar('zzzz')).toEqual([]);
    expect(buscarNoCompendio(entradas, { consulta: '', categoria: 'bestiario', status: 'todos' })).toHaveLength(4);
    expect(buscarNoCompendio(entradas, { consulta: '', categoria: 'todas', status: 'pendente' }).map((e) => e.id)).toContain('let-esp-016');
  });
});
