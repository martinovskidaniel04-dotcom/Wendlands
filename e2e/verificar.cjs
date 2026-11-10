/**
 * Verificação de ponta a ponta no navegador (critérios de aceite A–E, G–I).
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node e2e/verificar.cjs http://127.0.0.1:4173/ [pasta-para-capturas]
 *
 * Requer o Playwright com Chromium disponível no ambiente (não é dependência do
 * projeto). Cada verificação imprime OK ou FALHA; o processo sai com código 1
 * se alguma falhar.
 */
const { chromium, devices } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const URL_BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const SAIDA = process.argv[3] || null;
let falhas = 0;
const erros = [];

function conferir(nome, condicao, detalhe = '') {
  if (condicao) console.log(`OK     ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}
const foto = async (pagina, nome, opcoes = {}) => {
  if (SAIDA) await pagina.screenshot({ path: path.join(SAIDA, `${nome}.png`), ...opcoes });
};
const posicao = async (pagina, nome) => {
  const t = await pagina.locator(`[data-token][aria-label^="Token ${nome},"]`).first().getAttribute('transform');
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(t);
  return { x: Number(m[1]), y: Number(m[2]) };
};
const centroNaTela = async (pagina, nome) => {
  const caixa = await pagina.locator(`[data-token][aria-label^="Token ${nome},"] > circle`).nth(1).boundingBox();
  return { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
};
const zoomAtual = async (pagina) => Number((await pagina.locator('.mapa__zoom-valor').innerText()).replace('%', '')) / 100;

(async () => {
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1672, height: 941 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && erros.push(`console: ${m.text()}`));
  p.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));

  await p.goto(URL_BASE);
  await p.waitForSelector('.mapa__svg');
  await p.waitForTimeout(500);
  await foto(p, '01-mesa-desktop');

  // ── B. Coordenadas, arrastar, teclado e medição ──
  const z = await zoomAtual(p);
  const antes = await posicao(p, 'Esquecido');
  const c = await centroNaTela(p, 'Esquecido');
  await p.mouse.move(c.x, c.y);
  await p.mouse.down();
  await p.mouse.move(c.x + 64 * 2 * z + 3, c.y + 2, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(150);
  let depois = await posicao(p, 'Esquecido');
  conferir('B. arrastar move o token e encaixa na grade (2 células)', depois.x === antes.x + 128 && depois.y === antes.y, JSON.stringify({ antes, depois }));

  await p.getByRole('button', { name: 'Aumentar zoom' }).click();
  await p.getByRole('button', { name: 'Aumentar zoom' }).click();
  const comZoom = await posicao(p, 'Esquecido');
  conferir('B. zoom não altera coordenadas de mundo', comZoom.x === depois.x && comZoom.y === depois.y);
  await p.getByRole('button', { name: /^Mover o mapa/ }).click();
  const caixaMapa = await p.locator('.mapa__svg').boundingBox();
  await p.mouse.move(caixaMapa.x + 300, caixaMapa.y + 300);
  await p.mouse.down();
  await p.mouse.move(caixaMapa.x + 180, caixaMapa.y + 240, { steps: 5 });
  await p.mouse.up();
  const comPan = await posicao(p, 'Esquecido');
  conferir('B. pan não altera coordenadas de mundo', comPan.x === depois.x && comPan.y === depois.y);
  await p.getByRole('button', { name: 'Ajustar o mapa à tela' }).click();
  await p.getByRole('button', { name: /^Selecionar e mover/ }).click();

  await p.locator('[data-token][aria-label^="Token Esquecido,"]').focus();
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(100);
  const porTeclado = await posicao(p, 'Esquecido');
  conferir('B. seta do teclado move o token em foco uma célula', porTeclado.x === depois.x + 64, JSON.stringify(porTeclado));
  await p.keyboard.press('Enter');
  await p.getByRole('button', { name: 'Mover uma célula para sul' }).click();
  await p.waitForTimeout(100);
  const porBotao = await posicao(p, 'Esquecido');
  conferir('B. botão de direção move sem arrastar', porBotao.y === porTeclado.y + 64, JSON.stringify(porBotao));

  const medir = async () => {
    await p.getByRole('button', { name: /^Medir distância/ }).click();
    const zz = await zoomAtual(p);
    const m = await p.locator('.mapa__svg').boundingBox();
    const inicio = { x: m.x + m.width / 2 - 100, y: m.y + m.height / 2 + 40 };
    await p.mouse.move(inicio.x, inicio.y);
    await p.mouse.down();
    await p.mouse.move(inicio.x + 64 * 4 * zz, inicio.y, { steps: 5 });
    await p.mouse.up();
    const texto = await p.locator('.mapa__svg text').filter({ hasText: /\d m$/ }).last().textContent();
    await p.keyboard.press('Escape');
    return texto;
  };
  conferir('B. medição calibrada: 4 células × 1,5 m = 6 m', (await medir()) === '6 m');
  await p.getByRole('button', { name: /^Configurar a cena/ }).click();
  const campoMetros = p.getByLabel('Metros por célula');
  await campoMetros.fill('2');
  await campoMetros.blur();
  await p.getByRole('button', { name: 'Concluir' }).click();
  conferir('B. recalibrar para 2 m por célula muda a medição para 8 m', (await medir()) === '8 m');
  await p.getByRole('button', { name: /^Selecionar e mover/ }).click();

  // ── C. Recursos: registro, limites, desfazer ──
  await p.locator('[data-token][aria-label^="Token Esquecido,"]').click();
  const pv = p.locator('.recurso--pv .recurso__valor').first();
  conferir('C. no máximo, somar PV fica desabilitado', await p.getByRole('button', { name: 'Somar 1 a PV' }).isDisabled());
  await p.getByRole('button', { name: 'Tirar 1 de PV' }).click();
  conferir('C. tirar 1 PV', (await pv.innerText()) === '29 / 30', await pv.innerText());
  await p.getByRole('button', { name: 'Desfazer (Ctrl+Z)' }).click();
  conferir('C. desfazer restaura o PV', (await pv.innerText()) === '30 / 30', await pv.innerText());
  await p.getByRole('button', { name: 'Ajustar PV por um valor' }).click();
  await p.getByLabel('Valor para ajustar PV').fill('999');
  await p.getByLabel('Valor para ajustar PV').blur();
  await p.getByRole('button', { name: /^Tirar 999/ }).click();
  conferir('C. dano acima do total para em 0 e marca incapacitado', (await pv.innerText()) === '0 / 30' && (await p.locator('.condicao').count()) === 1, await pv.innerText());
  await p.getByRole('button', { name: /^Somar 999/ }).click();
  conferir('C. cura acima do máximo para no máximo', (await pv.innerText()) === '30 / 30', await pv.innerText());
  await p.getByRole('button', { name: /Abrir a ficha de Esquecido/ }).click();
  const registro = await p.locator('.bloco', { hasText: 'Registro de alterações' }).locator('tbody tr').first().innerText();
  conferir('C. alteração fica no registro da ficha', /PV/.test(registro) && /30/.test(registro), registro);
  await foto(p, '02-ficha-desktop');
  await p.getByRole('button', { name: 'Mesa', exact: true }).click();

  // ── D. Dados ──
  const expressao = p.getByLabel('Expressão de dados');
  await expressao.fill('2d6+2');
  await p.getByRole('button', { name: /^Rolar 2d6 \+ 2/ }).click();
  const linha = await p.locator('.hist').first().innerText();
  const m = /\((\d) \+ (\d)\) \+ 2 = \n?(\d+)/.exec(linha.replace(/\s+/g, ' ').replace('= ', '= '));
  conferir('D. mostra dados individuais, modificador e total', !!m && Number(m[1]) + Number(m[2]) + 2 === Number(m[3]), linha);
  const quantas = await p.locator('.hist').count();
  await expressao.fill('alert(1)');
  conferir('D. expressão inválida desabilita a rolagem e explica', (await p.locator('.dados__rolar').isDisabled()) && (await p.locator('#erro-expressao').innerText()).length > 0);
  await expressao.press('Enter');
  conferir('D. expressão inválida não cria resultado', (await p.locator('.hist').count()) === quantas);
  await expressao.fill('1d20');

  // ── A. Criar campanha, ficha, mapa e token; recarregar ──
  await p.locator('.topo__campanha').click();
  await p.getByPlaceholder('Nome da campanha').fill('Campanha de teste');
  await p.getByRole('button', { name: 'Criar', exact: true }).click();
  await p.waitForFunction(() => document.title.startsWith('Campanha de teste'));
  conferir('A. campanha nova começa vazia (estado vazio real)', (await p.locator('.mesa__centro .vazio__titulo').innerText()).includes('ainda não tem cenas'));
  await p.getByRole('button', { name: 'Nova cena' }).click();
  await p.getByRole('menuitem', { name: 'Cena vazia' }).click();
  await p.waitForSelector('.mapa__svg');
  await p.getByRole('button', { name: 'Fichas', exact: true }).click();
  await p.getByRole('button', { name: 'Nova ficha' }).click();
  await p.getByLabel('Nome', { exact: true }).fill('Batedora');
  await p.locator('dialog label', { hasText: /^Origem/ }).locator('select').selectOption('esquecido');
  await p.getByRole('button', { name: 'Aumentar FIS' }).click();
  await p.getByRole('button', { name: 'Aumentar DES' }).click();
  await p.getByRole('button', { name: 'Criar ficha' }).click();
  await p.waitForSelector('.ficha');
  const pvFicha = await p.locator('.recursos--ficha .recurso--pv .recurso__valor').innerText();
  const vigFicha = await p.locator('.recursos--ficha .recurso--vig .recurso__valor').innerText();
  conferir('A. ficha Esquecido FIS3 DES3 MEN2: 30 PV, 16 VIG, RY 0', pvFicha === '30 / 30' && vigFicha === '16 / 16' && (await p.locator('.recursos--ficha .recurso--ry .recurso__valor').innerText()) === '0 / 0', `${pvFicha} ${vigFicha}`);
  await p.getByRole('button', { name: 'Mesa', exact: true }).click();
  await p.getByRole('button', { name: /^Novo token/ }).click();
  const mm = await p.locator('.mapa__svg').boundingBox();
  await p.mouse.click(mm.x + mm.width / 2, mm.y + mm.height / 2);
  await p.waitForSelector('[data-token]');
  await p.locator('details.token-form > summary', { hasText: 'Token no mapa' }).click();
  await p.locator('label', { hasText: /^Ficha vinculada/ }).locator('select').selectOption({ label: 'Batedora' });
  await p.getByLabel('Nome no mapa').fill('Batedora');
  await p.getByLabel('Nome no mapa').blur();
  await p.waitForTimeout(700);
  const posAntes = await posicao(p, 'Batedora');
  await p.reload();
  await p.waitForSelector('[data-token]');
  const posDepois = await posicao(p, 'Batedora');
  await p.locator('[data-token]').first().click();
  const nomeFicha = await p.locator('.persona__nome').innerText();
  conferir('A. após recarregar: mesma campanha, token na mesma posição e ficha vinculada', (await p.title()).startsWith('Campanha de teste') && posAntes.x === posDepois.x && posAntes.y === posDepois.y && nomeFicha === 'Batedora', JSON.stringify({ posAntes, posDepois, nomeFicha }));

  // ── G. Exportar e importar ──
  await p.locator('.topo__campanha').click();
  const [baixado] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Backup completo (.zip)' }).click()]);
  const arquivo = path.join(SAIDA || require('node:os').tmpdir(), baixado.suggestedFilename());
  await baixado.saveAs(arquivo);
  conferir('G. backup completo é um .zip com conteúdo', arquivo.endsWith('.wendlands.zip') && fs.statSync(arquivo).size > 500);
  const [seletor] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Escolher arquivo…' }).click()]);
  await seletor.setFiles(arquivo);
  await p.waitForSelector('.previa-importacao');
  const previa = await p.locator('.previa-importacao').innerText();
  conferir('G. a prévia avisa que já existe campanha com o mesmo identificador', /mesmo identificador/.test(previa) && /Substituir a existente/.test(previa));
  await p.getByRole('button', { name: 'Importar como cópia' }).click();
  await p.waitForSelector('[data-token]');
  await p.locator('.topo__campanha').click();
  const nomes = await p.locator('.campanha__nome strong').allInnerTexts();
  conferir('G. importar como cópia cria outra campanha sem tocar na original', nomes.filter((n) => n.startsWith('Campanha de teste')).length === 2, nomes.join(' | '));
  await p.getByRole('button', { name: 'Fechar' }).click();
  const posCopia = await posicao(p, 'Batedora');
  conferir('G. a cópia importada traz token e posição', posCopia.x === posAntes.x && posCopia.y === posAntes.y);

  // ── I e F (prévia). Compêndio e visão do jogador ──
  await p.locator('.topo__campanha').click();
  await p.locator('.campanha', { hasText: 'Mesa de Wendlands' }).getByRole('button', { name: 'Abrir' }).click();
  await p.waitForSelector('[data-token]');
  await p.locator('[data-token][aria-label^="Token Luzionne,"]').click();
  await p.locator('details.token-form > summary', { hasText: 'Token no mapa' }).click();
  await p.getByLabel('Oculto para os jogadores (não é enviado a eles)').check();
  await p.getByRole('button', { name: 'Compêndio', exact: true }).click();
  await p.getByLabel('Buscar no compêndio').fill('oparthyn');
  await p.locator('.item-entrada').first().click();
  const entrada = await p.locator('.entrada-compendio').innerText();
  conferir('I. busca por grafia alternativa acha o clã e mostra a divergência registrada', /Clã Opartyn/.test(entrada) && /Divergências registradas/i.test(entrada) && /Cânone/.test(entrada) && /Somente mestre/.test(entrada));
  await p.getByLabel('Buscar no compêndio').fill('LET-ESP-016');
  await p.locator('.item-entrada').first().click();
  conferir('I. técnica pendente aparece como pendente', /Pendente/.test(await p.locator('.entrada-compendio').innerText()));
  await foto(p, '03-compendio-desktop');
  await p.locator('.topo__visao').click();
  await p.getByRole('menuitemradio', { name: 'Jogador sem ficha' }).click();
  conferir('I. o jogador não vê entradas não liberadas', (await p.locator('.item-entrada').count()) === 0);
  await p.getByRole('button', { name: 'Mesa', exact: true }).click();
  const nomesTokens = await p.locator('[data-token]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  conferir('Prévia do jogador: token oculto não aparece e ferramentas de mestre somem', nomesTokens.length === 2 && !nomesTokens.some((n) => n.includes('Luzionne')) && (await p.getByRole('button', { name: /^Névoa/ }).count()) === 0, nomesTokens.join(' | '));
  await foto(p, '04-previa-jogador');
  await p.locator('.topo__visao').click();
  await p.getByRole('menuitemradio', { name: 'Visão do mestre' }).click();

  // ── E. Turnos, rodadas e resolução pendente ──
  await p.getByRole('button', { name: /Iniciar combate com a cena/ }).click();
  await p.getByRole('button', { name: 'Rolar d20 + DES' }).click();
  if ((await p.getByRole('button', { name: 'Confirmar esta ordem' }).count()) > 0) {
    conferir('E. empate de iniciativa pede decisão do mestre', true);
    await p.getByRole('button', { name: 'Confirmar esta ordem' }).click();
  }
  const rodada = () => p.locator('.secao__titulo', { hasText: 'Iniciativa' }).innerText();
  for (let i = 0; i < 3; i++) await p.getByRole('button', { name: 'Próximo turno' }).click();
  conferir('E. após três turnos com três participantes começa a rodada 2', /RODADA 2/i.test(await rodada()), await rodada());
  await p.locator('[data-token][aria-label^="Token Esquecido,"]').click();
  await p.getByRole('button', { name: 'Atacar…' }).click();
  await p.getByRole('button', { name: 'Rolar ataque' }).click();
  await p.waitForSelector('.pendencia');
  const pvAlvoAntes = await p.locator('.pendencia__linhas').innerText();
  conferir('E. ataque fica pendente até o mestre confirmar', /contra Defesa/.test(pvAlvoAntes));
  await foto(p, '05-combate-pendencia');
  await p.getByRole('button', { name: 'Confirmar', exact: true }).click();
  conferir('E. confirmar aplica e consome a ação principal', (await p.locator('.pendencia').count()) === 0 && (await p.locator('.ficha-acao--usada', { hasText: 'Ação principal' }).count()) === 1);

  // ── Falha de cota: aviso persistente, sem perda silenciosa ──
  await p.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    window.__restaurarPut = () => (IDBObjectStore.prototype.put = original);
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('cota excedida (simulada)', 'QuotaExceededError');
    };
  });
  await p.getByLabel('Expressão de dados').fill('1d4');
  await p.getByRole('button', { name: /^Rolar 1d4/ }).click();
  await p.waitForSelector('.faixa--erro');
  const faixa = await p.locator('.faixa--erro').innerText();
  conferir('Armazenamento cheio: aviso persistente explica e oferece backup', /armazenamento do navegador está cheio/i.test(faixa) && /Exportar backup/.test(faixa) && (await p.locator('.salvamento--erro').count()) === 1, faixa.slice(0, 80));
  await p.evaluate(() => window.__restaurarPut());
  await p.getByRole('button', { name: 'Tentar salvar de novo' }).click();
  await p.waitForSelector('.faixa--erro', { state: 'detached' });
  const salvou = await p.waitForSelector('.salvamento--salvo', { timeout: 5000 }).then(() => true, () => false);
  conferir('Depois de liberar espaço, salvar de novo limpa o aviso e grava', salvou);

  // ── H. Contraste do texto (WCAG AA 4,5:1) nos painéis ──
  const contrastes = await p.evaluate(() => {
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const cor = (texto) => (texto.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
    const fundoDe = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = cor(getComputedStyle(e).backgroundColor);
        if (c.length >= 3 && (c.length === 3 || c[3] > 0.95)) return c.slice(0, 3);
      }
      return [17, 19, 22];
    };
    const piores = [];
    for (const el of document.querySelectorAll('.nota, .campo__dica, .campo__rotulo, .hist__hora, .hist__texto, .secao__titulo, .eco__situacao, .item-ficha__sub, .persona__sub, .derivados, .aba, .btn, .ficha-acao')) {
      if (!el.offsetParent || !el.textContent.trim() || el.closest(':disabled')) continue;
      const frente = cor(getComputedStyle(el).color).slice(0, 3);
      const l1 = lum(frente), l2 = lum(fundoDe(el));
      const razao = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (razao < 4.5) piores.push(`${el.className.split(' ')[0]} ${razao.toFixed(2)}`);
    }
    return piores;
  });
  conferir('H. textos dos painéis com contraste de pelo menos 4,5:1', contrastes.length === 0, [...new Set(contrastes)].slice(0, 6).join(', '));

  // ── H. Acessibilidade básica ──
  const semNome = await p.evaluate(() =>
    [...document.querySelectorAll('button, [role="button"], input, select, textarea')]
      .filter((el) => el.offsetParent !== null || el.closest('svg'))
      .filter((el) => {
        const nome = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent.trim() || el.getAttribute('title') || el.getAttribute('placeholder') || (el.labels && el.labels.length ? el.labels[0].textContent.trim() : '');
        return !nome;
      })
      .map((el) => el.outerHTML.slice(0, 120)),
  );
  conferir('H. todos os controles visíveis têm nome acessível', semNome.length === 0, semNome.slice(0, 3).join(' || '));
  await p.keyboard.press('Tab');
  const foco = await p.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    return { tag: el.tagName, contorno: s.outlineStyle, largura: s.outlineWidth };
  });
  conferir('H. o foco do teclado é visível', foco.contorno !== 'none' && foco.largura !== '0px', JSON.stringify(foco));

  await ctx.close();

  // ── H. Celular ──
  const movel = await navegador.newContext({ ...devices['iPhone 13'] });
  const q = await movel.newPage();
  q.on('pageerror', (e) => erros.push(`pageerror (celular): ${e.message}`));
  await q.goto(URL_BASE);
  await q.waitForSelector('.mapa__svg');
  await q.waitForTimeout(500);
  await foto(q, '06-mesa-celular');
  const transborda = await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  conferir('H. celular: sem rolagem horizontal na mesa', !transborda);
  await q.locator('[data-token]').first().tap();
  await q.getByRole('button', { name: 'Personagem e combate' }).tap();
  await q.waitForSelector('.gaveta--dir');
  await foto(q, '07-gaveta-personagem-celular');
  const antesToque = await posicao(q, 'Esquecido');
  await q.getByRole('button', { name: 'Mover uma célula para leste' }).tap();
  await q.waitForTimeout(150);
  const depoisToque = await posicao(q, 'Esquecido');
  conferir('H. celular: mover token por botão, sem arrastar', depoisToque.x === antesToque.x + 64, JSON.stringify({ antesToque, depoisToque }));
  await q.getByRole('button', { name: 'Escolher o destino tocando no mapa' }).tap();
  const mapaMovel = await q.locator('.mapa__svg').boundingBox();
  await q.touchscreen.tap(mapaMovel.x + mapaMovel.width / 2, mapaMovel.y + mapaMovel.height / 2);
  await q.waitForTimeout(150);
  const porToque = await posicao(q, 'Esquecido');
  conferir('H. celular: tocar no mapa define o destino do token', porToque.x !== depoisToque.x || porToque.y !== depoisToque.y, JSON.stringify(porToque));
  await q.getByRole('button', { name: 'Dados e histórico' }).tap();
  await q.waitForSelector('.gaveta--dados');
  await q.getByRole('button', { name: /^Rolar 1d20/ }).tap();
  await q.waitForSelector('.hist');
  await foto(q, '08-dados-celular');
  await q.getByRole('button', { name: 'Fechar painel' }).tap();
  await q.getByRole('button', { name: 'Fichas', exact: true }).tap();
  await q.locator('.item-ficha').first().tap();
  await foto(q, '09-fichas-celular', { fullPage: false });
  conferir('H. celular: página de fichas sem rolagem horizontal', !(await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await movel.close();

  conferir('Sem erros de console ou de página', erros.length === 0, erros.slice(0, 4).join(' | '));
  await navegador.close();
  console.log(falhas === 0 ? '\nTodas as verificações passaram.' : `\n${falhas} verificação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERRO NA VERIFICAÇÃO:', e);
  process.exit(1);
});
