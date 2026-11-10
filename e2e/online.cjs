/**
 * Verificação da mesa online com o servidor real e dois navegadores
 * (mestre e jogador). Critério de aceite F, pela interface.
 *
 *   npm run build
 *   WENDLANDS_TOKEN_ADMIN=<token> npm run servidor &
 *   node e2e/online.cjs http://127.0.0.1:8787/ <token> <imagem.png> [pasta-para-capturas]
 *
 * Requer o Playwright com Chromium no ambiente (não é dependência do projeto).
 */
const { chromium } = require('playwright');
const path = require('node:path');

const [URL_BASE = 'http://127.0.0.1:8787/', TOKEN_ADMIN = '', IMAGEM = '', SAIDA = null] = process.argv.slice(2);
let falhas = 0;
const erros = [];
function conferir(nome, condicao, detalhe = '') {
  if (condicao) console.log(`OK     ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}
const foto = async (pagina, nome) => SAIDA && pagina.screenshot({ path: path.join(SAIDA, `${nome}.png`) });
const posicao = async (pagina, nome) => {
  const t = await pagina.locator(`[data-token][aria-label^="Token ${nome},"]`).first().getAttribute('transform');
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(t);
  return { x: Number(m[1]), y: Number(m[2]) };
};

(async () => {
  const navegador = await chromium.launch();
  const ctxMestre = await navegador.newContext({ viewport: { width: 1500, height: 900 } });
  await ctxMestre.grantPermissions(['clipboard-read', 'clipboard-write']);
  const mestre = await ctxMestre.newPage();
  mestre.on('pageerror', (e) => erros.push(`mestre: ${e.message}`));
  mestre.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && erros.push(`mestre console: ${m.text()}`));

  await mestre.goto(URL_BASE);
  await mestre.waitForSelector('.mapa__svg');

  // O mestre importa um mapa (imagem), esconde uma região e põe um PNJ dentro dela.
  const [seletor] = await Promise.all([mestre.waitForEvent('filechooser'), mestre.locator('.cena__importar').click()]);
  await seletor.setFiles(IMAGEM);
  await mestre.waitForSelector('dialog[open]');
  await mestre.getByRole('button', { name: 'Concluir' }).click();
  await mestre.getByRole('button', { name: /^Opções da cena/ }).last().click();
  await mestre.getByRole('menuitem', { name: 'Ativar para os jogadores' }).click();
  await mestre.waitForSelector('.mapa__svg image');

  const abrirFormularioDoToken = async () => {
    const detalhes = mestre.locator('details.token-form', { hasText: 'Token no mapa' });
    if (!(await detalhes.evaluate((d) => d.open))) await detalhes.locator('summary').click();
  };
  const criarToken = async (fx, fy, nome) => {
    await mestre.getByRole('button', { name: /^Novo token/ }).click();
    const m = await mestre.locator('.mapa__svg').boundingBox();
    await mestre.mouse.click(m.x + m.width * fx, m.y + m.height * fy);
    await abrirFormularioDoToken();
    await mestre.getByLabel('Nome no mapa').fill(nome);
    await mestre.getByLabel('Nome no mapa').blur();
    await mestre.waitForSelector(`[data-token][aria-label^="Token ${nome},"]`);
  };
  await criarToken(0.35, 0.5, 'Aventureira');
  await criarToken(0.72, 0.3, 'Emboscador secreto');
  await mestre.getByRole('button', { name: /^Névoa/ }).click();
  const m = await mestre.locator('.mapa__svg').boundingBox();
  await mestre.mouse.move(m.x + m.width * 0.6, m.y + m.height * 0.16);
  await mestre.mouse.down();
  await mestre.mouse.move(m.x + m.width * 0.86, m.y + m.height * 0.5, { steps: 6 });
  await mestre.mouse.up();
  await mestre.getByRole('button', { name: /^Selecionar e mover/ }).click();
  await mestre.waitForTimeout(600);

  // Abre a sala online com a campanha local.
  await mestre.locator('.topo__online').click();
  conferir('Sem servidor informado não há sala: o painel explica o modo local', /modo local/i.test(await mestre.locator('dialog[open]').innerText()));
  await mestre.getByLabel('Token de administração do servidor').fill('token-errado-de-proposito');
  await mestre.getByRole('button', { name: 'Abrir mesa online' }).click();
  await mestre.waitForSelector('dialog[open] .campo__erro');
  conferir('Token de administração errado é recusado, sem simular sucesso', /Não autorizado/.test(await mestre.locator('dialog[open] .campo__erro').innerText()));
  await mestre.getByLabel('Token de administração do servidor').fill(TOKEN_ADMIN);
  await mestre.getByRole('button', { name: 'Abrir mesa online' }).click();
  await mestre.waitForSelector('.topo__online--conectado', { timeout: 20000 });
  conferir('Mestre conectado à sala online', true);
  await mestre.waitForSelector('dialog[open] legend:has-text("Convites")');
  await mestre.getByPlaceholder('Nome do jogador').fill('Ana');
  await mestre.getByRole('button', { name: 'Criar convite' }).click();
  await mestre.waitForSelector('.convite input');
  const link = await mestre.locator('.convite input').inputValue();
  conferir('Convite gera um link com sala e token', /#sala=sala_[a-z0-9]+&token=.{30,}/.test(link), link.slice(0, 60));
  await mestre.getByRole('button', { name: 'Fechar' }).click();
  await mestre.waitForTimeout(2500); // tempo para a versão do mapa preparada para jogadores subir

  // ── Jogador ──
  const ctxJogador = await navegador.newContext({ viewport: { width: 1300, height: 850 } });
  const jogador = await ctxJogador.newPage();
  const recebido = [];
  jogador.on('websocket', (ws) => ws.on('framereceived', (f) => recebido.push(String(f.payload))));
  jogador.on('pageerror', (e) => erros.push(`jogador: ${e.message}`));
  const arquivosPedidos = [];
  jogador.on('response', (r) => /\/arquivos\//.test(r.url()) && arquivosPedidos.push({ url: r.url(), status: r.status() }));
  await jogador.goto(link);
  await jogador.waitForSelector('.topo__online--conectado', { timeout: 20000 });
  await jogador.waitForSelector('[data-token]');
  conferir('O link de convite some da barra de endereço depois de usado', !jogador.url().includes('token='));
  conferir('Jogador entra como jogador (papel decidido pelo servidor)', /Jogador: Ana/.test(await jogador.locator('.topo__visao').getAttribute('aria-label') || await jogador.locator('.topo__visao').innerText() || '') || (await jogador.locator('.topo__visao').isDisabled()));
  const tokensJogador = await jogador.locator('[data-token]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  conferir('F. o token sob névoa não chega ao jogador', tokensJogador.length === 1 && tokensJogador[0].includes('Aventureira'), tokensJogador.join(' | '));
  const bruto = recebido.join('\n');
  conferir('F. nada do que o servidor enviou ao jogador cita o token escondido', !bruto.includes('Emboscador secreto') && bruto.includes('Aventureira'));
  conferir('F. o jogador não tem ferramentas de mestre', (await jogador.getByRole('button', { name: /^(Névoa|Novo token|Desenhar)/ }).count()) === 0 && (await jogador.getByRole('button', { name: /^Configurar a cena/ }).count()) === 0);
  const cenasJogador = await jogador.locator('.cena__nome').allInnerTexts();
  conferir('F. o jogador recebe somente a cena ativa', cenasJogador.length === 1, cenasJogador.join(' | '));

  // O mapa do jogador é a versão preparada: a região sob névoa vem apagada na própria imagem.
  await jogador.waitForSelector('.mapa__svg image', { timeout: 15000 });
  const pixel = await jogador.evaluate(async () => {
    const href = document.querySelector('.mapa__svg image').getAttribute('href');
    const img = new Image();
    await new Promise((ok, falha) => { img.onload = ok; img.onerror = falha; img.src = href; });
    const tela = document.createElement('canvas');
    tela.width = img.naturalWidth; tela.height = img.naturalHeight;
    const c = tela.getContext('2d');
    c.drawImage(img, 0, 0);
    const em = (fx, fy) => [...c.getImageData(Math.round(img.naturalWidth * fx), Math.round(img.naturalHeight * fy), 1, 1).data].slice(0, 3);
    return { nevoa: em(0.73, 0.33), claro: em(0.47, 0.935) };
  });
  const escuro = (rgb) => Math.abs(rgb[0] - 0x15) < 12 && Math.abs(rgb[1] - 0x18) < 12 && Math.abs(rgb[2] - 0x1c) < 12;
  conferir('F. a imagem entregue ao jogador vem com a região oculta apagada', escuro(pixel.nevoa) && !escuro(pixel.claro), JSON.stringify(pixel));
  conferir('F. o jogador só baixou arquivos permitidos (nenhum 4xx/5xx de tentativa indevida)', arquivosPedidos.length >= 1 && arquivosPedidos.every((a) => a.status === 200), JSON.stringify(arquivosPedidos));
  await foto(mestre, '10-online-mestre');
  await foto(jogador, '11-online-jogador');

  // Sem posse, o jogador não tem como mover: nem arrastando, nem por botão.
  await jogador.locator('[data-token]').first().click();
  conferir('Sem posse do token, o jogador não vê os controles de movimento', (await jogador.locator('.dpad').count()) === 0);
  const antes = await posicao(jogador, 'Aventureira');
  const caixa = await jogador.locator('[data-token] > circle').nth(1).boundingBox();
  await jogador.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await jogador.mouse.down();
  await jogador.mouse.move(caixa.x + 120, caixa.y + 60, { steps: 5 });
  await jogador.mouse.up();
  await jogador.waitForTimeout(400);
  const semMover = await posicao(mestre, 'Aventureira');
  conferir('F. arrastar um token alheio não muda nada no servidor', semMover.x === antes.x && semMover.y === antes.y);

  // O mestre entrega o token à Ana; ela move e o mestre vê.
  await mestre.locator('[data-token][aria-label^="Token Aventureira,"]').click();
  await abrirFormularioDoToken();
  await mestre.locator('label', { hasText: /^Jogador que pode mover/ }).locator('select').selectOption({ label: 'Ana' });
  await jogador.waitForSelector('.dpad', { timeout: 8000 });
  await jogador.getByRole('button', { name: 'Mover uma célula para leste' }).click();
  await mestre.waitForFunction((x) => {
    const t = document.querySelector('[data-token][aria-label^="Token Aventureira,"]').getAttribute('transform');
    return Number(/translate\(([-\d.]+)/.exec(t)[1]) === x;
  }, antes.x + 64, { timeout: 8000 });
  conferir('Movimento do jogador (token próprio) chega ao mestre', true);

  // O mestre move e o jogador vê; rolagens: pública do jogador e privada do mestre.
  await mestre.locator('[data-token][aria-label^="Token Aventureira,"]').focus();
  await mestre.keyboard.press('ArrowDown');
  await jogador.waitForFunction((y) => {
    const t = document.querySelector('[data-token]').getAttribute('transform');
    return Number(/translate\([-\d.]+ ([-\d.]+)/.exec(t)[1]) === y;
  }, antes.y + 64, { timeout: 8000 });
  conferir('Movimento do mestre chega ao jogador', true);
  await jogador.getByLabel('Expressão de dados').fill('2d6+1');
  await jogador.getByRole('button', { name: /^Rolar 2d6 \+ 1/ }).click();
  await mestre.waitForSelector('.hist:has-text("Ana")', { timeout: 8000 });
  conferir('Rolagem do jogador é feita pelo servidor e aparece para o mestre', /\(\d \+ \d\) \+ 1 =/.test((await mestre.locator('.hist', { hasText: 'Ana' }).first().innerText()).replace(/\s+/g, ' ')));
  await mestre.getByLabel('Descrição da rolagem (opcional)').fill('segredo-do-mestre');
  await mestre.locator('.dados .alternar input').check();
  await mestre.getByRole('button', { name: /^Rolar 1d20/ }).click();
  await mestre.waitForSelector('.hist:has-text("segredo-do-mestre")');
  await jogador.waitForTimeout(800);
  conferir('F. rolagem privada do mestre não é enviada ao jogador', !recebido.join('\n').includes('segredo-do-mestre') && (await jogador.locator('.hist', { hasText: 'segredo-do-mestre' }).count()) === 0);

  // Reconexão: a página do jogador recarrega e volta sozinha à mesa.
  await jogador.reload();
  await jogador.waitForSelector('.topo__online--conectado', { timeout: 20000 });
  await jogador.waitForSelector('[data-token]');
  conferir('Ao recarregar, o jogador volta à mesma mesa', (await jogador.locator('[data-token]').count()) === 1);

  // Encerrar a sala derruba o jogador e devolve o mestre ao modo local com a campanha salva.
  await mestre.locator('.topo__online').click();
  await mestre.getByRole('button', { name: 'Encerrar a sala' }).click();
  await mestre.getByRole('button', { name: 'Encerrar a sala' }).last().click();
  await mestre.waitForSelector('.topo__online--local', { timeout: 15000 });
  await mestre.waitForSelector('[data-token]');
  const local = await posicao(mestre, 'Aventureira');
  conferir('Ao encerrar, o mestre volta ao modo local com o estado da sala salvo', local.x === antes.x + 64 && local.y === antes.y + 64, JSON.stringify(local));
  await jogador.waitForSelector('.faixa--erro', { timeout: 10000 });
  conferir('O jogador é avisado de que a mesa foi encerrada', /encerrada|Sem conexão|inválido/i.test(await jogador.locator('.faixa--erro').innerText()));

  conferir('Sem erros de página', erros.length === 0, erros.slice(0, 4).join(' | '));
  await navegador.close();
  console.log(falhas === 0 ? '\nTodas as verificações da mesa online passaram.' : `\n${falhas} verificação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERRO NA VERIFICAÇÃO:', e);
  process.exit(1);
});
