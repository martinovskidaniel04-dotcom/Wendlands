/**
 * Mapas de demonstração, desenhados por código (SVG).
 *
 * São propostas visuais para experimentar a mesa: a geometria não é canônica e
 * não define a localização oficial de nenhum lugar de Wendlands.
 */
import type { MapaDemoId } from '../../dominio/esquema';
import { DIMENSOES_DEMO } from '../../dominio/fabrica';

/** Gerador pseudoaleatório determinístico (os mapas saem sempre iguais). */
function semente(valor: number) {
  let a = valor >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v: number) => (Math.round(v * 10) / 10).toString();

function luzes(pontos: Array<[number, number, 'quente' | 'fria']>, raio: number): string {
  return pontos
    .map(([x, y, tom]) => {
      const cor = tom === 'quente' ? '#ffd9a0' : '#cfeaf2';
      return `<circle cx="${n(x)}" cy="${n(y)}" r="${raio}" fill="url(#luz-${tom})"/><circle cx="${n(x)}" cy="${n(y)}" r="9" fill="#17191c" stroke="#6b5a3c" stroke-width="2"/><circle cx="${n(x)}" cy="${n(y)}" r="4.500" fill="${cor}"/>`;
    })
    .join('');
}

const DEFS_LUZ = `
<radialGradient id="luz-quente"><stop offset="0" stop-color="#f2b566" stop-opacity=".5"/><stop offset=".45" stop-color="#d9903f" stop-opacity=".18"/><stop offset="1" stop-color="#d9903f" stop-opacity="0"/></radialGradient>
<radialGradient id="luz-fria"><stop offset="0" stop-color="#a8d4e2" stop-opacity=".34"/><stop offset=".5" stop-color="#7fb0c2" stop-opacity=".12"/><stop offset="1" stop-color="#7fb0c2" stop-opacity="0"/></radialGradient>`;

function wenorBaixa(): string {
  const { largura: L, altura: A } = DIMENSOES_DEMO['wenor-baixa'];
  const C = 64;
  const r = semente(20261110);
  const partes: string[] = [];

  // Pavimento de pedra irregular.
  let pedras = '';
  const passo = 32;
  for (let y = 0; y < 128; y += passo) {
    for (let x = 0; x < 128; x += passo) {
      const dx = (y / passo) % 2 === 0 ? 0 : passo / 2;
      const tons = ['#2c3035', '#30343a', '#292d32', '#33373d', '#2e3238'];
      pedras += `<rect x="${n(((x + dx) % 128) + 1.500)}" y="${n(y + 1.500)}" width="${passo - 3}" height="${passo - 3}" rx="3" fill="${tons[Math.floor(r() * tons.length)]}"/>`;
    }
  }
  const defs = `<defs>
<pattern id="pedra" width="128" height="128" patternUnits="userSpaceOnUse"><rect width="128" height="128" fill="#1d2024"/>${pedras}</pattern>
<pattern id="telha-a" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#3a444d"/><rect width="5" height="14" fill="#434e58"/><rect x="12" width="2" height="14" fill="#2a323a"/></pattern>
<pattern id="telha-b" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#56382f"/><rect width="5" height="14" fill="#644236"/><rect x="12" width="2" height="14" fill="#3e2822"/></pattern>
<pattern id="telha-c" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(90)"><rect width="14" height="14" fill="#34413f"/><rect width="5" height="14" fill="#3d4b49"/><rect x="12" width="2" height="14" fill="#26302f"/></pattern>
<pattern id="passarela" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#3b3f44"/><path d="M0 0l12 12M12 0 0 12" stroke="#23262a" stroke-width="1.500"/></pattern>
<pattern id="toldo" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#6b4034"/><rect width="9" height="18" fill="#7a5a48"/></pattern>
${DEFS_LUZ}</defs>`;

  partes.push(`<rect width="${L}" height="${A}" fill="url(#pedra)"/>`);
  // Manchas de desgaste e poças discretas.
  for (let i = 0; i < 26; i++) {
    partes.push(`<ellipse cx="${n(r() * L)}" cy="${n(r() * A)}" rx="${n(60 + r() * 150)}" ry="${n(40 + r() * 100)}" fill="#0f1114" opacity="${n(0.1 + r() * 0.14)}"/>`);
  }
  const pocas: Array<[number, number, number, number]> = [[9.4, 11.8, 46, 24], [16.2, 9.1, 38, 20], [6.8, 14.2, 30, 16], [19.2, 13.4, 34, 18], [13.4, 15.9, 44, 18]];
  for (const [cx, cy, rx, ry] of pocas) {
    partes.push(`<ellipse cx="${n(cx * C)}" cy="${n(cy * C)}" rx="${rx}" ry="${ry}" fill="#171d22" opacity=".85"/><ellipse cx="${n(cx * C - 6)}" cy="${n(cy * C - 4)}" rx="${n(rx * 0.5)}" ry="${n(ry * 0.35)}" fill="#3a4a54" opacity=".25"/>`);
  }
  // Ralo central do pátio.
  partes.push(`<circle cx="${13 * C}" cy="${11 * C}" r="30" fill="#1a1c1f" stroke="#454a50" stroke-width="3"/><path d="M${13 * C - 22} ${11 * C}h44M${13 * C} ${11 * C - 22}v44M${13 * C - 15} ${11 * C - 15}l30 30M${13 * C + 15} ${11 * C - 15}l-30 30" stroke="#3a3f45" stroke-width="2"/>`);

  // Construções: [coluna, linha, largura, altura, telhado]
  const construcoes: Array<[number, number, number, number, 'a' | 'b' | 'c']> = [
    [0, 0, 3.6, 2.7, 'a'], [3.8, 0, 2.2, 3.4, 'c'], [0, 2.9, 3.6, 2.1, 'b'], [3.8, 3.6, 2.2, 1.4, 'a'],
    [8, 0, 3.4, 4.6, 'b'], [11.6, 0, 3, 3, 'a'], [14.8, 0, 3.2, 4.2, 'c'], [11.6, 3.2, 3, 1.6, 'c'],
    [20, 0, 4, 3, 'a'], [24.2, 0, 3.8, 5, 'b'], [20, 3.2, 4, 1.8, 'c'],
    [0, 7, 5.6, 2.4, 'c'], [0, 9.6, 2.6, 5.2, 'a'], [2.8, 9.6, 2.8, 2.6, 'b'], [2.8, 12.4, 2.8, 2.4, 'c'],
    [20, 7, 3.2, 3.6, 'b'], [23.4, 7, 4.6, 2.2, 'a'], [23.4, 9.4, 4.6, 5.4, 'c'], [20, 10.8, 3.2, 4, 'a'],
    [0, 17, 2.8, 4, 'b'], [3, 17, 2.8, 4, 'a'],
    [8, 17, 4, 4, 'c'], [12.2, 17, 2.4, 4, 'b'], [14.8, 17, 3.2, 4, 'a'],
    [20, 17, 3.6, 4, 'a'], [23.8, 17, 4.2, 4, 'b'],
  ];
  for (const [cx, cy, cl, ca] of construcoes) {
    partes.push(`<rect x="${n(cx * C + 12)}" y="${n(cy * C + 14)}" width="${n(cl * C)}" height="${n(ca * C)}" fill="#07080a" opacity=".5"/>`);
  }
  for (const [cx, cy, cl, ca, telhado] of construcoes) {
    const x = cx * C + 3;
    const y = cy * C + 3;
    const w = cl * C - 6;
    const h = ca * C - 6;
    partes.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="3" fill="url(#telha-${telhado})" stroke="#14161a" stroke-width="4"/>`);
    // Cumeeira e remendos de chapa.
    if (w > h) partes.push(`<path d="M${n(x + 8)} ${n(y + h / 2)}h${n(w - 16)}" stroke="#1b1e22" stroke-width="3" opacity=".8"/>`);
    else partes.push(`<path d="M${n(x + w / 2)} ${n(y + 8)}v${n(h - 16)}" stroke="#1b1e22" stroke-width="3" opacity=".8"/>`);
    const remendos = 1 + Math.floor(r() * 3);
    for (let i = 0; i < remendos; i++) {
      const rw = 26 + r() * 46;
      const rh = 20 + r() * 34;
      partes.push(`<rect x="${n(x + 8 + r() * Math.max(1, w - rw - 16))}" y="${n(y + 8 + r() * Math.max(1, h - rh - 16))}" width="${n(rw)}" height="${n(rh)}" fill="${r() > 0.5 ? '#2b3238' : '#4a3a31'}" stroke="#191b1f" stroke-width="1.500" opacity=".8"/>`);
    }
    if (r() > 0.45) {
      const vx = x + 16 + r() * Math.max(1, w - 50);
      const vy = y + 16 + r() * Math.max(1, h - 50);
      partes.push(`<circle cx="${n(vx)}" cy="${n(vy)}" r="13" fill="#1c1e22" stroke="#555b62" stroke-width="3"/><circle cx="${n(vx)}" cy="${n(vy)}" r="5" fill="#0c0d0f"/>`);
    }
  }
  // Passarelas de metal entre telhados.
  const passarelas: Array<[number, number, number, number]> = [[5.7, 1.2, 2.6, 0.7], [17.8, 2.6, 2.4, 0.7], [5.4, 10.4, 0.7, 0], [12.9, 4.6, 0.7, 2.6], [19.6, 12.2, 0.7, 0]];
  for (const [cx, cy, cl, ca] of passarelas) {
    if (ca === 0) continue;
    partes.push(`<rect x="${n(cx * C)}" y="${n(cy * C)}" width="${n(cl * C)}" height="${n(ca * C)}" fill="url(#passarela)" stroke="#191b1f" stroke-width="3"/>`);
  }
  // Tubulações antigas ao longo de algumas paredes.
  const tubos = [
    `M${6.1 * C} ${5.2 * C}V${0.4 * C}`,
    `M${19.75 * C} ${7.2 * C}v${3.2 * C}h${-0.5 * C}`,
    `M${8.3 * C} ${16.75 * C}h${5.5 * C}`,
    `M${5.85 * C} ${12.6 * C}v${2 * C}`,
  ];
  for (const d of tubos) {
    partes.push(`<path d="${d}" fill="none" stroke="#17191c" stroke-width="13" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#4d535a" stroke-width="8" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#6b727a" stroke-width="2" stroke-linecap="round" opacity=".6"/>`);
  }
  // Toldos e caixotes no pátio.
  const toldos: Array<[number, number, number, number]> = [[8.3, 7.3, 2.6, 1.3], [15.3, 13.4, 2.5, 1.3], [16.6, 7.3, 1.3, 2.2]];
  for (const [cx, cy, cl, ca] of toldos) {
    partes.push(`<rect x="${n(cx * C + 8)}" y="${n(cy * C + 10)}" width="${n(cl * C)}" height="${n(ca * C)}" fill="#07080a" opacity=".4"/><rect x="${n(cx * C)}" y="${n(cy * C)}" width="${n(cl * C)}" height="${n(ca * C)}" rx="2" fill="url(#toldo)" stroke="#2a1c18" stroke-width="2.500" opacity=".94"/>`);
  }
  const caixotes: Array<[number, number]> = [[9.1, 13.3], [9.75, 13.5], [9.3, 14.05], [17.3, 9.9], [11.2, 7.3], [6.2, 8.2], [6.75, 8.5], [18.2, 15.2], [14.3, 15.3]];
  for (const [cx, cy] of caixotes) {
    const t = 30 + r() * 12;
    partes.push(`<rect x="${n(cx * C)}" y="${n(cy * C)}" width="${n(t)}" height="${n(t)}" fill="#5b4a35" stroke="#2b2219" stroke-width="2.500"/><path d="M${n(cx * C)} ${n(cy * C)}l${n(t)} ${n(t)}M${n(cx * C + t)} ${n(cy * C)}l${n(-t)} ${n(t)}" stroke="#3d3124" stroke-width="2"/>`);
  }
  const barris: Array<[number, number]> = [[10.6, 13.9], [17.6, 12.8], [8.4, 9.4], [12.3, 15.5]];
  for (const [cx, cy] of barris) {
    partes.push(`<circle cx="${n(cx * C)}" cy="${n(cy * C)}" r="17" fill="#4a4f55" stroke="#1d2024" stroke-width="3"/><circle cx="${n(cx * C)}" cy="${n(cy * C)}" r="9" fill="none" stroke="#2d3136" stroke-width="2"/>`);
  }
  // Luzes de artefato: contidas, sem esconder o terreno.
  const C2 = (cx: number, cy: number, tom: 'quente' | 'fria' = 'quente'): [number, number, 'quente' | 'fria'] => [cx * C, cy * C, tom];
  partes.push(
    luzes(
      [C2(6.9, 5.9), C2(12.4, 5.5), C2(18.9, 6.1), C2(6.4, 11), C2(19.4, 11.3), C2(9, 15.6), C2(16.6, 15.9), C2(13, 9.3, 'fria'), C2(6.9, 16.6), C2(19, 16.7), C2(2.6, 5.9), C2(25, 5.9), C2(22.2, 15.9), C2(3, 15.9), C2(13, 13.2, 'fria')],
      118,
    ),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">${defs}${partes.join('')}</svg>`;
}

function farlands(): string {
  const { largura: L, altura: A } = DIMENSOES_DEMO.farlands;
  const r = semente(771199);
  const partes: string[] = [];
  const defs = `<defs>
<linearGradient id="solo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34302a"/><stop offset=".55" stop-color="#2b2925"/><stop offset="1" stop-color="#25241f"/></linearGradient>
<radialGradient id="duna"><stop offset="0" stop-color="#4a443a" stop-opacity=".55"/><stop offset="1" stop-color="#4a443a" stop-opacity="0"/></radialGradient>
<radialGradient id="cratera"><stop offset="0" stop-color="#0f1011"/><stop offset=".7" stop-color="#1c1b19"/><stop offset=".86" stop-color="#4c463c"/><stop offset="1" stop-color="#3a352d" stop-opacity="0"/></radialGradient>
${DEFS_LUZ}</defs>`;
  partes.push(`<rect width="${L}" height="${A}" fill="url(#solo)"/>`);
  for (let i = 0; i < 16; i++) {
    partes.push(`<ellipse cx="${n(r() * L)}" cy="${n(r() * A)}" rx="${n(170 + r() * 260)}" ry="${n(70 + r() * 120)}" fill="url(#duna)" transform="rotate(${n(-25 + r() * 20)} ${n(L / 2)} ${n(A / 2)})"/>`);
  }
  for (let i = 0; i < 70; i++) {
    partes.push(`<ellipse cx="${n(r() * L)}" cy="${n(r() * A)}" rx="${n(20 + r() * 70)}" ry="${n(12 + r() * 40)}" fill="#141412" opacity="${n(0.08 + r() * 0.12)}"/>`);
  }
  // Estrada antiga.
  partes.push(`<path d="M-40 980C320 900 520 1040 860 900s620-260 1120-200" fill="none" stroke="#3d3931" stroke-width="130" stroke-linecap="round" opacity=".55"/><path d="M-40 980C320 900 520 1040 860 900s620-260 1120-200" fill="none" stroke="#56503f" stroke-width="3" stroke-dasharray="26 34" opacity=".35"/>`);
  // Rachaduras.
  for (let i = 0; i < 22; i++) {
    let x = r() * L;
    let y = r() * A;
    let d = `M${n(x)} ${n(y)}`;
    const passos = 4 + Math.floor(r() * 5);
    for (let k = 0; k < passos; k++) {
      x += -50 + r() * 100;
      y += -40 + r() * 80;
      d += `L${n(x)} ${n(y)}`;
    }
    partes.push(`<path d="${d}" fill="none" stroke="#141412" stroke-width="${n(1.5 + r() * 2)}" opacity=".6"/>`);
  }
  // Cratera com brilho residual frio.
  partes.push(`<circle cx="1380" cy="420" r="210" fill="url(#cratera)"/><circle cx="1380" cy="420" r="150" fill="url(#luz-fria)"/>`);
  // Ruínas: trechos de muro quebrados.
  const muros: Array<Array<[number, number]>> = [
    [[250, 250], [470, 250], [470, 330]], [[470, 400], [470, 520], [330, 520]], [[250, 520], [250, 380]],
    [[760, 620], [980, 620]], [[1040, 620], [1120, 620], [1120, 760]], [[1120, 830], [1120, 900], [900, 900]], [[820, 900], [760, 900], [760, 720]],
    [[1500, 860], [1720, 860], [1720, 1040]], [[1500, 940], [1500, 1100], [1640, 1100]],
  ];
  for (const muro of muros) {
    const d = muro.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('');
    partes.push(`<path d="${d}" fill="none" stroke="#0f0f0e" stroke-width="34" stroke-linejoin="miter" opacity=".5" transform="translate(10 12)"/><path d="${d}" fill="none" stroke="#1d1c1a" stroke-width="30" stroke-linejoin="miter"/><path d="${d}" fill="none" stroke="#57524a" stroke-width="22" stroke-linejoin="miter"/><path d="${d}" fill="none" stroke="#6a655c" stroke-width="5" stroke-linejoin="miter" opacity=".5"/>`);
  }
  // Pilares caídos e pedras soltas.
  for (let i = 0; i < 9; i++) {
    const x = 200 + r() * (L - 400);
    const y = 150 + r() * (A - 300);
    partes.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(70 + r() * 80)}" height="24" rx="6" fill="#55504a" stroke="#1d1c1a" stroke-width="3" transform="rotate(${n(r() * 180)} ${n(x)} ${n(y)})"/>`);
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * L;
    const y = r() * A;
    const t = 8 + r() * 22;
    partes.push(`<path d="M${n(x)} ${n(y)}l${n(t)} ${n(-t * 0.5)} ${n(t * 0.8)} ${n(t * 0.7)} ${n(-t * 0.6)} ${n(t * 0.8)} ${n(-t)} ${n(-t * 0.2)}Z" fill="${r() > 0.5 ? '#4a463f' : '#3d3a34'}" stroke="#1a1917" stroke-width="2"/>`);
  }
  // Restos de um acampamento abandonado.
  const tendas: Array<[number, number, number]> = [[610, 300, 20], [700, 360, -35], [600, 420, 70]];
  for (const [x, y, giro] of tendas) {
    partes.push(`<g transform="rotate(${giro} ${x} ${y})"><rect x="${x - 46}" y="${y - 34}" width="92" height="68" fill="#3d3a33" stroke="#17160f" stroke-width="3"/><path d="M${x - 46} ${y - 34}L${x + 46} ${y + 34}M${x + 46} ${y - 34}L${x - 46} ${y + 34}" stroke="#25231d" stroke-width="2.500"/></g>`);
  }
  partes.push(`<circle cx="655" cy="365" r="16" fill="#191816" stroke="#3b372f" stroke-width="4"/>`);
  partes.push(luzes([[655, 365, 'quente']], 90));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">${defs}${partes.join('')}</svg>`;
}

function fosso(): string {
  const { largura: L } = DIMENSOES_DEMO.fosso;
  const c = L / 2;
  const r = semente(4242);
  const partes: string[] = [];
  const defs = `<defs>
<radialGradient id="areia"><stop offset="0" stop-color="#544b3f"/><stop offset=".75" stop-color="#463f35"/><stop offset="1" stop-color="#37322b"/></radialGradient>
<pattern id="grades" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#1b1d20"/><rect width="4" height="14" fill="#565b62"/></pattern>
${DEFS_LUZ}</defs>`;
  partes.push(`<rect width="${L}" height="${L}" fill="#141619"/>`);
  // Arquibancadas em anéis.
  const aneis = [750, 700, 650, 600];
  aneis.forEach((raio, i) => {
    partes.push(`<circle cx="${c}" cy="${c}" r="${raio}" fill="${i % 2 === 0 ? '#23262a' : '#1d2023'}" stroke="#0f1012" stroke-width="3"/>`);
  });
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    partes.push(`<path d="M${n(c + Math.cos(a) * 560)} ${n(c + Math.sin(a) * 560)}L${n(c + Math.cos(a) * 760)} ${n(c + Math.sin(a) * 760)}" stroke="#101113" stroke-width="3"/>`);
  }
  // Muro da arena e areia.
  partes.push(`<circle cx="${c}" cy="${c}" r="552" fill="#2d3136" stroke="#0e0f11" stroke-width="5"/><circle cx="${c}" cy="${c}" r="520" fill="url(#areia)" stroke="#191a1c" stroke-width="6"/>`);
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 505;
    partes.push(`<circle cx="${n(c + Math.cos(a) * d)}" cy="${n(c + Math.sin(a) * d)}" r="${n(1 + r() * 3)}" fill="${r() > 0.5 ? '#2f2a24' : '#62584a'}" opacity=".5"/>`);
  }
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 420;
    partes.push(`<ellipse cx="${n(c + Math.cos(a) * d)}" cy="${n(c + Math.sin(a) * d)}" rx="${n(40 + r() * 70)}" ry="${n(20 + r() * 40)}" fill="#2a2620" opacity=".28"/>`);
  }
  partes.push(`<circle cx="${c}" cy="${c}" r="96" fill="none" stroke="#2f2a24" stroke-width="5" stroke-dasharray="18 14" opacity=".7"/>`);
  // Portões gradeados nos quatro lados.
  for (const giro of [0, 90, 180, 270]) {
    partes.push(`<g transform="rotate(${giro} ${c} ${c})"><rect x="${c - 70}" y="${c - 566}" width="140" height="58" fill="url(#grades)" stroke="#0e0f11" stroke-width="5"/></g>`);
  }
  // Pilares.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.52;
    const x = c + Math.cos(a) * 320;
    const y = c + Math.sin(a) * 320;
    partes.push(`<circle cx="${n(x + 9)}" cy="${n(y + 11)}" r="30" fill="#0a0a0b" opacity=".45"/><circle cx="${n(x)}" cy="${n(y)}" r="30" fill="#565a5f" stroke="#1b1c1f" stroke-width="5"/><circle cx="${n(x)}" cy="${n(y)}" r="17" fill="none" stroke="#3b3e43" stroke-width="3"/>`);
  }
  const pontos: Array<[number, number, 'quente' | 'fria']> = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.39;
    pontos.push([c + Math.cos(a) * 536, c + Math.sin(a) * 536, 'quente']);
  }
  partes.push(luzes(pontos, 130));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${L}" viewBox="0 0 ${L} ${L}">${defs}${partes.join('')}</svg>`;
}

const GERADORES: Record<MapaDemoId, () => string> = { 'wenor-baixa': wenorBaixa, farlands, fosso };
const cache = new Map<MapaDemoId, string>();

/** URL (data:) do mapa de demonstração, gerada uma vez e reutilizada. */
export function urlMapaDemo(id: MapaDemoId): string {
  let url = cache.get(id);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(GERADORES[id]())}`;
    cache.set(id, url);
  }
  return url;
}
