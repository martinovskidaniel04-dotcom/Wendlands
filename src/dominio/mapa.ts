/**
 * Geometria da mesa tática.
 *
 * Tudo no mapa vive em coordenadas de mundo (pixels do mapa em resolução nativa).
 * A câmera apenas transforma mundo ↔ tela: zoom e pan nunca alteram posições nem
 * distâncias medidas.
 */
import type { Cena, Desenho, Grade, Token } from './esquema';

export interface Ponto {
  x: number;
  y: number;
}

/** tela = (mundo − câmera) × zoom */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 6;

export function mundoParaTela(p: Ponto, c: Camera): Ponto {
  return { x: (p.x - c.x) * c.zoom, y: (p.y - c.y) * c.zoom };
}

export function telaParaMundo(p: Ponto, c: Camera): Ponto {
  return { x: p.x / c.zoom + c.x, y: p.y / c.zoom + c.y };
}

export function limitarZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** Aplica zoom mantendo fixo o ponto de mundo que está sob `ancoraTela`. */
export function zoomEmTorno(c: Camera, ancoraTela: Ponto, novoZoom: number): Camera {
  const zoom = limitarZoom(novoZoom);
  const mundo = telaParaMundo(ancoraTela, c);
  return { zoom, x: mundo.x - ancoraTela.x / zoom, y: mundo.y - ancoraTela.y / zoom };
}

export function ajustarATela(
  larguraMundo: number,
  alturaMundo: number,
  larguraTela: number,
  alturaTela: number,
  margem = 24,
): Camera {
  const lt = Math.max(1, larguraTela - margem * 2);
  const at = Math.max(1, alturaTela - margem * 2);
  const zoom = limitarZoom(Math.min(lt / larguraMundo, at / alturaMundo));
  return {
    zoom,
    x: -(larguraTela / zoom - larguraMundo) / 2,
    y: -(alturaTela / zoom - alturaMundo) / 2,
  };
}

// ───────────────────────── Grade ─────────────────────────

export function celulaDe(p: Ponto, g: Grade): [number, number] {
  return [Math.floor((p.x - g.origemX) / g.tamanhoCelula), Math.floor((p.y - g.origemY) / g.tamanhoCelula)];
}

export function chaveCelula(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function lerChave(chave: string): [number, number] {
  const [a, b] = chave.split(',');
  return [Number(a), Number(b)];
}

export function cantoCelula(cx: number, cy: number, g: Grade): Ponto {
  return { x: g.origemX + cx * g.tamanhoCelula, y: g.origemY + cy * g.tamanhoCelula };
}

export function centroCelula(cx: number, cy: number, g: Grade): Ponto {
  return { x: g.origemX + (cx + 0.5) * g.tamanhoCelula, y: g.origemY + (cy + 0.5) * g.tamanhoCelula };
}

/**
 * Encaixa o centro de um token na grade. Tokens de tamanho ímpar (1, 3…) centram
 * numa célula; os de tamanho par (2, 4…) centram num cruzamento.
 */
export function encaixarNaGrade(p: Ponto, g: Grade, tamanhoEmCelulas = 1): Ponto {
  const par = Math.round(tamanhoEmCelulas) % 2 === 0;
  const t = g.tamanhoCelula;
  if (par) {
    return {
      x: g.origemX + Math.round((p.x - g.origemX) / t) * t,
      y: g.origemY + Math.round((p.y - g.origemY) / t) * t,
    };
  }
  const [cx, cy] = celulaDe(p, g);
  return centroCelula(cx, cy, g);
}

export function limitarAoMapa(p: Ponto, cena: Pick<Cena, 'largura' | 'altura'>): Ponto {
  return { x: Math.min(cena.largura, Math.max(0, p.x)), y: Math.min(cena.altura, Math.max(0, p.y)) };
}

// ───────────────────────── Medição ─────────────────────────

/**
 * Distância em metros entre dois pontos de mundo, segundo a calibração da cena.
 * "euclidiana" é geometria pura; os demais modos são convenções opcionais da mesa
 * (não há regra de diagonais aprovada em Wendlands).
 */
export function distanciaMetros(a: Ponto, b: Ponto, g: Grade): number {
  if (g.medicao === 'euclidiana') {
    return (Math.hypot(b.x - a.x, b.y - a.y) / g.tamanhoCelula) * g.metrosPorCelula;
  }
  const [ax, ay] = celulaDe(a, g);
  const [bx, by] = celulaDe(b, g);
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const celulas = g.medicao === 'diagonal-1' ? Math.max(dx, dy) : dx + dy;
  return celulas * g.metrosPorCelula;
}

export function formatarMetros(m: number): string {
  const arredondado = Math.round(m * 10) / 10;
  return `${Number.isInteger(arredondado) ? arredondado : arredondado.toFixed(1).replace('.', ',')} m`;
}

export function metrosParaMundo(metros: number, g: Grade): number {
  return (metros / g.metrosPorCelula) * g.tamanhoCelula;
}

// ───────────────────────── Névoa ─────────────────────────

/** Células cobertas pelo retângulo definido por dois pontos de mundo. */
export function celulasNoRetangulo(a: Ponto, b: Ponto, cena: Pick<Cena, 'grade' | 'largura' | 'altura'>): string[] {
  const g = cena.grade;
  const [ax, ay] = celulaDe({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, g);
  const [bx, by] = celulaDe({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }, g);
  const [minX, minY, maxX, maxY] = limitesCelulas(cena);
  const chaves: string[] = [];
  for (let cy = Math.max(ay, minY); cy <= Math.min(by, maxY); cy++) {
    for (let cx = Math.max(ax, minX); cx <= Math.min(bx, maxX); cx++) chaves.push(chaveCelula(cx, cy));
  }
  return chaves;
}

/** Faixa de células que cobre todo o mapa: [minX, minY, maxX, maxY]. */
export function limitesCelulas(cena: Pick<Cena, 'grade' | 'largura' | 'altura'>): [number, number, number, number] {
  const g = cena.grade;
  const [minX, minY] = celulaDe({ x: 0, y: 0 }, g);
  const [maxX, maxY] = celulaDe({ x: cena.largura - 0.001, y: cena.altura - 0.001 }, g);
  return [minX, minY, maxX, maxY];
}

export function todasAsCelulas(cena: Pick<Cena, 'grade' | 'largura' | 'altura'>): string[] {
  const [minX, minY, maxX, maxY] = limitesCelulas(cena);
  const chaves: string[] = [];
  for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) chaves.push(chaveCelula(cx, cy));
  return chaves;
}

export function pontoSobNevoa(p: Ponto, cena: Pick<Cena, 'grade'>, nevoa: ReadonlySet<string>): boolean {
  const [cx, cy] = celulaDe(p, cena.grade);
  return nevoa.has(chaveCelula(cx, cy));
}

/** Um token está sob névoa quando o centro ou qualquer célula que ele ocupa está oculta. */
export function tokenSobNevoa(token: Token, cena: Pick<Cena, 'grade'>, nevoa: ReadonlySet<string>): boolean {
  if (nevoa.size === 0) return false;
  const raio = (token.tamanho * cena.grade.tamanhoCelula) / 2;
  const folga = Math.max(0, raio - 0.01);
  const [ax, ay] = celulaDe({ x: token.x - folga, y: token.y - folga }, cena.grade);
  const [bx, by] = celulaDe({ x: token.x + folga, y: token.y + folga }, cena.grade);
  for (let cy = ay; cy <= by; cy++) for (let cx = ax; cx <= bx; cx++) if (nevoa.has(chaveCelula(cx, cy))) return true;
  return false;
}

export function desenhoSobNevoa(d: Desenho, cena: Pick<Cena, 'grade'>, nevoa: ReadonlySet<string>): boolean {
  if (nevoa.size === 0) return false;
  const xs = d.pontos.map((p) => p[0]);
  const ys = d.pontos.map((p) => p[1]);
  const [ax, ay] = celulaDe({ x: Math.min(...xs), y: Math.min(...ys) }, cena.grade);
  const [bx, by] = celulaDe({ x: Math.max(...xs), y: Math.max(...ys) }, cena.grade);
  for (let cy = ay; cy <= by; cy++) for (let cx = ax; cx <= bx; cx++) if (nevoa.has(chaveCelula(cx, cy))) return true;
  return false;
}

/**
 * Converte a névoa quando a grade muda: uma célula nova fica oculta se o seu
 * centro caía numa célula oculta da grade antiga.
 */
export function reamostrarNevoa(
  nevoa: string[],
  antiga: Grade,
  nova: Grade,
  cena: Pick<Cena, 'largura' | 'altura'>,
): string[] {
  if (nevoa.length === 0) return [];
  const conjunto = new Set(nevoa);
  const resultado: string[] = [];
  const [minX, minY, maxX, maxY] = limitesCelulas({ grade: nova, largura: cena.largura, altura: cena.altura });
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const centro = centroCelula(cx, cy, nova);
      const [ox, oy] = celulaDe(centro, antiga);
      if (conjunto.has(chaveCelula(ox, oy))) resultado.push(chaveCelula(cx, cy));
    }
  }
  return resultado;
}

/** Agrupa células ocultas em faixas horizontais, para desenhar a névoa com poucos retângulos. */
export function faixasDeNevoa(nevoa: Iterable<string>): Array<{ cx: number; cy: number; largura: number }> {
  const porLinha = new Map<number, number[]>();
  for (const chave of nevoa) {
    const [cx, cy] = lerChave(chave);
    const linha = porLinha.get(cy);
    if (linha) linha.push(cx);
    else porLinha.set(cy, [cx]);
  }
  const faixas: Array<{ cx: number; cy: number; largura: number }> = [];
  for (const [cy, colunas] of porLinha) {
    colunas.sort((a, b) => a - b);
    let inicio = colunas[0];
    let anterior = colunas[0];
    for (let i = 1; i <= colunas.length; i++) {
      const atual = colunas[i];
      if (atual === anterior + 1) {
        anterior = atual;
        continue;
      }
      faixas.push({ cx: inicio, cy, largura: anterior - inicio + 1 });
      inicio = atual;
      anterior = atual;
    }
  }
  return faixas;
}

/** Retângulo normalizado a partir de dois cantos. */
export function retangulo(a: Ponto, b: Ponto) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), largura: Math.abs(b.x - a.x), altura: Math.abs(b.y - a.y) };
}
