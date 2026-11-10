import { describe, expect, it } from 'vitest';
import { gradePadrao, novaCena, novoToken } from '../src/dominio/fabrica';
import {
  ajustarATela, celulasNoRetangulo, distanciaMetros, encaixarNaGrade, faixasDeNevoa, mundoParaTela,
  reamostrarNevoa, telaParaMundo, tokenSobNevoa, zoomEmTorno, type Camera,
} from '../src/dominio/mapa';

describe('câmera', () => {
  it('pan e zoom preservam as coordenadas de mundo', () => {
    const p = { x: 812.5, y: 344.25 };
    for (const c of [{ x: 0, y: 0, zoom: 1 }, { x: -300, y: 120, zoom: 0.35 }, { x: 950, y: -40, zoom: 3.2 }] as Camera[]) {
      const volta = telaParaMundo(mundoParaTela(p, c), c);
      expect(volta.x).toBeCloseTo(p.x, 9);
      expect(volta.y).toBeCloseTo(p.y, 9);
    }
  });

  it('zoom em torno de um ponto mantém esse ponto fixo na tela', () => {
    const c: Camera = { x: 100, y: 50, zoom: 1 };
    const ancora = { x: 400, y: 300 };
    const mundoAntes = telaParaMundo(ancora, c);
    const d = zoomEmTorno(c, ancora, 2.5);
    const mundoDepois = telaParaMundo(ancora, d);
    expect(mundoDepois.x).toBeCloseTo(mundoAntes.x, 9);
    expect(mundoDepois.y).toBeCloseTo(mundoAntes.y, 9);
    expect(zoomEmTorno(c, ancora, 999).zoom).toBe(6);
  });

  it('ajuste à tela centraliza o mapa inteiro', () => {
    const c = ajustarATela(2000, 1000, 1000, 800, 0);
    expect(c.zoom).toBeCloseTo(0.5);
    const canto = mundoParaTela({ x: 2000, y: 1000 }, c);
    expect(canto.x).toBeCloseTo(1000);
    expect(canto.y).toBeCloseTo(650);
  });
});

describe('medição calibrada', () => {
  const grade = { ...gradePadrao(50), metrosPorCelula: 1.5 };
  it('linha reta em metros não depende do zoom', () => {
    expect(distanciaMetros({ x: 0, y: 0 }, { x: 200, y: 0 }, grade)).toBeCloseTo(6);
    expect(distanciaMetros({ x: 0, y: 0 }, { x: 150, y: 200 }, grade)).toBeCloseTo(7.5);
    expect(distanciaMetros({ x: 0, y: 0 }, { x: 200, y: 0 }, { ...grade, metrosPorCelula: 2 })).toBeCloseTo(8);
    expect(distanciaMetros({ x: 0, y: 0 }, { x: 200, y: 0 }, { ...grade, tamanhoCelula: 100 })).toBeCloseTo(3);
  });
  it('convenções por célula são opcionais e explícitas', () => {
    const a = { x: 25, y: 25 };
    const b = { x: 175, y: 125 };
    expect(distanciaMetros(a, b, { ...grade, medicao: 'diagonal-1' })).toBeCloseTo(4.5);
    expect(distanciaMetros(a, b, { ...grade, medicao: 'sem-diagonal' })).toBeCloseTo(7.5);
  });
  it('encaixe na grade respeita a origem e o tamanho do token', () => {
    const g = { ...gradePadrao(50), origemX: 10, origemY: 20 };
    expect(encaixarNaGrade({ x: 71, y: 33 }, g, 1)).toEqual({ x: 85, y: 45 });
    expect(encaixarNaGrade({ x: 71, y: 33 }, g, 2)).toEqual({ x: 60, y: 20 });
  });
});

describe('névoa', () => {
  const cena = novaCena({ nome: 'Teste', largura: 500, altura: 300, grade: gradePadrao(50) });
  it('seleciona células por retângulo dentro do mapa', () => {
    const celulas = celulasNoRetangulo({ x: 60, y: 60 }, { x: 160, y: 110 }, cena);
    expect(celulas.sort()).toEqual(['1,1', '1,2', '2,1', '2,2', '3,1', '3,2']);
    expect(celulasNoRetangulo({ x: -500, y: -500 }, { x: 9999, y: 9999 }, cena)).toHaveLength(60);
  });
  it('token sob névoa: qualquer célula ocupada', () => {
    const nevoa = new Set(['2,2']);
    expect(tokenSobNevoa(novoToken({ nome: 'A', x: 125, y: 125 }), cena, nevoa)).toBe(true);
    expect(tokenSobNevoa(novoToken({ nome: 'B', x: 75, y: 125 }), cena, nevoa)).toBe(false);
    expect(tokenSobNevoa(novoToken({ nome: 'C', x: 100, y: 100, tamanho: 2 }), cena, nevoa)).toBe(true);
  });
  it('reamostra ao recalibrar a grade e agrupa em faixas', () => {
    const nova = reamostrarNevoa(['0,0', '1,0'], gradePadrao(50), gradePadrao(25), cena);
    expect(nova.sort()).toEqual(['0,0', '0,1', '1,0', '1,1', '2,0', '2,1', '3,0', '3,1']);
    expect(faixasDeNevoa(['0,0', '1,0', '2,0', '5,0', '0,1'])).toEqual([
      { cx: 0, cy: 0, largura: 3 }, { cx: 5, cy: 0, largura: 1 }, { cx: 0, cy: 1, largura: 1 },
    ]);
  });
});
