# Mesa online — contrato, configuração e garantias

A mesa online é um servidor Node auto-hospedado (`servidor/`), sem serviços
externos. O cliente fala com ele por HTTP (`/api`) e WebSocket (`/ws`). As
definições de tipo ficam em `src/online/protocolo.ts`.

## Como ativar

```bash
npm install
npm run build                 # gera a interface em dist/
npm run servidor              # sobe em http://localhost:8787 e serve dist/
```

Variáveis de ambiente:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `WENDLANDS_PORTA` | `8787` | Porta de escuta |
| `WENDLANDS_ENDERECO` | `0.0.0.0` | Endereço de escuta |
| `WENDLANDS_DADOS` | `./dados-servidor` | Pasta das salas e imagens |
| `WENDLANDS_TOKEN_ADMIN` | gerado a cada início | Token para criar salas (mínimo 16 caracteres) |

Passos do mestre: abrir `http://<endereço>:8787`, clicar em **Local → Mesa
online**, informar o token de administração e **Abrir mesa online**. Depois,
criar um convite por jogador e enviar o link a cada um.

O que este projeto **não** faz: publicar o servidor na internet, configurar
HTTPS, domínio ou redirecionamento de portas. Para jogar fora da rede local é
preciso expor o servidor por conta própria — de preferência atrás de um proxy
com TLS, porque os tokens trafegam na conexão.

## Autenticação e papéis

- **Token de administração**: só cria salas. Não dá acesso a nenhuma sala.
- **Token do mestre**: gerado na criação da sala, mostrado uma vez.
- **Token de jogador**: um por convite, mostrado uma vez; pode ser renovado ou revogado.

O servidor guarda apenas o SHA-256 de cada token. O papel de uma conexão é
decidido exclusivamente pelo token apresentado; nenhum campo enviado pelo
cliente altera o papel, e o nome exibido vem do cadastro da sala.

Os links de entrada usam o fragmento da URL (`#sala=…&token=…`), que o navegador
não envia em requisições; o cliente o guarda e limpa a barra de endereço.

## WebSocket (`/ws`)

Cliente → servidor:

| Mensagem | Campos |
| --- | --- |
| `entrar` | `protocolo`, `salaId`, `token` — obrigatória em até 10 s |
| `comando` | `idComando` (único), `comando` (ver `src/dominio/comandos.ts`) |
| `ping` | — |

Servidor → cliente:

| Mensagem | Campos |
| --- | --- |
| `bem-vindo` | `papel`, `jogadorId`, `nome`, `revisao`, `visao` |
| `visao` | `revisao`, `visao` — só quando a visão daquele cliente mudou |
| `resultado` | `idComando`, `ok`, `erro`, `revisao` |
| `erro` | `codigo` (`nao-autorizado`, `protocolo`, `limite`, `sala-encerrada`), `mensagem` |
| `pong` | — |

`visao` é a campanha **já filtrada** para quem recebe (`src/dominio/visao.ts`).

## HTTP (`/api`)

| Rota | Quem | Efeito |
| --- | --- | --- |
| `GET /api/saude` | qualquer um | Identifica o serviço e a versão do protocolo |
| `POST /api/salas` | token de administração | Cria a sala com `{ campanha }`; devolve `salaId` e `tokenMestre` |
| `DELETE /api/salas/:id` | mestre | Encerra e apaga a sala |
| `GET /api/salas/:id/exportar` | mestre | Campanha completa |
| `GET /api/salas/:id/convites` | mestre | Jogadores com acesso e se estão conectados |
| `POST /api/salas/:id/convites` | mestre | `{ nome }` cria; `{ jogadorId }` renova o link |
| `DELETE /api/salas/:id/convites/:jogadorId` | mestre | Revoga e desconecta |
| `PUT /api/salas/:id/arquivos/:arquivoId` | mestre | Envia imagem (PNG, JPEG, WebP, GIF, AVIF) |
| `GET /api/salas/:id/arquivos/:arquivoId` | mestre ou jogador | Só o que aparece na visão de quem pede |

Autenticação por `Authorization: Bearer <token>`. Sala inexistente e token
errado respondem igual (401); arquivo fora da visão responde 404.

## Garantias implementadas e testadas

| Garantia | Onde é testada |
| --- | --- |
| Jogador não recebe tokens ocultos ou sob névoa, fichas ocultas, notas privadas alheias, notas do mestre, cenas inativas, rolagens privadas alheias | `testes/permissoes.teste.ts`, `testes/servidor.teste.ts`, `e2e/online.cjs` |
| O arquivo original do mapa nunca é enviado a jogadores; só a versão preparada, e apenas se cobrir toda a névoa atual | idem |
| Jogador não move token alheio, oculto ou inexistente (mesma resposta nos três casos) | idem |
| Jogador não consegue se tornar mestre (campos extras, segundo `entrar`, rotas HTTP, token de administração) | `testes/servidor.teste.ts` |
| Dados rolados no servidor; "resultado" enviado pelo cliente é ignorado | `testes/servidor.teste.ts` |
| Comando reenviado com o mesmo `idComando` não executa duas vezes | `testes/servidor.teste.ts` |
| A sala sobrevive a reinício do servidor (gravação atômica em disco) | `testes/servidor.teste.ts` |
| Revogar convite derruba a conexão e invalida o token | `testes/servidor.teste.ts` |

Limites: 40 mensagens por segundo por conexão, 512 KB por mensagem, 30 MB para
a campanha, 40 MB por imagem, bloqueio temporário após 20 falhas de
autenticação por endereço em um minuto.

## Mapa preparado para jogadores

Na mesa online, o navegador do mestre gera uma cópia do mapa com as células sob
névoa apagadas e a envia ao servidor (`uso: mapa-jogadores`). O servidor só
entrega essa cópia aos jogadores e só enquanto ela cobre toda a névoa atual; ao
ocultar uma região nova, o mapa some para os jogadores por um instante até a
cópia nova chegar. Mapas de demonstração são desenhados pelo próprio cliente e
não passam por esse processo (não contêm nada secreto).

## Limitações conhecidas

- Sem desfazer na mesa online (só no modo local).
- A visão é reenviada inteira a cada mudança; adequado a mesas de RPG, não a
  campanhas com dezenas de megabytes de dados.
- Um processo, uma máquina: não há replicação nem balanceamento.
- O mestre precisa estar com a mesa aberta para que o mapa preparado seja
  atualizado quando a névoa muda.
- Jogadores não desenham no mapa nem resolvem combate: pedem ao mestre.
- Resultados de combate marcados como públicos podem citar nomes de PNJs; use
  "Registrar só para o mestre" quando o combatente estiver oculto.
