# Fontes, precedência e conflitos

Documento interno. A mesa mostra linguagem de jogo; os detalhes de auditoria só
aparecem quando o usuário abre a referência de uma regra (ícone ⓘ).

## Fontes usadas

| Fonte | Papel no aplicativo |
| --- | --- |
| WENDLANDS — Bíblia da História e do Mundo (cânone consolidado) | História, mundo e decisões autorais posteriores (dossiês 001–024) |
| Biblia_wendlands (com registros de auditoria 1–132) | Mecânica: tudo o que é automatizado vem daqui |
| Prompt_Mestre_Grok | Contexto histórico; não anula auditorias. Origem de "O Fosso" |
| Prólogo — Capítulos I, II e III | Texto literário atual; não gera fatos novos por si só |
| Biblia_wendlands.pdf | Versão anterior da Bíblia, sem os suplementos mecânicos |

A conversa "Acesso ao Drive" **não** fez parte do material recebido: só havia
trechos de contexto. Nada neste projeto afirma tê-la lido na íntegra.

Os documentos originais não foram alterados. Toda organização aqui é do novo projeto.

## Regras de precedência aplicadas

1. Decisões explícitas atuais do autor valem mais que qualquer registro.
2. Dentro dos documentos, a correção ou aprovação posterior e específica vale
   mais que o registro anterior do mesmo ponto.
3. História: Bíblia consolidada. Mecânica: registros de auditoria.
4. Proposta, rejeição e pendência são estados preservados individualmente —
   constar num registro não é estar aprovado.
5. Descrição narrativa não vira cálculo (força ~10× não é dano 10×; a narração
   de uma execução não aprova uma finalização).

## Onde cada coisa vive no código

| Assunto | Arquivo |
| --- | --- |
| Texto, fonte, seção e situação de cada regra automatizada | `src/dominio/regras/referencias.ts` |
| Fórmulas de ficha (PV, VIG, RY, defesa, redução, carga) | `src/dominio/regras/ficha.ts` |
| Origem e reserva de Yant | `src/dominio/regras/origem.ts` |
| Combate, agarramento, guardas, reentrada, interferência | `src/dominio/regras/combate.ts` |
| Catálogo LET-ESP com versão, auditoria e situação | `src/dominio/regras/tecnicas.ts` |
| Compêndio embutido (cenário geral e regras) | `src/dominio/compendio/semente.ts` |

Cada automação cita o id da regra que a sustenta; os testes em `testes/`
conferem os exemplos de comportamento do pedido original.

## Conflitos não resolvidos (registrados, não decididos)

| Ponto | Divergência | Comportamento do aplicativo |
| --- | --- | --- |
| Expurgatio | Evento cíclico (Bíblia original, §9) × organização de elite (compilação, §8) | A entrada do compêndio traz as duas descrições e marca a divergência |
| Opartyn / Oparthyn | Grafias diferentes entre Bíblia e dossiês | Texto da fonte ao citar; a busca aceita as duas para a mesma entrada, sem criar facção nova |
| Custo de Yant | Texto antigo: eficiência reduz custo com o nível × auditorias: custo fixo 2/4/7/12 | Só o custo fixo é aplicado; nenhum desconto automático |
| Origem (faixa 15–20 e facção) | Registro: segundo sorteio equitativo (35/35/15/15) × prompt antigo: escolha do jogador | As duas formas ficam disponíveis; a ficha registra qual foi usada |
| Atributos | Prompt antigo: −2 a +5 × auditorias: base 0, 8 pontos, teto +4 (teto +6 com níveis) | Vale a auditoria; a criação manual do mestre é permitida e sinalizada |
| Esquecidos em agarramento | Prompt antigo: "multiplicador massivo" × auditorias: 2d20 (maior) só em força bruta pura | Vale a auditoria |
| RY 0 | −2 MEN/YAN; aplicação a Esquecidos pendente | Não aplicada a Esquecidos; a ficha explica |
| Gartio | Um registro grafou "Gardio" | Corrigido pelo autor: Gartio, estilo de combate |
| Nascimento de Luciel | Wenor Baixa (registro inicial) × Wenor Alta (correção) | Vale a correção (conteúdo do pacote do mestre) |

## Pendências mecânicas respeitadas

- LET-ESP-016 v0.2 (Auditoria 132): pendente — não executa, não consome recurso.
- LET-ESP-010 v0.1 (Auditoria 121): rejeitada — código reservado, não executa.
- 12 técnicas aprovadas sem ficha reproduzida nas fontes (003–009, 011–015):
  "Aprovada — resolução manual". O aplicativo registra ação principal e 2 VIG;
  requisitos, teste e resultado ficam com o mestre. Nada é reconstruído pelo nome.
- Sem regras aprovadas de ataque de oportunidade, bônus posicionais,
  finalizações, reações novas, ações extras ou transições gratuitas.
- Decisões de sessão do mestre são anotações: não mudam a situação de nenhuma regra.

## Interpretações de implementação a confirmar com o autor

Pontos em que a fonte não fecha o detalhe e o aplicativo precisou escolher um
comportamento. Todos podem ser ajustados manualmente pelo mestre na mesa.

1. **Contador da guarda.** A ação que estabelece a guarda não conta; contam as
   ações principais de qualquer dos dois enquanto a guarda existe (inclusive um
   ataque comum). A segunda ação resolve por inteiro antes da expiração.
2. **Raspagem com margem +1 a +3.** "Inverte a relação superior/inferior" foi
   implementado como troca de papéis dentro do mesmo vínculo de guarda (mesma
   identidade e contador).
3. **Reversão de controle lateral com margem ≥ +4.** "Inversão simples, sem
   controle lateral automático": o controle termina e ambos ficam em solo
   neutro; a inversão é narrativa.
4. **Total igual à Defesa ou à CD.** A fonte não define. O ataque oferece ao
   mestre "considerar acerto" ou "considerar erro"; nos testes de estabilização
   o empate não muda o contador e o histórico pede a decisão.
5. **Destinos intermediários** de escapes de montada/costas/norte-sul: a lista
   oferecida (guardas, tartaruga, controle lateral, outro) é uma conveniência de
   registro, validada pelo mestre antes do teste.
6. **Aumento de FIS.** "+2 PV e VIG atuais uma única vez" é garantido porque o
   aumento de cada nível (5, 10, 15, 20) só pode ser registrado uma vez.
7. **Medição.** Linha reta em metros por padrão; contagens por célula são
   convenções opcionais da mesa. 1,5 m por célula é padrão do aplicativo, não regra.
8. **Dano sem arma.** Não há dado de dano aprovado: o mestre informa o valor.

## Segredos do mestre

A paternidade de Luciel, o prólogo e os dossiês narrativos **não** estão no
código nem no bundle. Eles foram reunidos num pacote separado
(`pacote-do-mestre/`, ignorado pelo Git) que o mestre importa em
Compêndio → Importar pacote; as entradas entram como "somente mestre".

O compêndio embutido contém apenas o cenário geral e as referências de regras,
e nenhuma entrada é liberada aos jogadores automaticamente. Um teste
(`testes/permissoes.teste.ts`) falha se nomes dos dossiês aparecerem no conteúdo embutido.

Campos de aparência não documentados ficam vazios. Mapas, retratos, paleta e o
glifo de Galleone são proposta visual, não cânone. Nenhum protagonista
(Centryn, Majok e outros) recebe estatísticas jogáveis.
