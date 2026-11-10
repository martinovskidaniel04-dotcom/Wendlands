/**
 * Compêndio embutido: cenário geral e referências de regras.
 *
 * O que NÃO está aqui, de propósito: dossiês narrativos, prólogo, paternidade de
 * personagens e acontecimentos futuros. Esses segredos do mestre não fazem parte
 * do bundle; entram na campanha apenas por importação do pacote do mestre.
 *
 * Nenhuma entrada embutida é liberada automaticamente aos jogadores: a liberação
 * é uma decisão do mestre, entrada por entrada ou em lote.
 */
import type { CategoriaCompendio, EntradaCompendio, StatusCompendio } from '../esquema';
import { REFERENCIAS } from '../regras/referencias';
import { CATALOGO_TECNICAS, rotuloAutomacao } from '../regras/tecnicas';

const CONSOLIDADO = 'WENDLANDS — Bíblia da História e do Mundo (cânone consolidado)';
const BIBLIA = 'Biblia_wendlands — Bíblia do Mundo: O Iluminado';
const PROMPT_ANTIGO = 'Prompt_Mestre_Grok (prompt antigo de mestre; contextual)';

function entrada(
  id: string,
  titulo: string,
  categoria: CategoriaCompendio,
  status: StatusCompendio,
  fonte: string,
  secao: string,
  resumo: string,
  corpo: string[],
  extra: Partial<Pick<EntradaCompendio, 'aliases' | 'conflitos' | 'versao' | 'aparencia'>> = {},
): EntradaCompendio {
  return {
    id,
    titulo,
    categoria,
    resumo,
    corpo,
    fonte,
    secao,
    versao: extra.versao ?? '',
    status,
    visibilidade: 'mestre',
    aliases: extra.aliases ?? [],
    aparencia: extra.aparencia ?? '',
    conflitos: extra.conflitos ?? [],
  };
}

const CENARIO: EntradaCompendio[] = [
  // ── História e cosmologia ──
  entrada('noite-eterna', 'Noite eterna', 'historia', 'canone', CONSOLIDADO, '§1 Cosmologia, noite e origem',
    'Wendlands vive em noite eterna; a principal fonte de luz é Galleone.',
    [
      'Wendlands vive em noite eterna. Sua principal fonte de iluminação é Galleone, um corpo celeste surgido de uma fissura universal após uma guerra brutal entre clãs antigos.',
      'O mundo combina tecnologia avançada, artefatos de Yant e uma ordem social marcada por subjugação e escravidão.',
      'A cronologia exata da guerra, as causas da fissura e a natureza precisa de Galleone ainda não foram definidas.',
    ]),
  entrada('galleone', 'Galleone', 'historia', 'canone', CONSOLIDADO, '§1 e §13',
    'Corpo celeste associado à fissura universal e à noite eterna.',
    [
      'Corpo celeste surgido de uma fissura universal depois da guerra entre clãs antigos; ilumina a noite eterna.',
      'A ideia de que Galleone teria "roubado o sol" pertence à crença do Sangue de Darion; não é uma explicação cosmológica comprovada.',
      'A aparência física precisa do astro não foi definida. O glifo usado na interface é apenas uma proposta gráfica.',
    ]),
  entrada('coracao-de-galleone', 'Coração de Galleone', 'historia', 'lenda', CONSOLIDADO, '§1 e §4',
    'Lendas dizem que o coração de Galleone ainda pulsa nas Farlands.',
    [
      'O chamado coração de Galleone é procurado nas Farlands; há lendas de que ele ainda pulsa ali.',
      'Centryn acredita que obtê-lo lhe daria uma reserva ilimitada de Yant. Essa expectativa faz parte do plano dele; não prova que a obtenção ou os efeitos prometidos sejam inevitáveis.',
      'A relação física entre Galleone e seu coração é uma lacuna.',
    ]),
  entrada('guerra-antiga', 'Guerra santa antiga', 'historia', 'canone', CONSOLIDADO, '§1, §4 e §12',
    'Conflito devastador entre clãs antigos, contexto do surgimento da fissura universal.',
    [
      'Guerra brutal entre clãs antigos, anterior ao surgimento de Galleone. As Farlands carregam suas marcas.',
      'Cronologia, causas específicas e quem ou o que provocou a fissura universal permanecem pendentes.',
    ],
    { aliases: ['guerra brutal', 'guerra dos clãs'] }),
  entrada('sequencia-historica', 'História conhecida — sequência relativa', 'historia', 'canone', CONSOLIDADO, '§12',
    'Ordem relativa dos grandes acontecimentos; não é uma cronologia datada.',
    [
      '1. Era dos clãs antigos: grupos ancestrais e tensões que antecedem a grande guerra; datas desconhecidas.',
      '2. Guerra brutal / guerra santa antiga: contexto do surgimento da fissura universal.',
      '3. Surgimento de Galleone e noite eterna: não há data canônica.',
      '4. Formação e consolidação da ordem de Wenor: divisão Alta/Baixa, poder senatorial e supremacia Luzionne.',
      '5. Resistências e repressão histórica: destaque para Practius, o Louco.',
      '6. Presente da campanha: Centryn preside o Senado e pretende organizar a grande expedição às Farlands.',
      'A ordem acima organiza o material disponível; não confirma todos os nexos causais.',
    ]),
  entrada('misterios', 'Mistérios e pontos a desenvolver', 'historia', 'lacuna', CONSOLIDADO, '§14',
    'Lacunas declaradas do cenário. Nenhuma é fato aprovado.',
    [
      'Origem e objetivos dos clãs antigos; natureza da guerra santa; quem ou o que provocou a fissura universal; existência e natureza do sol anterior; relação física entre Galleone e seu coração.',
      'Origem exata de Wenor e da ponte; composição detalhada do Senado; história institucional da Expurgatio; cronologia e sucessões dos clãs; identidade histórica de Darion.',
      'Resistência dos Esquecidos antes e depois de Practius; geografia detalhada das Farlands; rotas, cidades e culturas externas; economia e cotidiano; calendário, religiões, línguas e costumes.',
      'Todos esses pontos são lacunas: devem ser discutidos com o autor antes de ingressar no cânone.',
    ]),

  // ── Yant ──
  entrada('yant', 'Yant', 'yant', 'canone', CONSOLIDADO, '§2 Yant — energia, polaridades e limites',
    'Energia sobrenatural do cenário, com reserva inata e duas polaridades.',
    [
      'A reserva de Yant (RY) é inata e associada ao nascimento; a Bíblia original a descreve como de tamanho imutável.',
      'Yant positivo: ordem, construção, proteção e contenção. Yant negativo: entropia, ruptura, combustão, destruição e libertação. As polaridades não equivalem automaticamente a bondade e maldade.',
      'A exaustão por esgotamento de RY é relevante no mundo.',
    ],
    {
      aliases: ['RY', 'reserva de Yant', 'magia'],
      conflitos: [
        'A descrição original fala em eficiência crescente e custo decrescente com o nível; a mecânica posterior aprovou custos fixos por grau. A harmonização depende de auditoria específica e o aplicativo aplica apenas os custos fixos.',
      ],
    }),
  entrada('limites-absolutos', 'Limites absolutos do Yant', 'yant', 'canone', BIBLIA, '§3 Limites absolutos',
    'Não se altera o passado, não se leem mentes e a necromancia cobra um preço permanente.',
    [
      'Ecos temporais permitem observar vestígios do passado, nunca modificá-lo.',
      'Leitura de mentes é impossível.',
      'A necromancia existe, mas os mortos reanimados consomem permanentemente a reserva de Yant do conjurador enquanto existirem.',
    ],
    { aliases: ['ecos', 'necromancia', 'leitura de mentes', 'viagem no tempo'] }),

  // ── Locais ──
  entrada('wenor', 'Wenor City', 'local', 'canone', CONSOLIDADO, '§3 Wenor — a cidade-estado dividida',
    'Cidade-estado colossal, descrita como a maior do planeta.',
    ['Sua organização materializa a divisão social entre Wenor Alta e Wenor Baixa, ligadas pela Ponte de Wenor.'],
    { aliases: ['megacidade', 'Wenor'] }),
  entrada('wenor-alta', 'Wenor Alta', 'local', 'canone', CONSOLIDADO, '§3',
    'Área da elite nobre Luzionne: iluminação, infraestrutura impecável e privilégios.',
    [
      'A educação de setores da elite ensina, desde a infância, superioridade hereditária e desprezo pelos pobres e pelos Esquecidos.',
    ]),
  entrada('wenor-baixa', 'Wenor Baixa', 'local', 'canone', CONSOLIDADO, '§3',
    'Região de pobreza, sombras e opressão, onde se concentram Normais e Esquecidos.',
    [
      'Espaços claustrofóbicos. A diferença em relação a Wenor Alta é política, econômica, cultural e física.',
      'O mapa "Wenor Baixa" do aplicativo é uma demonstração: sua geometria não define a localização oficial de nenhum lugar.',
    ]),
  entrada('ponte-de-wenor', 'Ponte de Wenor', 'local', 'canone', CONSOLIDADO, '§3',
    'Liga Wenor Alta e Wenor Baixa; cerca de dez quilômetros, vigiada por defesas letais.',
    [
      'É sustentada por magia ancestral ligada a Galleone e rigidamente protegida por defesas Luzionne.',
      'A descrição histórica registra a repressão letal de travessias a pé não autorizadas, sem distinção de quem tenta atravessar.',
      'Protocolos de circulação autorizada, logística e exceções administrativas não estão detalhados.',
    ]),
  entrada('farlands', 'Farlands', 'local', 'canone', CONSOLIDADO, '§4 Farlands — fronteira e memória da guerra',
    'Terras devastadas que cercam Wenor e carregam as marcas da antiga guerra santa.',
    [
      'Perigosas: radiação residual, ruínas, acampamentos de nobres, experimentos descartados e criaturas aberrantes.',
      'Importantes para exploradores, rebeldes e para os planos de Centryn. Rumores situam ali o coração de Galleone.',
      'Não existe ainda uma lista canônica de cidades perdidas, rotas, reinos ou datas.',
    ]),
  entrada('o-fosso', 'O Fosso', 'local', 'contexto', PROMPT_ANTIGO, 'A cena inicial',
    'Arena clandestina nos níveis inferiores da metrópole, proposta como cena inicial no prompt antigo.',
    [
      'No prompt antigo de sessão, a Sessão 0 começa numa arena clandestina onde Esquecidos lutam com supressores biológicos ativados; uma explosão causada por sabotadores do Sangue de Darion derruba as luzes e instaura o caos.',
      'É uma opção de cena inicial, não o início obrigatório de toda campanha. O prompt antigo é contextual e está sujeito às correções posteriores.',
    ]),

  // ── Facções e populações ──
  entrada('luzionne', 'Luzionne', 'faccao', 'canone', CONSOLIDADO, '§5 Luzionne — nobreza e clãs primordiais',
    'Elite política e social, descendente dos clãs primordiais Gionatte, Matior e Opartyn.',
    [
      'Possuem reservas de Yant muito superiores às dos Normais.',
      'A supremacia hereditária é uma doutrina de setores dominantes, não uma verdade moral do cenário.',
    ],
    { aliases: ['nobres', 'elite'] }),
  entrada('cla-gionatte', 'Clã Gionatte', 'faccao', 'canone', CONSOLIDADO, '§5',
    'Associado ao poder ocular raríssimo Horologium temporis.',
    [
      'O Horologium temporis cria uma barreira espacial de distância aparentemente infinita. A defesa também atua contra Esquecidos, que não possuem Yant.',
      'É um poder lendário reservado a personagens não jogadores. Definir o clã de uma ficha como Gionatte não o concede.',
    ],
    { aliases: ['Horologium temporis', 'Gionatte'] }),
  entrada('cla-matior', 'Clã Matior', 'faccao', 'canone', CONSOLIDADO, '§5',
    'Clã marcado pela arrogância e pela Ideologia Perfecta; poder hereditário Tancto.',
    [
      'A Ideologia Perfecta é uma doutrina extremista de supremacia.',
      'Tancto manifesta pontos vazios, semelhantes a pequenos buracos negros, que perseguem alvos e exigem enorme energia. A tradição registra uma manifestação hereditária rara, aproximadamente a cada cem anos.',
      'O desenvolvimento de pontos zeros maiores pertence a figuras lendárias. A versão jogável é limitada a um uso por combate e causa exaustão.',
    ],
    { aliases: ['Tancto', 'Ideologia Perfecta', 'Matior', 'pontos vazios'] }),
  entrada('cla-opartyn', 'Clã Opartyn', 'faccao', 'canone', CONSOLIDADO, '§5',
    'Clã aristocrático com uma corrente favorável à coexistência pacífica; poder Herodes.',
    [
      'Sua corrente política favorável à coexistência é frequentemente derrotada pela maioria supremacista do Senado.',
      'Herodes cria uma dimensão pessoal moldada pelo portador, acessível mediante gesto, podendo envolver o próprio usuário ou um adversário.',
      'A tradição de transmissão envolve um ritual de sucessão violento em intervalos aproximados de cinquenta anos; se o portador morrer fora das condições previstas, registra-se uma interrupção superior a mil anos.',
      'A versão jogável admite um uso por combate, sem exaustão.',
    ],
    {
      aliases: ['Herodes', 'Opartyn', 'Oparthyn'],
      conflitos: [
        'Grafia: as fontes usam "Opartyn" (Bíblia e compilação) e "Oparthyn" (registros posteriores). A divergência não está resolvida; a busca aceita as duas formas para a mesma entrada.',
      ],
    }),
  entrada('senado-de-wenor', 'Senado de Wenor', 'faccao', 'canone', CONSOLIDADO, '§6 O Senado e a estrutura de poder',
    'Órgão governamental supremo; aprova as leis.',
    [
      'A configuração descrita contempla um assento para o representante principal de cada um dos três clãs e dez assentos destinados a integrantes dos partidos de cada clã.',
      'A interpretação exata da distribuição desses dez assentos e as regras eleitorais ainda exigem definição.',
      'A maioria sustenta a ordem hierárquica e a repressão; a existência de dissidentes, sobretudo no clã Opartyn, impede reduzir a aristocracia a uma única posição.',
    ]),
  entrada('expurgatio', 'Expurgatio', 'faccao', 'canone', CONSOLIDADO, '§8 Expurgatio e aparato de repressão',
    'Ligado à projeção de poder de Wenor sobre a população subordinada.',
    [
      'Compilação consolidada: organização de elite ligada à ordem dominante. Estrutura de comando, origem, graus, efetivo, símbolos e relação formal com Senado e clãs não foram estabelecidos.',
      'Bíblia original (§9): evento cíclico em que soldados de elite, pelo trem expresso blindado que cruza a Ponte de Wenor, invadem Wenor Baixa para controle populacional e sequestros em massa.',
    ],
    {
      conflitos: [
        'Divergência não solucionada: a Bíblia original descreve o Expurgatio como evento cíclico; a compilação consolidada o descreve como organização. As duas descrições ficam registradas até decisão do autor.',
      ],
    }),
  entrada('normais', 'Normais', 'faccao', 'canone', CONSOLIDADO, '§9 Populações, opressão e resistência',
    'A maior parte da população, com reservas de Yant relativamente pequenas.',
    ['Muitos vivem sob medo e subordinação. A elite realiza experimentos cruéis com Normais de baixo Yant e descarta cobaias nas Farlands.']),
  entrada('esquecidos', 'Esquecidos', 'faccao', 'canone', CONSOLIDADO, '§9',
    'Nascem sem Yant; sofrem discriminação severa, escravidão e controle de reprodução.',
    [
      'A força e a densidade aproximadamente dez vezes maiores são um traço de ambientação: não multiplicam automaticamente o dano de armas.',
      'Resistência física, treinamento e organização são centrais à sua luta pela sobrevivência.',
      'Não possuem aura mágica nem feitiços. A ausência de Yant não permite atravessar o Horologium temporis.',
    ],
    {
      conflitos: [
        'O prompt antigo falava em "multiplicador massivo" nos testes de FIS; as auditorias aprovaram apenas 2d20 (maior) em força bruta pura. Vale a auditoria.',
      ],
    }),
  entrada('sangue-de-darion', 'Sangue de Darion', 'faccao', 'crenca', CONSOLIDADO, '§9',
    'Organização clandestina e religiosa com uma leitura dissidente da história oficial.',
    [
      'Acredita que Darion tentou impedir Galleone de roubar o sol. Atua nas sombras.',
      'O papel histórico real de Darion, a veracidade da crença e a organização interna da facção permanecem abertos.',
      'Pertencer à facção não concede bônus, poderes ou recursos extras.',
    ]),

  // ── Personagens históricos ──
  entrada('centryn', 'Centryn', 'personagem', 'canone', CONSOLIDADO, '§7 Centryn — presidente do Senado e antagonista',
    'Presidente do Senado de Wenor, híbrido raríssimo Gionatte–Matior e antagonista central.',
    [
      'Tem acesso ao Horologium temporis e ao Tancto, mas não pode ativá-los ao mesmo tempo: a sobrecarga de Yant o destruiria. A tecnologia do cenário não contorna essa limitação.',
      'Concebido como deliberadamente cruel, sem passado trágico que justifique sua conduta. Deseja eliminar aqueles que considera inferiores.',
      'Dois limites o contêm: a necessidade de aprovação do Senado e a limitação física ao uso conjunto dos poderes. Busca autorização para uma grande expedição às Farlands a fim de recuperar o coração de Galleone.',
      'O aplicativo não atribui estatísticas jogáveis a Centryn.',
    ]),
  entrada('practius', 'Practius, o Louco', 'personagem', 'canone', CONSOLIDADO, '§12 e §13',
    'Antigo portador notório de Tancto.',
    ['Esmagou a resistência dos Esquecidos e ajudou a consolidar o sistema escravista. Datas e circunstâncias exatas estão pendentes.']),
  entrada('darion', 'Darion', 'personagem', 'crenca', CONSOLIDADO, '§13',
    'Figura evocada pela crença do Sangue de Darion.',
    ['A facção afirma que tentou impedir Galleone de roubar o sol. Sua biografia factual ainda não foi estabelecida.']),

  // ── Tecnologia e materiais ──
  entrada('sem-cibernetica', 'Tecnologia e armas', 'material', 'canone', CONSOLIDADO, '§10 Tecnologia, materiais e cultura de combate',
    'Tecnologia avançada e artefatos, sem implantes; armas brancas seguem relevantes.',
    [
      'Wendlands não utiliza implantes ou cibernética para aprimoramento físico permanente.',
      'Espadas, rapieiras, katanas, adagas e machados continuam relevantes e podem receber encantamentos de Yant.',
    ],
    { aliases: ['cibernética', 'implantes', 'armas brancas', 'encantamentos'] }),
  entrada('yantita-amarion', 'Yantita e Amarion', 'material', 'canone', CONSOLIDADO, '§10',
    'Metais raros de alta resistência e condutividade de Yant.',
    ['Associados ao acesso privilegiado dos nobres.']),
  entrada('oniok-sucata', 'Pedras de Oniok e sucata', 'material', 'canone', CONSOLIDADO, '§10',
    'Materiais dos rebeldes.',
    ['As pedras de Oniok são por vezes obtidas em acampamentos nobres nas Farlands.']),
  entrada('armaduras-de-exterminio', 'Armaduras de extermínio', 'material', 'canone', CONSOLIDADO, '§8',
    'Armaduras pesadas dos soldados Luzionne, usadas em formação.',
    [
      'A doutrina privilegia captura, contenção e superioridade coletiva para conter Esquecidos fisicamente superiores, incluindo aplicações de Yant conhecidas como Setas de Forja e Roubo Reluzente.',
    ],
    { aliases: ['Setas de Forja', 'Roubo Reluzente'] }),
  entrada('armaduras-marciais', 'Armaduras marciais dos Esquecidos', 'material', 'canone', BIBLIA, '§7 Arsenal, materiais e artes marciais',
    'Armaduras táticas modulares concebidas para preservar mobilidade.',
    ['Complementam os estilos de luta sem sacrificar a mobilidade do combate corporal.']),

  // ── Artes marciais ──
  entrada('gartio', 'Gartio', 'tecnica', 'canone', CONSOLIDADO, '§10',
    'Tradição marcial dos Esquecidos centrada em esquivas e golpes.',
    [
      'A Bíblia original a compara ao boxe: esquiva e golpes explosivos.',
      'Escolher um estilo principal não dá bônus mecânico. Descrições culturais não aprovam efeitos nem técnicas.',
    ],
    { conflitos: ['Um registro grafou "Gardio"; o autor corrigiu para Gartio, que é uma modalidade de combate, não uma ordem ou cargo.'] }),
  entrada('corpo-armado', 'Corpo Armado', 'tecnica', 'canone', CONSOLIDADO, '§10',
    'Tradição marcial centrada em clinch e uso integrado do corpo.',
    ['A Bíblia original a compara ao Muay Thai. Sem bônus mecânico pela escolha do estilo.']),
  entrada('letalitas', 'Letalitas', 'tecnica', 'canone', CONSOLIDADO, '§10',
    'Tradição marcial centrada em luta agarrada, projeções, guardas e controle de solo.',
    [
      'A narrativa a associa à neutralização de conjuradores; a Bíblia original a compara ao jiu-jitsu brasileiro.',
      'Menções culturais a chaves e estrangulamentos (como o Ezequiel) não constituem aprovação de finalizações: não há finalizações específicas aprovadas.',
      'É o estilo com técnicas especializadas individualmente aprovadas até a pausa das auditorias (códigos LET-ESP).',
    ]),

  // ── Bestiário ──
  entrada('minhoca-de-yant', 'Minhoca de Yant', 'bestiario', 'canone', CONSOLIDADO, '§11 Experimentos e bestiário das Farlands',
    'Criatura raríssima e de grande porte, com relatos de até cem metros.',
    [
      'Não é comumente vista perto de Wenor: habita regiões mais profundas das Farlands, o que não torna sua presença nas proximidades absolutamente impossível.',
      'Lendas dizem que se move em direção ao coração de Galleone, atraída pela energia concentrada. Essa motivação não está comprovada.',
    ]),
  entrada('massas-de-podridao', 'Massas de podridão', 'bestiario', 'canone', CONSOLIDADO, '§11',
    'Humanoides deformados e cegos que percebem assinaturas de Yant.',
    ['Perseguem conjuradores.']),
  entrada('vermes-de-carne', 'Vermes de carne', 'bestiario', 'canone', CONSOLIDADO, '§11',
    'Parasitas que se fixam em hospedeiros e drenam suas reservas de Yant.',
    ['A drenagem é progressiva.']),
  entrada('mascara-de-osso', 'Máscara de osso', 'bestiario', 'canone', BIBLIA, '§8 Bestiário e aberrações',
    'Criaturas extremamente rápidas e fortes que caçam exclusivamente Esquecidos.',
    ['Ignoram os usuários de Yant.']),
];

const STATUS_DA_TECNICA: Record<string, StatusCompendio> = {
  aprovada: 'aprovado',
  'nao-aprovada': 'nao-aprovado',
  rejeitada: 'rejeitado',
  pendente: 'pendente',
};

const TECNICAS: EntradaCompendio[] = CATALOGO_TECNICAS.map((t) =>
  entrada(
    t.codigo.toLowerCase(),
    `${t.codigo} ${t.nome}`,
    'tecnica',
    STATUS_DA_TECNICA[t.status],
    'Biblia_wendlands — registros de auditoria',
    t.auditoria,
    `Letalitas · Especial · ${rotuloAutomacao(t)}.`,
    [t.nota, ...(t.resolucao ?? [])],
    { versao: t.versao, aliases: [t.nome, t.codigo.replace(/-/g, ' ')] },
  ),
);

const REGRAS: EntradaCompendio[] = Object.values(REFERENCIAS).map((r) =>
  entrada(
    `regra-${r.id}`,
    r.titulo,
    'regra',
    r.status === 'aprovado' ? 'aprovado' : r.status === 'pendente' ? 'pendente' : 'contexto',
    r.fonte,
    r.secao,
    r.texto.length > 160 ? `${r.texto.slice(0, 157)}…` : r.texto,
    r.observacao ? [r.texto, `Observação: ${r.observacao}`] : [r.texto],
  ),
);

const PENDENCIAS: EntradaCompendio[] = [
  entrada('regra-pendencias', 'Pendências e itens não aprovados', 'regra', 'pendente',
    'Biblia_wendlands — registros de auditoria', 'Pendências expressas; pausa após a Auditoria 132',
    'O que o sistema ainda não aprovou — e que o aplicativo não automatiza.',
    [
      'Não há regras aprovadas de ataque de oportunidade, bônus posicionais, finalizações específicas, catálogo completo de técnicas, custo extra de VIG para ações fundamentais ou efeitos automáticos de técnicas especializadas.',
      'Nenhuma técnica concreta, efeito, bônus, dano, finalização, penalidade, reação, ação adicional, controle de costas, controle compartilhado, reembolso ou transição gratuita é autorizada por inferência.',
      'A redução progressiva do custo de Yant do texto antigo aguarda auditoria específica; não se aplica desconto aos custos fixos aprovados.',
      'A aplicação da penalidade de RY 0 a Esquecidos está pendente de esclarecimento.',
      'Após a Auditoria 132 o desenvolvimento mecânico ficou suspenso; LET-ESP-016 v0.2 permanece pendente.',
    ]),
];

/** Entradas embutidas (cenário geral + regras). Todas começam visíveis só para o mestre. */
export const ENTRADAS_EMBUTIDAS: readonly EntradaCompendio[] = [...CENARIO, ...TECNICAS, ...REGRAS, ...PENDENCIAS];

export const IDS_EMBUTIDOS: ReadonlySet<string> = new Set(ENTRADAS_EMBUTIDAS.map((e) => e.id));

export const NOME_CATEGORIA: Record<CategoriaCompendio, string> = {
  historia: 'História',
  local: 'Locais',
  faccao: 'Facções e povos',
  personagem: 'Personagens',
  yant: 'Yant',
  material: 'Materiais e tecnologia',
  bestiario: 'Bestiário',
  tecnica: 'Técnicas e artes marciais',
  regra: 'Regras',
};

export const NOME_STATUS: Record<StatusCompendio, string> = {
  canone: 'Cânone',
  crenca: 'Crença',
  lenda: 'Lenda',
  lacuna: 'Lacuna',
  proposta: 'Proposta',
  aprovado: 'Aprovado',
  'nao-aprovado': 'Não aprovado',
  rejeitado: 'Rejeitado',
  pendente: 'Pendente',
  contexto: 'Contexto',
};
