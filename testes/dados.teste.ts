import { describe, expect, it } from 'vitest';
import { analisarExpressao, criarFonteCripto, criarFonteDeFaces, descreverRolagem, rolar, rolarD20 } from '../src/dominio/dados';

const analisar = (s: string) => {
  const r = analisarExpressao(s);
  if (!r.ok) throw new Error(r.erro);
  return r.expressao;
};

describe('expressões de dados', () => {
  it('analisa expressões limitadas', () => {
    expect(analisar('1d20+3').texto).toBe('1d20 + 3');
    expect(analisar(' 2D6 + 2 ').texto).toBe('2d6 + 2');
    expect(analisar('d20').termos).toEqual([{ tipo: 'dado', sinal: 1, quantidade: 1, lados: 20 }]);
    expect(analisar('1d100-5+1d4').termos).toHaveLength(3);
  });

  it('rejeita código, dados fora da lista e excesso', () => {
    for (const ruim of ['', 'alert(1)', '1d20;process.exit()', '2*3', '1d7', '0d6', '1d', 'd', '1d20+', '++1', '1 2', '51d6', '(1d6)', '1d6+constructor', '99999', '1e3']) {
      const r = analisarExpressao(ruim);
      expect(r.ok, ruim).toBe(false);
    }
    expect(analisarExpressao('50d6+50d6+1d6').ok).toBe(false);
    expect(analisarExpressao('1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4').ok).toBe(false);
  });

  it('mostra dados individuais, modificador e total', () => {
    const r = rolar(analisar('2d6+2'), criarFonteDeFaces([3, 5]));
    expect(r.termos[0].dados).toEqual([3, 5]);
    expect(r.modificador).toBe(2);
    expect(r.total).toBe(10);
    expect(descreverRolagem(r)).toBe('(3 + 5) + 2 = 10');
    const s = rolar(analisar('1d20-1'), criarFonteDeFaces([14]));
    expect(s.total).toBe(13);
    expect(descreverRolagem(s)).toBe('14 - 1 = 13');
  });

  it('d20 com dois dados fica com o maior e registra o descartado', () => {
    const r = rolarD20(3, criarFonteDeFaces([4, 17]), true);
    expect(r.natural).toBe(17);
    expect(r.termos[0].descartados).toEqual([4]);
    expect(r.total).toBe(20);
  });

  it('a fonte criptográfica respeita a faixa de cada dado', () => {
    const fonte = criarFonteCripto();
    const vistos = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = fonte.inteiro(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      vistos.add(v);
    }
    expect(vistos.size).toBe(6);
  });
});
