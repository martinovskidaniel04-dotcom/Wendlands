/**
 * Referências das regras que sustentam cada automação.
 *
 * Cada automação do aplicativo aponta para um id desta tabela. O texto resume a
 * decisão aprovada; a fonte completa (Biblia_wendlands, registros de auditoria)
 * prevalece sobre este resumo.
 */

export type StatusRegra = 'aprovado' | 'pendente' | 'convencao-do-aplicativo';

export interface ReferenciaRegra {
  id: string;
  titulo: string;
  texto: string;
  fonte: string;
  secao: string;
  status: StatusRegra;
  /** Pontos que a fonte deixa em aberto e como o aplicativo se comporta. */
  observacao?: string;
}

const FONTE = 'Biblia_wendlands — Registro de regras aprovadas';

export const REFERENCIAS: Record<string, ReferenciaRegra> = {
  'criacao-atributos': {
    id: 'criacao-atributos',
    titulo: 'Atributos na criação',
    texto:
      'FIS, DES, MEN e YAN começam em zero; distribuir 8 pontos, máximo +4 na criação. Esquecidos distribuem entre FIS/DES/MEN e mantêm YAN 0. Nos níveis 5, 10, 15 e 20, +1 em um atributo, teto +6.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Base do sistema',
    status: 'aprovado',
  },
  origem: {
    id: 'origem',
    titulo: 'Origem do personagem',
    texto:
      'd20: 1–14 Normal; 15–20 Luzionne ou Esquecido. O registro também fixa a distribuição final: Normal sem facção 35%, Normal Sangue de Darion 35%, Luzionne 15%, Esquecido 15%. Sangue de Darion não dá poderes nem recursos extras.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Base do sistema',
    status: 'aprovado',
    observacao:
      'Pendente: o prompt antigo de mestre fala em escolha do jogador na faixa 15–20, enquanto o registro fala em segundo sorteio equitativo. O aplicativo oferece as duas formas e registra qual foi usada.',
  },
  'pv-vig': {
    id: 'pv-vig',
    titulo: 'PV e VIG máximos',
    texto:
      'PV: Normal 20 + 2·FIS + 4·(nível−1); Luzionne 18 + 2·FIS + 3·(nível−1); Esquecido 24 + 2·FIS + 5·(nível−1). VIG máxima = 10 + 2·FIS.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › PV e VIG',
    status: 'aprovado',
  },
  'aumento-fis': {
    id: 'aumento-fis',
    titulo: 'Aumento permanente de FIS',
    texto:
      'Cada +1 permanente em FIS soma +2 aos PV e à VIG máximos e atuais, uma única vez, respeitando os máximos.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › PV e VIG',
    status: 'aprovado',
  },
  ry: {
    id: 'ry',
    titulo: 'Reserva de Yant (RY)',
    texto:
      'Reserva fixa: Normal 8 + 1d6; Luzionne o dobro; Esquecidos 0. A reserva não aumenta com o nível.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Yant',
    status: 'aprovado',
  },
  'graus-yant': {
    id: 'graus-yant',
    titulo: 'Graus de Yant',
    texto:
      'Graus I/II/III/IV custam 2/4/7/12 RY. Graus II/III/IV liberados nos níveis 5/10/15. Grau IV é inacessível a Normais com reserva menor que 12. Esquecidos não usam Yant.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Yant',
    status: 'aprovado',
    observacao:
      'A descrição antiga de custo decrescente por eficiência não é aplicada: a divergência aguarda auditoria específica e os custos fixos aprovados prevalecem.',
  },
  'tecnicas-fisicas': {
    id: 'tecnicas-fisicas',
    titulo: 'Técnicas físicas',
    texto:
      'Custos de VIG: Especial 2, Avançada 4, Suprema 7. Avançadas liberadas no nível 5; Supremas no nível 10. A categoria não aprova o conteúdo de nenhuma técnica.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Técnicas físicas',
    status: 'aprovado',
  },
  ataque: {
    id: 'ataque',
    titulo: 'Ataque e defesa',
    texto:
      'Ataque: d20 + atributo contra Defesa = 10 + DES + defesa de equipamento (teto de equipamento +4). Armas leves d4, médias d6, pesadas d8, mais o atributo; 20 natural dobra apenas os dados de dano.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Combate geral; Aud. 73',
    status: 'aprovado',
    observacao:
      'A fonte não diz o que acontece quando o total é exatamente igual à Defesa; nesse caso o aplicativo pede a decisão do mestre.',
  },
  armaduras: {
    id: 'armaduras',
    titulo: 'Armaduras e redução',
    texto:
      'Armaduras leve/média/pesada: defesa +1/+2/+3 e redução 1/2/3; escudo: defesa +1. Esquecidos têm redução natural 3, somada à armadura até 6.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Combate geral',
    status: 'aprovado',
  },
  'forca-bruta': {
    id: 'forca-bruta',
    titulo: 'Força bruta dos Esquecidos',
    texto:
      'Esquecidos rolam 2d20 e ficam com o maior apenas em testes de força bruta pura, não em toda disputa de agarramento. A força ~10× da ambientação não multiplica dano.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Combate geral; Aud. 62 e 73',
    status: 'aprovado',
  },
  rodada: {
    id: 'rodada',
    titulo: 'Rodada e iniciativa',
    texto:
      'Iniciativa d20 + DES. Uma ação principal, um movimento e uma reação por rodada; deslocamento padrão 6 m. Em solo neutro ou tartaruga sem controle, até 3 m.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Combate geral; Deslocamento no solo',
    status: 'aprovado',
    observacao: 'Não há regra aprovada de desempate de iniciativa: o aplicativo pede a decisão do mestre.',
  },
  recuperacao: {
    id: 'recuperacao',
    titulo: 'Recuperação de recursos',
    texto:
      'VIG +3 com ação principal em combate; completa em 10 min de descanso seguro. RY +2 com ação principal; completa em 30 min de descanso seguro. Descanso de 1 h restaura metade dos PV máximos; 8 h restauram tudo.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Recursos e recuperação',
    status: 'aprovado',
  },
  'ry-zero': {
    id: 'ry-zero',
    titulo: 'RY em zero',
    texto: 'RY 0 causa −2 em MEN e YAN até a recuperação.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Recursos e recuperação',
    status: 'aprovado',
    observacao:
      'A aplicação a Esquecidos (RY 0 permanente) está pendente de esclarecimento: o aplicativo não aplica a penalidade a eles.',
  },
  'zero-pv': {
    id: 'zero-pv',
    titulo: 'A 0 PV',
    texto:
      'A 0 PV o personagem fica incapacitado. Estabilizar: ação principal de alguém adjacente, MEN CD 12. Sem estabilização: teste de FIS CD 10 no próprio turno; três sucessos estabilizam, três falhas deixam em estado crítico exigindo ajuda, sem morte instantânea.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Recursos e recuperação',
    status: 'aprovado',
  },
  carga: {
    id: 'carga',
    titulo: 'Carga',
    texto: 'Normal/Luzionne: 8 + 2·FIS espaços; Esquecidos: 16 + 4·FIS espaços.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Outras regras de campanha',
    status: 'aprovado',
  },
  'equipamento-inicial': {
    id: 'equipamento-inicial',
    titulo: 'Equipamento inicial',
    texto: '150 Cr, arma básica, armadura leve, rações, água, lanterna e primeiros socorros.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Outras regras de campanha',
    status: 'aprovado',
  },
  transicoes: {
    id: 'transicoes',
    titulo: 'Transições de agarramento',
    texto:
      'Transições fundamentais usam ação principal e teste oposto d20 + FIS ou DES, conforme a abordagem anunciada por cada parte e validada pelo mestre antes da rolagem. A resistência não consome reação. Empate preserva a posição.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Posições e testes; Aud. 70–74',
    status: 'aprovado',
  },
  quedas: {
    id: 'quedas',
    titulo: 'Quedas',
    texto:
      'O atacante declara antes do teste se acompanha a queda. Margem ≤ 0: sem queda. +1 a +3: queda sem controle. ≥ +4: queda com controle inicial se houver acompanhamento e compatibilidade com a abordagem. Sem acompanhamento, o atacante permanece em pé. Montada e costas não são obtidas automaticamente.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Quedas',
    status: 'aprovado',
  },
  'guardas-raspagens': {
    id: 'guardas-raspagens',
    titulo: 'Guardas, passagens e raspagens',
    texto:
      'Entrar em guarda desde solo neutro ou recuperá-la sob controle custa ação principal e teste oposto. Passagem fundamental bem-sucedida pode chegar a controle lateral. Raspagem: +1 a +3 inverte a relação superior/inferior sem controle lateral automático; ≥ +4 pode resultar em controle lateral se compatível. Nenhuma passagem ou raspagem concede dano ou ataque gratuito.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Guardas e raspagens',
    status: 'aprovado',
    observacao:
      'Interpretação do aplicativo, a confirmar: a inversão de +1 a +3 troca os papéis dentro do mesmo vínculo de guarda. O mestre pode ajustar manualmente.',
  },
  escapes: {
    id: 'escapes',
    titulo: 'Escapes',
    texto:
      'Controle lateral — escape: margem ≥ +1 leva a solo neutro; reversão: +1 a +3 leva a solo neutro sem inversão, ≥ +4 produz inversão simples sem controle lateral automático. Montada, costas e norte-sul: +1 a +3 alcança o destino defensivo intermediário declarado e validado antes do teste; ≥ +4 leva a solo neutro. Não há reversões fundamentais aprovadas para essas três posições.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Escapes',
    status: 'aprovado',
  },
  tartaruga: {
    id: 'tartaruga',
    titulo: 'Tartaruga',
    texto:
      'Estado transitório próprio, com controle adversário registrado separadamente. Sem oposição efetiva, sair para solo neutro custa ação principal sem teste; com oposição, ação principal e teste oposto. A postura não apaga controles já estabelecidos.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Tartaruga',
    status: 'aprovado',
  },
  levantar: {
    id: 'levantar',
    titulo: 'Levantar-se',
    texto:
      'Somente desde solo neutro, gastando ação principal. Sem oposição efetiva não há teste; com oposição, teste oposto. Controles precisam ser resolvidos antes. A resistência é puramente defensiva: vitória do opositor ou empate mantêm o personagem em solo neutro.',
    fonte: FONTE,
    secao: 'Auditorias 1–41 › Levantar-se',
    status: 'aprovado',
  },
  'guarda-contador': {
    id: 'guarda-contador',
    titulo: 'Duração da guarda',
    texto:
      'A guarda dura no máximo duas ações principais compartilhadas pelos dois participantes. Ações especializadas contam para o mesmo limite. A segunda ação resolve integralmente antes da expiração. Ao expirar, ambos passam a solo neutro sem controle, ataque, dano ou raspagem grátis. Mudar a subcategoria preserva identidade e contador.',
    fonte: FONTE,
    secao: 'Auditorias 42–49',
    status: 'aprovado',
    observacao:
      'Interpretação do aplicativo, a confirmar: a ação que estabelece a guarda não conta; contam as ações principais de qualquer dos dois enquanto a guarda existe.',
  },
  'guarda-deslocamento': {
    id: 'guarda-deslocamento',
    titulo: 'Movimento e guarda',
    texto:
      'Movimento ordinário não rompe nem altera guarda ou controle. Deslocamento conjunto em guarda de até 2 m requer ação principal e teste resistido; é limitado por obstáculos e não concede bônus, dano, posição, VIG ou ação gratuita. Derrota ou empate mantêm o estado.',
    fonte: FONTE,
    secao: 'Auditorias 42, 43 e 45',
    status: 'aprovado',
  },
  reentrada: {
    id: 'reentrada',
    titulo: 'Reentrada de guarda',
    texto:
      'Após a expiração automática (ou interferência externa bem-sucedida), cada participante precisa consumir uma ação principal que não seja tentar iniciar guarda contra o mesmo oponente antes de reentrar. O intervalo é por combatente e por oponente; persiste apesar de distância, postura ou passagem de turnos. Movimento, reação, inação e ação inválida não o satisfazem.',
    fonte: FONTE,
    secao: 'Auditorias 50–55',
    status: 'aprovado',
  },
  interferencia: {
    id: 'interferencia',
    titulo: 'Interferência externa',
    texto:
      'Um terceiro pode interferir em guarda alheia com sua ação principal e teste resistido contra um único defensor direto escolhido antes do teste. Vitória encerra somente a guarda A–B e põe ambos em solo neutro sem controle; o terceiro não ganha controle. Empate ou derrota preservam guarda e contador. A interferência não conta no contador A–B e satisfaz os intervalos pendentes do próprio terceiro.',
    fonte: FONTE,
    secao: 'Auditorias 56–69',
    status: 'aprovado',
  },
  'tecnica-execucao': {
    id: 'tecnica-execucao',
    titulo: 'Execução de técnica especializada',
    texto:
      'Declarar técnica, alvo, objetivo e abordagem antes do teste; o mestre valida aprendizado, requisitos, posição, alcance, ação e VIG. Inválida antes do início não gasta ação nem VIG. O início legítimo compromete a ação principal e a VIG total da categoria; derrota ou empate não reembolsam.',
    fonte: FONTE,
    secao: 'Auditorias 70–78',
    status: 'aprovado',
  },
  'convencao-medicao': {
    id: 'convencao-medicao',
    titulo: 'Medição no mapa',
    texto:
      'A medição padrão é em linha reta, convertida em metros pela calibração da cena. Contagens por células são convenções opcionais da mesa.',
    fonte: 'Aplicativo',
    secao: 'Configuração da cena',
    status: 'convencao-do-aplicativo',
    observacao: 'Não existe regra de diagonais aprovada em Wendlands.',
  },
};

export function referencia(id: string): ReferenciaRegra | null {
  return REFERENCIAS[id] ?? null;
}
