# WENDLANDS — Mesa virtual

Mesa virtual (VTT) para o RPG autoral **Wendlands**: mapas, tokens, fichas,
dados, iniciativa, combate, inventário, diário e compêndio, com visibilidade
controlada pelo mestre. A partida é conduzida por pessoas; não há narrador de IA.

Interface em português brasileiro. Funciona em computador e celular.

## Como executar

Requer Node.js 22 ou mais recente.

```bash
npm install
npm run dev          # modo local, em http://localhost:5173
```

No modo local tudo fica salvo no próprio navegador (IndexedDB). Na primeira
abertura é criada uma campanha de demonstração, explicitamente fictícia.

### Mesa online (opcional)

```bash
npm run build
npm run servidor     # http://localhost:8787 — interface + servidor da mesa
```

O terminal mostra o token de administração. Na interface: **Local → Mesa
online → Abrir mesa online**, depois crie um convite para cada jogador.
Detalhes, variáveis de ambiente e garantias em [`docs/CONTRATO_ONLINE.md`](docs/CONTRATO_ONLINE.md).

O servidor roda na sua máquina ou em um servidor seu. Este projeto não publica
nada na internet nem usa serviços pagos.

## O que há na mesa

- **Campanhas e cenas** — criar, renomear, duplicar, excluir (com confirmação e
  desfazer); importar mapas e retratos; três mapas de demonstração.
- **Mapa tático** — pan, zoom, ajuste à tela, seleção única e múltipla, grade
  com calibração em metros por célula, medição, desenhos, névoa manual por
  região e prévia do que cada jogador recebe.
- **Tokens** — arrastar, setas do teclado, botões de direção ou "tocar no
  destino"; tamanho, retrato, ficha vinculada, jogador dono, oculto.
- **Fichas** — origem, facção, clã, nível, atributos, PV/VIG/RY, inventário e
  carga, técnicas, notas públicas/privadas/do mestre, registro de alterações;
  criação guiada pelas regras ou manual; importar e exportar.
- **Dados** — d4 a d100 e expressões como `2d6+2`; dados individuais,
  modificador e total; rolagem pública ou privada ao mestre.
- **Combate** — iniciativa d20 + DES, turnos e rodadas, ação principal /
  movimento / reação, ataque com confirmação, transições de agarramento com
  margem, guardas com contador compartilhado, reentrada e interferência.
- **Compêndio e diário** — busca por história, locais, facções, materiais,
  bestiário, técnicas e regras, com fonte, seção, versão e situação.
- **Backup** — pacote `.zip` completo (dados + imagens) e importação validada.

## Regras e cânone

As automações seguem os registros de auditoria aprovados, e cada uma aponta
para a regra que a sustenta (ícone ⓘ). O que está pendente, rejeitado ou sem
ficha completa nas fontes não é automatizado nem inventado. Conflitos entre
fontes e escolhas de implementação estão em
[`docs/FONTES_E_CONFLITOS.md`](docs/FONTES_E_CONFLITOS.md).

Mapas, retratos, paleta e o glifo de Galleone são proposta visual, não cânone.
Personagens de demonstração têm estatísticas fictícias; nenhum protagonista da
história recebe números de jogo.

### Segredos do mestre

O aplicativo traz apenas o cenário geral e as regras, e nada é liberado aos
jogadores automaticamente. Dossiês narrativos, prólogo e revelações futuras não
estão no código: entram na campanha por **Compêndio → Importar pacote**, como
entradas visíveis só para o mestre. A pasta `pacote-do-mestre/` é ignorada pelo
Git de propósito.

## Verificação

```bash
npm run verificar    # tipos + testes + build
```

- `npm run teste` — fórmulas, dados, mapa, guardas, permissões, visão do
  jogador, persistência, pacotes e o servidor da mesa online.
- `e2e/verificar.cjs` e `e2e/online.cjs` — verificação no navegador (desktop e
  celular; mesa online com mestre e jogador). Precisam do Playwright com
  Chromium instalado no ambiente; as instruções estão no topo de cada arquivo.

## Limites conhecidos

- **Armazenamento local**: as campanhas vivem neste navegador e neste
  dispositivo. Limpar os dados do site apaga tudo — exporte backups. Mapas até
  30 MB e retratos até 6 MB por imagem; se o espaço acabar, o aplicativo avisa
  e mantém o que já estava salvo.
- **Névoa**: manual, por células da grade. Não há iluminação dinâmica nem linha
  de visão. Ocultar/revelar por região usa arrastar; por teclado há "ocultar
  tudo" e "revelar tudo".
- **Prévia do jogador (modo local)**: mostra o que seria enviado, mas não é uma
  proteção — quem usa o navegador do mestre tem acesso a tudo.
- **Mesa online**: sem desfazer; exige o servidor em execução; HTTPS e acesso
  pela internet são responsabilidade de quem hospeda.
- **Técnicas**: só LET-ESP-001 e LET-ESP-002 têm resolução automática. As
  demais aprovadas registram ação e VIG e deixam o resultado com o mestre.
- **Sem regra aprovada**: desempate de iniciativa, total igual à Defesa/CD e
  dano sem arma pedem decisão do mestre.

Arquitetura em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).
