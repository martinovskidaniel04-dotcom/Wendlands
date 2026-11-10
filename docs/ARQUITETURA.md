# Arquitetura

```
src/
  dominio/          regras puras e dados — sem DOM, sem rede, sem disco
    esquema.ts        fonte única de tipos e validação (zod)
    dados.ts          analisador de expressões (sem eval) e fonte aleatória injetável
    mapa.ts           câmera, grade, medição e névoa em coordenadas de mundo
    comandos.ts       todos os comandos: validar → autorizar → aplicar
    visao.ts          o que cada papel recebe (filtro de privacidade)
    pacote.ts         backup .zip, exportação de dados, importação e migração
    fabrica.ts        objetos novos e a campanha de demonstração
    regras/           ficha, origem, combate/agarramento, técnicas, referências
    compendio/        entradas embutidas (sem segredos) e busca
  persistencia/     IndexedDB: campanhas e imagens por campanha
  online/           contrato do protocolo e cliente WebSocket/HTTP
  ui/               React: loja de estado, mesa, fichas, compêndio, diário, diálogos
  estilos/          tokens de design e folhas de estilo
servidor/           servidor Node da mesa online (usa src/dominio)
testes/             Vitest: regras, permissões, persistência, pacotes, servidor
e2e/                verificação no navegador (Playwright), fora das dependências
```

## Um caminho só para mudar o estado

Toda alteração de campanha é um **comando** (`src/dominio/comandos.ts`):

1. validado por esquema (o que vem da rede ou de um arquivo é sempre tratado como não confiável);
2. autorizado pelo papel de quem enviou — o papel vem do contexto, nunca do comando;
3. aplicado sobre uma cópia imutável (immer), gerando nova revisão.

O mesmo executor roda no navegador (modo local) e no servidor (mesa online).
Por isso as regras de permissão e de jogo são testadas uma vez e valem nos dois.

## Resoluções em duas fases

Ataques e transições de agarramento não alteram nada ao rolar: produzem uma
**pendência** com os dados individuais, a margem, as regras de referência e os
efeitos propostos. Só a confirmação do mestre aplica os efeitos; cancelar não
consome ação nem VIG. Quando a fonte pede validação do mestre, a pendência traz
mais de um desfecho para escolha.

Guardas têm identidade própria e contador compartilhado; intervalos de
reentrada são registrados por combatente e por oponente. Os invariantes estão
em `regras/combate.ts` e cobertos por `testes/combate.teste.ts`.

## Visão por papel

`filtrarVisao` produz a campanha que cada pessoa pode receber. O servidor a
aplica antes de enviar qualquer coisa; o modo local usa a mesma função para a
prévia do jogador. A prévia é só uma prévia: não protege contra quem tem acesso
ao armazenamento do navegador do mestre.

## Coordenadas

Tudo no mapa está em coordenadas de mundo (pixels do mapa na resolução
original). A câmera só converte mundo ↔ tela; zoom e pan não tocam em posições
nem em distâncias. A medição usa a calibração explícita da cena (metros por célula).

## Persistência local

IndexedDB, com três áreas: campanhas, arquivos (imagens, chaveadas por
campanha) e preferências. Salvamento automático após cada comando; falhas de
cota aparecem numa faixa persistente e nada já salvo é perdido. Importações
gravam campanha e imagens numa única transação.

## Dependências

Versões fixas em `package.json`, com `package-lock.json`.

| Pacote | Uso |
| --- | --- |
| react, react-dom | Interface |
| zod | Esquema e validação de dados e comandos |
| immer | Atualizações imutáveis nos comandos |
| idb | Acesso ao IndexedDB |
| fflate | Pacote .zip de backup |
| ws | WebSocket no servidor |
| @fontsource/* | Fontes servidas pelo próprio aplicativo (sem chamadas externas) |

Desenvolvimento: Vite, TypeScript, Vitest, fake-indexeddb, tsx.
