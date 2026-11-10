/**
 * Visão por papel: o que cada pessoa recebe da campanha.
 *
 * Na mesa online o servidor aplica este filtro antes de enviar qualquer coisa a
 * um jogador — "oculto" significa dado não enviado, e não apenas não desenhado.
 * No modo local o mesmo filtro alimenta a prévia do jogador (que é só uma prévia:
 * não protege contra quem tem acesso ao armazenamento do próprio mestre).
 */
import type { Ator, Campanha, Cena, Ficha, Id, Token } from './esquema';
import { desenhoSobNevoa, tokenSobNevoa } from './mapa';

export interface OpcoesVisao {
  /**
   * true (servidor): o arquivo original do mapa nunca é enviado; só a versão
   * preparada para jogadores, e apenas se ela cobrir toda a névoa atual.
   * false (prévia local): mantém o mapa original no próprio navegador do mestre.
   */
  mascararMapa: boolean;
}

export function tokenVisivelParaJogadores(cena: Cena, token: Token, nevoa: ReadonlySet<string>): boolean {
  return !token.oculto && !tokenSobNevoa(token, cena, nevoa);
}

function fichaResumida(f: Ficha): Ficha {
  return {
    id: f.id,
    nome: f.nome,
    subtitulo: f.subtitulo,
    demo: f.demo,
    tipo: f.tipo,
    origem: 'normal',
    faccao: '',
    cla: '',
    estiloMarcial: '',
    nivel: 1,
    atributosBase: { fis: 0, des: 0, men: 0, yan: 0 },
    aumentos: [],
    ryBase: 0,
    ryDetalhe: '',
    pvAtual: 0,
    vigAtual: 0,
    ryAtual: 0,
    ajustes: [],
    equipamento: [],
    creditos: 0,
    tecnicas: [],
    notasPublicas: f.notasPublicas,
    notasPrivadas: '',
    notasMestre: '',
    retratoArquivoId: f.retratoArquivoId,
    donoJogadorId: f.donoJogadorId,
    compartilhamento: f.compartilhamento,
    condicao: { estado: 'normal', sucessos: 0, falhas: 0 },
    registroOrigem: '',
    registro: [],
    visaoParcial: true,
  };
}

function fichaParaJogador(f: Ficha, jogadorId: Id): Ficha | null {
  if (f.donoJogadorId === jogadorId) return { ...f, notasMestre: '' };
  if (f.compartilhamento === 'oculta') return null;
  if (f.compartilhamento === 'resumo') return fichaResumida(f);
  return { ...f, notasPrivadas: '', notasMestre: '', registro: [], registroOrigem: '' };
}

/** Uma versão preparada do mapa só serve se apagar todas as células hoje ocultas. */
export function mapaJogadoresCobreNevoa(cena: Cena): boolean {
  if (!cena.mapaJogadores) return false;
  if (cena.nevoa.length === 0) return true;
  const apagadas = new Set(cena.mapaJogadores.celulas);
  return cena.nevoa.every((chave) => apagadas.has(chave));
}

export function filtrarVisao(campanha: Campanha, ator: Ator, opcoes: OpcoesVisao): Campanha {
  if (ator.papel === 'mestre') return campanha;
  const jogadorId = ator.jogadorId ?? '';

  const fichas: Ficha[] = [];
  for (const f of campanha.fichas) {
    const visivel = fichaParaJogador(f, jogadorId);
    if (visivel) fichas.push(visivel);
  }
  const fichasVisiveis = new Set(fichas.map((f) => f.id));

  const cenas: Cena[] = [];
  const tokensVisiveis = new Set<Id>();
  const ativa = campanha.cenas.find((c) => c.id === campanha.cenaAtivaId);
  if (ativa) {
    const nevoa = new Set(ativa.nevoa);
    const tokens = ativa.tokens
      .filter((t) => tokenVisivelParaJogadores(ativa, t, nevoa))
      .map((t) => ({ ...t, fichaId: t.fichaId && fichasVisiveis.has(t.fichaId) ? t.fichaId : null }));
    for (const t of tokens) tokensVisiveis.add(t.id);

    let mapa = ativa.mapa;
    if (opcoes.mascararMapa && ativa.mapa.tipo === 'arquivo') {
      mapa =
        ativa.mapaJogadores && mapaJogadoresCobreNevoa(ativa)
          ? { tipo: 'arquivo', arquivoId: ativa.mapaJogadores.arquivoId }
          : { tipo: 'vazio' };
    }
    cenas.push({
      ...ativa,
      mapa,
      tokens,
      desenhos: ativa.desenhos.filter((d) => d.visivelJogadores && !desenhoSobNevoa(d, ativa, nevoa)),
      mapaJogadores: null,
      notaMestre: '',
    });
  }

  let combate = campanha.combate;
  if (combate) {
    const atual = combate.participantes[combate.turno]?.id ?? null;
    const participantes = combate.participantes
      .filter((p) => (p.tokenId ? tokensVisiveis.has(p.tokenId) : true))
      .map((p) => ({ ...p, fichaId: p.fichaId && fichasVisiveis.has(p.fichaId) ? p.fichaId : null }));
    const ids = new Set(participantes.map((p) => p.id));
    const indice = participantes.findIndex((p) => p.id === atual);
    combate = {
      ...combate,
      participantes,
      // Se o turno é de alguém oculto, nenhum participante visível fica destacado.
      turno: indice >= 0 ? indice : participantes.length,
      empates: combate.empates.map((g) => g.filter((id) => ids.has(id))).filter((g) => g.length > 1),
      guardas: combate.guardas.filter((g) => ids.has(g.inferiorId) && ids.has(g.superiorId)),
      controles: combate.controles.filter((k) => ids.has(k.controladorId) && ids.has(k.controladoId)),
      intervalos: combate.intervalos.filter((i) => ids.has(i.combatenteId) && ids.has(i.oponenteId)),
    };
  }

  const usados = new Set<Id>();
  for (const cena of cenas) {
    if (cena.mapa.tipo === 'arquivo') usados.add(cena.mapa.arquivoId);
    for (const t of cena.tokens) if (t.retratoArquivoId) usados.add(t.retratoArquivoId);
  }
  for (const f of fichas) if (f.retratoArquivoId) usados.add(f.retratoArquivoId);

  return {
    ...campanha,
    cenas,
    cenaAtivaId: ativa ? ativa.id : null,
    fichas,
    combate,
    pendencias: [],
    historico: campanha.historico.filter((h) => h.visibilidade === 'publica' || (h.autor.jogadorId !== null && h.autor.jogadorId === jogadorId)),
    diario: campanha.diario.filter((e) => e.visibilidade === 'jogadores'),
    compendio: {
      proprias: campanha.compendio.proprias.filter((e) => e.visibilidade === 'jogadores'),
      liberadas: campanha.compendio.liberadas,
    },
    decisoes: [],
    arquivos: campanha.arquivos.filter((a) => usados.has(a.id)),
  };
}

/** Um jogador só pode baixar arquivos que aparecem na própria visão filtrada. */
export function arquivoVisivelPara(campanha: Campanha, ator: Ator, arquivoId: Id): boolean {
  if (ator.papel === 'mestre') return campanha.arquivos.some((a) => a.id === arquivoId);
  return filtrarVisao(campanha, ator, { mascararMapa: true }).arquivos.some((a) => a.id === arquivoId);
}
