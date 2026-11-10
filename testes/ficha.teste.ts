import { describe, expect, it } from 'vitest';
import { campanhaVazia, novaFicha, novoItem } from '../src/dominio/fabrica';
import { derivar, pvMaximoCalculado, validarCriacao, verificarGrauYant, vigMaximaCalculada } from '../src/dominio/regras/ficha';
import { descreverSorteio, faixaDoD20, sortearRy, sortearSubgrupo } from '../src/dominio/regras/origem';
import { criarFonteDeFaces } from '../src/dominio/dados';
import { exec, recusa } from './apoio';

describe('fórmulas de ficha', () => {
  it('exemplo 1: Esquecido nível 1, FIS3 DES3 MEN2 YAN0 → 30 PV, 16 VIG, RY 0', () => {
    const f = novaFicha({ nome: 'Exemplo', origem: 'esquecido', atributosBase: { fis: 3, des: 3, men: 2, yan: 0 } });
    const d = derivar(f);
    expect(d.pvMax.total).toBe(30);
    expect(d.vigMax.total).toBe(16);
    expect(d.ryMax.total).toBe(0);
    expect(f.pvAtual).toBe(30);
    expect(f.vigAtual).toBe(16);
    expect(f.ryAtual).toBe(0);
    // RY 0 permanente: a penalidade está pendente e não é aplicada por suposição.
    expect(d.penalidadeRyZero).toBe('pendente');
    expect(d.atributosTeste.men).toBe(2);
    expect(d.grauYantMaximo).toBe(0);
    expect(d.reducao.total).toBe(3);
  });

  it('PV por origem e nível', () => {
    expect(pvMaximoCalculado('normal', 2, 1)).toBe(24);
    expect(pvMaximoCalculado('normal', 2, 5)).toBe(40);
    expect(pvMaximoCalculado('luzionne', 1, 3)).toBe(26);
    expect(pvMaximoCalculado('esquecido', 4, 10)).toBe(77);
    expect(vigMaximaCalculada(4)).toBe(18);
  });

  it('valida a distribuição de criação', () => {
    expect(validarCriacao('normal', { fis: 2, des: 2, men: 2, yan: 2 })).toEqual([]);
    expect(validarCriacao('normal', { fis: 5, des: 1, men: 1, yan: 1 }).length).toBeGreaterThan(0);
    expect(validarCriacao('normal', { fis: 2, des: 2, men: 2, yan: 1 }).length).toBeGreaterThan(0);
    expect(validarCriacao('esquecido', { fis: 3, des: 2, men: 2, yan: 1 })).toContain('Esquecidos mantêm YAN 0.');
  });

  it('defesa com teto de equipamento +4 e redução de Esquecido até 6', () => {
    const f = novaFicha({
      nome: 'Blindado', origem: 'esquecido', atributosBase: { fis: 4, des: 2, men: 2, yan: 0 },
      equipamento: [
        novoItem({ nome: 'Armadura pesada', tipo: 'armadura', categoria: 'pesada', equipado: true }),
        novoItem({ nome: 'Escudo', tipo: 'escudo', equipado: true }),
        novoItem({ nome: 'Armadura reserva', tipo: 'armadura', categoria: 'leve', equipado: false }),
      ],
    });
    const d = derivar(f);
    expect(d.defesa.equipamentoBruto).toBe(4);
    expect(d.defesa.total).toBe(10 + 2 + 4);
    expect(d.reducao.total).toBe(6);
    expect(d.carga.total).toBe(16 + 16);
    const n = novaFicha({ nome: 'Normal', origem: 'normal', atributosBase: { fis: 1, des: 3, men: 2, yan: 2 }, ryBase: 10,
      equipamento: [novoItem({ nome: 'Armadura média', tipo: 'armadura', categoria: 'media', equipado: true })] });
    const dn = derivar(n);
    expect(dn.defesa.total).toBe(15);
    expect(dn.reducao.total).toBe(2);
    expect(dn.carga.total).toBe(10);
  });

  it('RY 0 aplica −2 em MEN e YAN para quem tem reserva', () => {
    const f = novaFicha({ nome: 'Exausto', origem: 'normal', atributosBase: { fis: 2, des: 2, men: 2, yan: 2 }, ryBase: 10, ryAtual: 0 });
    const d = derivar(f);
    expect(d.penalidadeRyZero).toBe('ativa');
    expect(d.atributosTeste.men).toBe(0);
    expect(d.atributosTeste.yan).toBe(0);
    expect(d.atributos.men).toBe(2);
  });

  it('graus de Yant: custo fixo, nível e limite de Normais', () => {
    const f = novaFicha({ nome: 'Conjurador', origem: 'normal', nivel: 15, atributosBase: { fis: 1, des: 1, men: 3, yan: 3 }, ryBase: 11 });
    expect(derivar(f).grauYantMaximo).toBe(3);
    expect(verificarGrauYant(f, 4).ok).toBe(false);
    expect(verificarGrauYant(f, 3)).toEqual({ ok: true, custo: 7 });
    const l = novaFicha({ nome: 'Nobre', origem: 'luzionne', nivel: 15, atributosBase: { fis: 1, des: 1, men: 3, yan: 3 }, ryBase: 24 });
    expect(verificarGrauYant(l, 4)).toEqual({ ok: true, custo: 12 });
    const baixo = novaFicha({ nome: 'Novato', origem: 'normal', nivel: 4, atributosBase: { fis: 2, des: 2, men: 2, yan: 2 }, ryBase: 12 });
    expect(verificarGrauYant(baixo, 2).ok).toBe(false);
  });
});

describe('comandos de ficha', () => {
  const base = () => {
    const c = campanhaVazia('Teste');
    const f = novaFicha({ nome: 'Herói', origem: 'esquecido', nivel: 10, atributosBase: { fis: 3, des: 3, men: 2, yan: 0 } });
    return { c: exec(c, { tipo: 'ficha.criar', ficha: f }), id: f.id };
  };

  it('recursos respeitam limites e registram a alteração', () => {
    let { c, id } = base();
    c = exec(c, { tipo: 'ficha.recurso', fichaId: id, recurso: 'pv', modo: 'delta', valor: -12, motivo: 'Queda' });
    let f = c.fichas[0];
    expect(f.pvAtual).toBe(derivar(f).pvMax.total - 12);
    expect(f.registro.at(-1)).toMatchObject({ campo: 'PV', motivo: 'Queda' });
    c = exec(c, { tipo: 'ficha.recurso', fichaId: id, recurso: 'pv', modo: 'delta', valor: 9999, motivo: '' });
    f = c.fichas[0];
    expect(f.pvAtual).toBe(derivar(f).pvMax.total);
    c = exec(c, { tipo: 'ficha.recurso', fichaId: id, recurso: 'vig', modo: 'definir', valor: -5, motivo: '' });
    expect(c.fichas[0].vigAtual).toBe(0);
    c = exec(c, { tipo: 'ficha.recurso', fichaId: id, recurso: 'pv', modo: 'definir', valor: 0, motivo: '' });
    expect(c.fichas[0].condicao.estado).toBe('incapacitado');
  });

  it('+1 permanente em FIS soma +2 a PV e VIG máximos e atuais uma única vez', () => {
    let { c, id } = base();
    c = exec(c, { tipo: 'ficha.recurso', fichaId: id, recurso: 'pv', modo: 'delta', valor: -10, motivo: '' });
    c = exec(c, { tipo: 'ficha.recurso', fichaId: id, recurso: 'vig', modo: 'delta', valor: -4, motivo: '' });
    const antes = c.fichas[0];
    const dAntes = derivar(antes);
    c = exec(c, { tipo: 'ficha.aumento', fichaId: id, nivel: 5, atributo: 'fis' });
    const depois = c.fichas[0];
    const dDepois = derivar(depois);
    expect(dDepois.pvMax.total).toBe(dAntes.pvMax.total + 2);
    expect(dDepois.vigMax.total).toBe(dAntes.vigMax.total + 2);
    expect(depois.pvAtual).toBe(antes.pvAtual + 2);
    expect(depois.vigAtual).toBe(antes.vigAtual + 2);
    // O mesmo marco de nível não pode ser aplicado duas vezes.
    expect(recusa(c, { tipo: 'ficha.aumento', fichaId: id, nivel: 5, atributo: 'fis' })).toMatch(/já foi registrado/);
    expect(c.fichas[0].pvAtual).toBe(antes.pvAtual + 2);
    // Nível ainda não alcançado e YAN de Esquecido são recusados.
    expect(recusa(c, { tipo: 'ficha.aumento', fichaId: id, nivel: 15, atributo: 'des' })).toMatch(/nível 15/);
    expect(recusa(c, { tipo: 'ficha.aumento', fichaId: id, nivel: 10, atributo: 'yan' })).toMatch(/YAN 0/);
  });

  it('teto de +6 nos atributos', () => {
    let c = campanhaVazia('Teste');
    const f = novaFicha({ nome: 'Forte', origem: 'normal', nivel: 20, atributosBase: { fis: 4, des: 2, men: 1, yan: 1 }, ryBase: 9 });
    c = exec(c, { tipo: 'ficha.criar', ficha: f });
    c = exec(c, { tipo: 'ficha.aumento', fichaId: f.id, nivel: 5, atributo: 'fis' });
    c = exec(c, { tipo: 'ficha.aumento', fichaId: f.id, nivel: 10, atributo: 'fis' });
    expect(recusa(c, { tipo: 'ficha.aumento', fichaId: f.id, nivel: 15, atributo: 'fis' })).toMatch(/teto/);
  });

  it('mudar o clã para Gionatte não concede poder nem altera a ficha (exemplo 4)', () => {
    let { c, id } = base();
    const antes = c.fichas[0];
    c = exec(c, { tipo: 'ficha.atualizar', fichaId: id, alteracoes: { cla: 'gionatte' } });
    const depois = c.fichas[0];
    expect(depois.cla).toBe('gionatte');
    expect(depois.tecnicas).toEqual(antes.tecnicas);
    expect(derivar(depois).ryMax.total).toBe(0);
  });

  it('Esquecido não recebe Yant por edição, técnica ou sorteio', () => {
    let { c, id } = base();
    c = exec(c, { tipo: 'ficha.atualizar', fichaId: id, alteracoes: { atributosBase: { fis: 3, des: 3, men: 2, yan: 3 } } });
    expect(c.fichas[0].atributosBase.yan).toBe(0);
    expect(recusa(c, { tipo: 'ficha.ry', fichaId: id, modo: 'sortear' })).toMatch(/Esquecidos/);
    expect(recusa(c, { tipo: 'ficha.tecnica', fichaId: id, tecnica: { id: 'x1', nome: 'Seta', tipo: 'yant', grau: 1, categoria: null, refCatalogo: null, notas: '' } })).toMatch(/Esquecidos/);
    expect(recusa(c, { tipo: 'ficha.conjurar', fichaId: id, grau: 1, nome: '' })).toMatch(/Esquecidos/);
  });

  it('conjurar cobra o custo fixo do grau, sem desconto', () => {
    let c = campanhaVazia('Teste');
    const f = novaFicha({ nome: 'Conjurador', origem: 'luzionne', nivel: 20, atributosBase: { fis: 1, des: 1, men: 3, yan: 3 }, ryBase: 24 });
    c = exec(c, { tipo: 'ficha.criar', ficha: f });
    c = exec(c, { tipo: 'ficha.conjurar', fichaId: f.id, grau: 4, nome: 'Teste' });
    expect(c.fichas[0].ryAtual).toBe(12);
    c = exec(c, { tipo: 'ficha.conjurar', fichaId: f.id, grau: 3, nome: '' });
    expect(c.fichas[0].ryAtual).toBe(5);
    expect(recusa(c, { tipo: 'ficha.conjurar', fichaId: f.id, grau: 3, nome: '' })).toMatch(/insuficiente/);
  });

  it('descansos seguem a regra aprovada', () => {
    let c = campanhaVazia('Teste');
    const f = novaFicha({ nome: 'Cansado', origem: 'normal', atributosBase: { fis: 2, des: 2, men: 2, yan: 2 }, ryBase: 12, pvAtual: 3, vigAtual: 1, ryAtual: 0 });
    c = exec(c, { tipo: 'ficha.criar', ficha: f });
    c = exec(c, { tipo: 'ficha.descanso', fichaIds: [f.id], descanso: 'vig-10min' });
    expect(c.fichas[0]).toMatchObject({ pvAtual: 3, vigAtual: 14, ryAtual: 0 });
    c = exec(c, { tipo: 'ficha.descanso', fichaIds: [f.id], descanso: 'ry-30min' });
    expect(c.fichas[0].ryAtual).toBe(12);
    c = exec(c, { tipo: 'ficha.descanso', fichaIds: [f.id], descanso: '1h' });
    expect(c.fichas[0].pvAtual).toBe(3 + 12);
    c = exec(c, { tipo: 'ficha.descanso', fichaIds: [f.id], descanso: '8h' });
    expect(c.fichas[0].pvAtual).toBe(24);
  });

  it('ajustes manuais ficam separados do valor calculado', () => {
    let { c, id } = base();
    c = exec(c, { tipo: 'ficha.ajuste', fichaId: id, alvo: 'pvMax', valor: 5, motivo: 'Decisão da mesa' });
    const d = derivar(c.fichas[0]);
    expect(d.pvMax.ajuste).toBe(5);
    expect(d.pvMax.total).toBe(d.pvMax.calculado + 5);
    expect(recusa(c, { tipo: 'ficha.ajuste', fichaId: id, alvo: 'pvMax', valor: 5, motivo: '' })).toMatch(/inválido/);
  });
});

describe('origem e reserva de Yant', () => {
  it('faixas do d20 e sorteio transparente', () => {
    expect(faixaDoD20(14)).toBe('normal');
    expect(faixaDoD20(15)).toBe('luzionne-ou-esquecido');
    const segunda = sortearSubgrupo('luzionne-ou-esquecido', { inteiro: () => 1 });
    expect(segunda).toMatchObject({ origem: 'esquecido', metodo: 'sorteio', dado: 2 });
    expect(descreverSorteio({ d20: 17, faixa: 'luzionne-ou-esquecido' }, segunda)).toContain('d20 = 17');
    expect(sortearSubgrupo('normal', { inteiro: () => 1 })).toMatchObject({ origem: 'normal', faccao: 'Sangue de Darion' });
  });

  it('RY: Normal 8+1d6, Luzionne o dobro, Esquecido 0', () => {
    expect(sortearRy('normal', criarFonteDeFaces([4])).valor).toBe(12);
    expect(sortearRy('luzionne', criarFonteDeFaces([4])).valor).toBe(24);
    expect(sortearRy('esquecido', criarFonteDeFaces([])).valor).toBe(0);
  });
});
