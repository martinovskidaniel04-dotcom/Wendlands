/**
 * Painel de combate: economia de ações, resoluções aguardando confirmação do
 * mestre, transições de agarramento, guardas (contador compartilhado),
 * controles e intervalos de reentrada.
 */
import { useState } from 'react';
import type { Combate, Id, Participante, Pendencia, Postura, SubcategoriaGuarda } from '../../dominio/esquema';
import { POSICOES_CONTROLE, POSTURAS, SUBCATEGORIAS_GUARDA } from '../../dominio/esquema';
import {
  DESTINOS,
  NOME_CONTROLE,
  NOME_DESTINO,
  NOME_POSTURA,
  NOME_SUBCATEGORIA,
  NOME_TRANSICAO,
  descreverSituacao,
  transicoesDisponiveis,
  type DestinoIntermediario,
  type PedidoTransicao,
  type Transicao,
} from '../../dominio/regras/combate';
import { rotuloAutomacao, tecnicaDoCatalogo } from '../../dominio/regras/tecnicas';
import { Botao, BotaoIcone, Campo, CampoNumero, Dialogo, EstadoVazio, Etiqueta, RefRegra, Secao } from '../comuns';
import { useVisao } from '../contexto';

const REGRA_DA_TRANSICAO: Record<Transicao, string> = {
  queda: 'quedas',
  'entrar-guarda': 'guardas-raspagens',
  'recuperar-guarda': 'guardas-raspagens',
  'passar-guarda': 'guardas-raspagens',
  raspagem: 'guardas-raspagens',
  'escape-lateral': 'escapes',
  'reversao-lateral': 'escapes',
  'escape-dominante': 'escapes',
  'sair-tartaruga': 'tartaruga',
  levantar: 'levantar',
  'deslocamento-guarda': 'guarda-deslocamento',
  interferencia: 'interferencia',
  tecnica: 'tecnica-execucao',
};

export function PainelCombate() {
  const { campanha, ehMestre, despachar } = useVisao();
  const combate = campanha.combate;
  const [transicao, setTransicao] = useState<Id | null>(null);

  return (
    <div className="combate">
      {ehMestre && campanha.pendencias.length > 0 && (
        <Secao titulo={`Aguardando o mestre (${campanha.pendencias.length})`}>
          {campanha.pendencias.map((p) => (
            <CartaoPendencia key={p.id} pendencia={p} />
          ))}
        </Secao>
      )}
      {!combate ? (
        <EstadoVazio icone="espada" titulo="Nenhum combate em andamento">
          {ehMestre ? 'Inicie um combate no painel de iniciativa. Ataques fora de combate também aparecem aqui para confirmação.' : 'O mestre ainda não iniciou um combate.'}
        </EstadoVazio>
      ) : (
        <>
          <Secao
            titulo={`Rodada ${combate.rodada}`}
            acoes={<RefRegra id="rodada" />}
          >
            <p className="nota">
              {combate.participantes[combate.turno] ? (
                <>
                  Turno de <strong>{combate.participantes[combate.turno].nome}</strong>.
                </>
              ) : (
                'Turno de um participante não visível.'
              )}{' '}
              Uma ação principal, um movimento e uma reação por rodada.
            </p>
            <ul className="economia">
              {combate.participantes.map((p, i) => (
                <LinhaParticipante key={p.id} combate={combate} participante={p} daVez={i === combate.turno} aoTransicao={() => setTransicao(p.id)} />
              ))}
            </ul>
          </Secao>
          <Vinculos combate={combate} />
          {ehMestre && (
            <p className="nota">
              Movimento ordinário não rompe nem altera guarda ou controle. <RefRegra id="guarda-deslocamento" />
            </p>
          )}
        </>
      )}
      {transicao && combate && <DialogoTransicao combate={combate} executorInicial={transicao} aoFechar={() => setTransicao(null)} />}
      {ehMestre && <DecisaoDeSessao aoRegistrar={(texto, referencia) => despachar({ tipo: 'decisao.registrar', texto, referencia })} />}
    </div>
  );
}

function LinhaParticipante({ combate, participante: p, daVez, aoTransicao }: { combate: Combate; participante: Participante; daVez: boolean; aoTransicao(): void }) {
  const { ehMestre, despachar } = useVisao();
  const marcar = (acao: 'principal' | 'movimento' | 'reacao', usada: boolean) => despachar({ tipo: 'combate.acao', participanteId: p.id, acao, usada, descricao: '' });
  const itens: Array<['principal' | 'movimento' | 'reacao', string, boolean]> = [
    ['principal', 'Ação principal', p.acaoPrincipal],
    ['movimento', 'Movimento', p.movimento],
    ['reacao', 'Reação', p.reacao],
  ];
  return (
    <li className={`eco${daVez ? ' eco--vez' : ''}`}>
      <div className="eco__topo">
        <span className="eco__nome">{p.nome}</span>
        {ehMestre && (
          <Botao pequeno variante="fantasma" icone="luta" onClick={aoTransicao} disabled={p.acaoPrincipal} title={p.acaoPrincipal ? 'Ação principal já usada nesta rodada' : undefined}>
            Agarramento
          </Botao>
        )}
      </div>
      <div className="eco__acoes" role="group" aria-label={`Ações de ${p.nome} nesta rodada`}>
        {itens.map(([acao, nome, usada]) => (
          <button
            key={acao}
            type="button"
            className={`ficha-acao${usada ? ' ficha-acao--usada' : ''}`}
            aria-pressed={usada}
            disabled={!ehMestre}
            onClick={() => marcar(acao, !usada)}
            title={acao === 'principal' && !usada ? 'Registrar uma ação principal genérica: conta para guardas e satisfaz intervalos de reentrada' : undefined}
          >
            {nome}: {usada ? 'usada' : 'disponível'}
          </button>
        ))}
      </div>
      <div className="eco__situacao">
        <span>{descreverSituacao(combate, p.id)}</span>
        {ehMestre && (
          <select className="entrada entrada--mini" aria-label={`Postura de ${p.nome}`} value={p.postura} onChange={(e) => despachar({ tipo: 'combate.postura', participanteId: p.id, postura: e.target.value as Postura })}>
            {POSTURAS.map((x) => (
              <option key={x} value={x}>
                {NOME_POSTURA[x]}
              </option>
            ))}
          </select>
        )}
      </div>
    </li>
  );
}

function CartaoPendencia({ pendencia: p }: { pendencia: Pendencia }) {
  const { despachar } = useVisao();
  const [opcao, setOpcao] = useState(0);
  const [reservado, setReservado] = useState(false);
  const [ajustes, setAjustes] = useState<Record<number, number>>({});
  const escolhida = p.opcoes[Math.min(opcao, p.opcoes.length - 1)];
  const confirmar = () => {
    const substituicoes: Record<string, number> = {};
    escolhida.efeitos.forEach((e, i) => {
      if (e.tipo === 'recurso' && e.ajustavel && i in ajustes) substituicoes[String(i)] = -Math.abs(ajustes[i]);
    });
    despachar({ tipo: 'pendencia.confirmar', pendenciaId: p.id, opcao, substituicoes, visibilidade: reservado ? 'mestre' : 'publica' });
  };
  return (
    <article className="pendencia" aria-label={p.titulo}>
      <h4 className="pendencia__titulo">{p.titulo}</h4>
      <ul className="pendencia__linhas">
        {p.linhas.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {p.opcoes.length > 1 ? (
        <fieldset className="pendencia__opcoes">
          <legend>Desfecho (decisão do mestre)</legend>
          {p.opcoes.map((o, i) => (
            <label key={i} className="opcao">
              <input type="radio" name={`opcao-${p.id}`} checked={opcao === i} onChange={() => setOpcao(i)} />
              <span>
                <strong>{o.rotulo}</strong>
                <span className="opcao__descricao">{o.descricao}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="pendencia__descricao">{escolhida.descricao}</p>
      )}
      {escolhida.efeitos.map((e, i) =>
        e.tipo === 'recurso' && e.ajustavel ? (
          <Campo key={i} rotulo={`Dano final em ${e.recurso.toUpperCase()} (ajustável pelo mestre)`}>
            <CampoNumero valor={i in ajustes ? ajustes[i] : Math.abs(e.delta)} min={0} max={9999} aoMudar={(n) => setAjustes((a) => ({ ...a, [i]: Math.round(n) }))} />
          </Campo>
        ) : null,
      )}
      <label className="alternar" title="O resultado não entra no histórico dos jogadores nem cita quem agiu no registro da ficha afetada">
        <input type="checkbox" checked={reservado} onChange={(e) => setReservado(e.target.checked)} />
        <span>Registrar só para o mestre</span>
      </label>
      <div className="pendencia__rodape">
        <span className="pendencia__regras">
          {p.regras.map((r) => (
            <RefRegra key={r} id={r} />
          ))}
        </span>
        <Botao pequeno variante="fantasma" onClick={() => despachar({ tipo: 'pendencia.cancelar', pendenciaId: p.id })} title="Cancelar: nenhuma ação, VIG ou efeito é consumido">
          Cancelar
        </Botao>
        <Botao pequeno variante="primario" icone="conferir" onClick={confirmar}>
          Confirmar
        </Botao>
      </div>
    </article>
  );
}

function Vinculos({ combate }: { combate: Combate }) {
  const { ehMestre, despachar } = useVisao();
  const nome = (id: Id) => combate.participantes.find((p) => p.id === id)?.nome ?? '—';
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [tipo, setTipo] = useState<'guarda' | 'controle'>('guarda');
  const [detalhe, setDetalhe] = useState<string>('fechada');
  const vazio = combate.guardas.length + combate.controles.length + combate.intervalos.length === 0;
  return (
    <Secao titulo="Guardas e controles" acoes={<RefRegra id="guarda-contador" />}>
      {vazio && <p className="nota">Nenhuma guarda, controle ou intervalo de reentrada.</p>}
      <ul className="vinculos">
        {combate.guardas.map((g) => (
          <li key={g.id} className="vinculo">
            <div className="vinculo__texto">
              <strong>{nome(g.inferiorId)}</strong> (guarda inferior) × <strong>{nome(g.superiorId)}</strong>
              <span className="vinculo__contador" aria-label={`Contador compartilhado: ${g.contador} de 2 ações principais`}>
                <span className={g.contador >= 1 ? 'pino pino--cheio' : 'pino'} />
                <span className="pino" />
                {g.contador}/2 ações
              </span>
            </div>
            {ehMestre ? (
              <div className="vinculo__controles">
                <select
                  className="entrada entrada--mini"
                  aria-label="Subcategoria da guarda (mudar preserva identidade e contador)"
                  title="Mudar a subcategoria preserva a identidade e o contador da guarda"
                  value={g.subcategoria}
                  onChange={(e) => despachar({ tipo: 'combate.editarGuarda', guardaId: g.id, subcategoria: e.target.value as SubcategoriaGuarda })}
                >
                  {SUBCATEGORIAS_GUARDA.map((s) => (
                    <option key={s} value={s}>
                      {NOME_SUBCATEGORIA[s]}
                    </option>
                  ))}
                </select>
                <BotaoIcone icone="fechar" rotulo="Remover esta guarda (decisão manual do mestre)" tamanho={13} onClick={() => despachar({ tipo: 'combate.removerVinculo', vinculo: 'guarda', id: g.id })} />
              </div>
            ) : (
              <Etiqueta>{NOME_SUBCATEGORIA[g.subcategoria]}</Etiqueta>
            )}
          </li>
        ))}
        {combate.controles.map((k) => (
          <li key={k.id} className="vinculo">
            <div className="vinculo__texto">
              <strong>{nome(k.controladorId)}</strong>: {NOME_CONTROLE[k.posicao].toLowerCase()} sobre <strong>{nome(k.controladoId)}</strong>
            </div>
            {ehMestre && <BotaoIcone icone="fechar" rotulo="Remover este controle (decisão manual do mestre)" tamanho={13} onClick={() => despachar({ tipo: 'combate.removerVinculo', vinculo: 'controle', id: k.id })} />}
          </li>
        ))}
        {combate.intervalos.map((i) => (
          <li key={`${i.combatenteId}-${i.oponenteId}`} className="vinculo vinculo--intervalo">
            <div className="vinculo__texto">
              Reentrada: <strong>{nome(i.combatenteId)}</strong> precisa consumir outra ação principal antes de iniciar guarda contra <strong>{nome(i.oponenteId)}</strong>
              <RefRegra id="reentrada" />
            </div>
            {ehMestre && (
              <BotaoIcone icone="fechar" rotulo="Remover este intervalo (decisão manual do mestre)" tamanho={13} onClick={() => despachar({ tipo: 'combate.removerIntervalo', combatenteId: i.combatenteId, oponenteId: i.oponenteId })} />
            )}
          </li>
        ))}
      </ul>
      {ehMestre && combate.participantes.length >= 2 && (
        <details className="token-form">
          <summary>Registrar posição manualmente</summary>
          <div className="formulario formulario--compacto">
            <p className="nota">Use para aplicar destinos declarados ou decisões da mesa. Fica registrado como ajuste manual.</p>
            <div className="grade-campos">
              <Campo rotulo="Tipo">
                <select
                  className="entrada"
                  value={tipo}
                  onChange={(e) => {
                    const t = e.target.value as 'guarda' | 'controle';
                    setTipo(t);
                    setDetalhe(t === 'guarda' ? 'fechada' : 'lateral');
                  }}
                >
                  <option value="guarda">Guarda</option>
                  <option value="controle">Controle</option>
                </select>
              </Campo>
              <Campo rotulo={tipo === 'guarda' ? 'Subcategoria' : 'Posição'}>
                <select className="entrada" value={detalhe} onChange={(e) => setDetalhe(e.target.value)}>
                  {tipo === 'guarda'
                    ? SUBCATEGORIAS_GUARDA.map((s) => (
                        <option key={s} value={s}>
                          {NOME_SUBCATEGORIA[s]}
                        </option>
                      ))
                    : POSICOES_CONTROLE.map((s) => (
                        <option key={s} value={s}>
                          {NOME_CONTROLE[s]}
                        </option>
                      ))}
                </select>
              </Campo>
              <Campo rotulo={tipo === 'guarda' ? 'Guarda inferior' : 'Quem controla'}>
                <select className="entrada" value={a} onChange={(e) => setA(e.target.value)}>
                  <option value="">Escolher…</option>
                  {combate.participantes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo={tipo === 'guarda' ? 'Superior' : 'Quem é controlado'}>
                <select className="entrada" value={b} onChange={(e) => setB(e.target.value)}>
                  <option value="">Escolher…</option>
                  {combate.participantes.filter((p) => p.id !== a).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <Botao
              pequeno
              disabled={!a || !b || a === b}
              onClick={() =>
                tipo === 'guarda'
                  ? despachar({ tipo: 'combate.criarGuarda', inferiorId: a, superiorId: b, subcategoria: detalhe as SubcategoriaGuarda })
                  : despachar({ tipo: 'combate.criarControle', controladorId: a, controladoId: b, posicao: detalhe as (typeof POSICOES_CONTROLE)[number] })
              }
            >
              Registrar
            </Botao>
          </div>
        </details>
      )}
    </Secao>
  );
}

function DialogoTransicao({ combate, executorInicial, aoFechar }: { combate: Combate; executorInicial: Id; aoFechar(): void }) {
  const { campanha, despachar } = useVisao();
  const [executorId, setExecutorId] = useState(executorInicial);
  const disponiveis = transicoesDisponiveis(combate, executorId);
  const [transicao, setTransicao] = useState<Transicao>(disponiveis[0] ?? 'tecnica');
  const tipo = disponiveis.includes(transicao) ? transicao : disponiveis[0] ?? 'tecnica';
  const [alvoId, setAlvoId] = useState('');
  const [guardaId, setGuardaId] = useState('');
  const [abordagemExecutor, setAbordagemExecutor] = useState<'fis' | 'des'>('fis');
  const [abordagemAlvo, setAbordagemAlvo] = useState<'fis' | 'des'>('fis');
  const [brutaExecutor, setBrutaExecutor] = useState(false);
  const [brutaAlvo, setBrutaAlvo] = useState(false);
  const [acompanhar, setAcompanhar] = useState(true);
  const [subcategoria, setSubcategoria] = useState<SubcategoriaGuarda>('fechada');
  const [destino, setDestino] = useState<DestinoIntermediario>('meia');
  const [comOposicao, setComOposicao] = useState(false);
  const [tecnica, setTecnica] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const executor = combate.participantes.find((p) => p.id === executorId);
  const fichaDe = (id: Id | null | undefined) => {
    const p = combate.participantes.find((x) => x.id === id);
    return p?.fichaId ? campanha.fichas.find((f) => f.id === p.fichaId) ?? null : null;
  };
  const fichaExecutor = fichaDe(executorId);
  const guarda = combate.guardas.find((g) => g.id === guardaId);
  const candidatos =
    tipo === 'interferencia'
      ? combate.participantes.filter((p) => guarda && (p.id === guarda.inferiorId || p.id === guarda.superiorId))
      : combate.participantes.filter((p) => p.id !== executorId);
  const alvo = candidatos.find((p) => p.id === alvoId) ?? null;
  const fichaAlvo = fichaDe(alvo?.id);
  const semTeste = (tipo === 'sair-tartaruga' || tipo === 'levantar') && !comOposicao;
  const tecnicasDaFicha = (fichaExecutor?.tecnicas ?? []).filter((t) => t.refCatalogo && tecnicaDoCatalogo(t.refCatalogo));
  const catalogo = tecnicaDoCatalogo(tecnica);
  const tecnicaManual = tipo === 'tecnica' && catalogo?.automacao === 'manual';
  const precisaAlvo = !semTeste && !tecnicaManual;
  const nomeGuarda = (g: Combate['guardas'][number]) => `${combate.participantes.find((p) => p.id === g.inferiorId)?.nome} × ${combate.participantes.find((p) => p.id === g.superiorId)?.nome}`;

  const rolar = () => {
    const pedido: PedidoTransicao = {
      transicao: tipo,
      executorId,
      alvoId: precisaAlvo || alvo ? alvo?.id ?? null : null,
      abordagemExecutor,
      abordagemAlvo,
      forcaBrutaExecutor: brutaExecutor,
      forcaBrutaAlvo: brutaAlvo,
      acompanharQueda: acompanhar,
      subcategoria,
      destino,
      comOposicao,
      guardaId: tipo === 'interferencia' ? guardaId || null : null,
      tecnica: tipo === 'tecnica' ? tecnica : '',
    };
    const r = despachar({ tipo: 'combate.resolverTransicao', pedido });
    if (r.ok) aoFechar();
    else setErro(r.erro);
  };

  return (
    <Dialogo
      titulo="Transição de agarramento"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone="dado" onClick={rolar} disabled={(precisaAlvo && !alvo) || (tipo === 'tecnica' && !tecnica)}>
            {semTeste || tecnicaManual ? 'Preparar resolução' : 'Rolar teste oposto'}
          </Botao>
        </>
      }
    >
      <div className="formulario">
        <p className="nota">
          Declare objetivo e abordagem antes da rolagem. Uma tentativa inválida não consome ação nem VIG; o resultado só é aplicado quando o mestre confirmar. <RefRegra id="transicoes" />
        </p>
        <div className="grade-campos">
          <Campo rotulo="Quem executa">
            <select
              className="entrada"
              value={executorId}
              onChange={(e) => {
                setExecutorId(e.target.value);
                setAlvoId('');
                setErro(null);
              }}
            >
              {combate.participantes.map((p) => (
                <option key={p.id} value={p.id} disabled={p.acaoPrincipal}>
                  {p.nome}
                  {p.acaoPrincipal ? ' (ação usada)' : ''}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Transição" dica={<RefRegra id={REGRA_DA_TRANSICAO[tipo]} rotulo="Regra desta transição" />}>
            <select
              className="entrada"
              value={tipo}
              onChange={(e) => {
                setTransicao(e.target.value as Transicao);
                setAlvoId('');
                setErro(null);
              }}
            >
              {disponiveis.map((t) => (
                <option key={t} value={t}>
                  {NOME_TRANSICAO[t]}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {executor && <p className="nota">Situação de {executor.nome}: {descreverSituacao(combate, executor.id)}.</p>}

        {tipo === 'tecnica' && (
          <>
            <Campo rotulo="Técnica (registrada na ficha do executor)">
              <select className="entrada" value={tecnica} onChange={(e) => setTecnica(e.target.value)}>
                <option value="">Escolher…</option>
                {tecnicasDaFicha.map((t) => {
                  const c = tecnicaDoCatalogo(t.refCatalogo)!;
                  return (
                    <option key={t.id} value={c.codigo}>
                      {c.codigo} {c.nome} {c.versao} — {rotuloAutomacao(c)}
                    </option>
                  );
                })}
              </select>
            </Campo>
            {tecnicasDaFicha.length === 0 && <p className="nota">Este personagem não tem técnicas do catálogo registradas na ficha.</p>}
            {catalogo && (
              <div className="tecnica-info">
                <Etiqueta tom={catalogo.status === 'aprovada' ? 'verde' : catalogo.status === 'pendente' ? 'alerta' : 'vinho'}>{rotuloAutomacao(catalogo)}</Etiqueta>
                <p className="nota">
                  {catalogo.auditoria}. {catalogo.nota}
                </p>
                {catalogo.resolucao && (
                  <ul className="lista-simples">
                    {catalogo.resolucao.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {(tipo === 'sair-tartaruga' || tipo === 'levantar') && (
          <label className="alternar">
            <input type="checkbox" checked={comOposicao} onChange={(e) => setComOposicao(e.target.checked)} />
            <span>Há oposição efetiva (exige teste oposto)</span>
          </label>
        )}

        {tipo === 'interferencia' && (
          <Campo rotulo="Guarda em que o terceiro interfere">
            <select
              className="entrada"
              value={guardaId}
              onChange={(e) => {
                setGuardaId(e.target.value);
                setAlvoId('');
              }}
            >
              <option value="">Escolher…</option>
              {combate.guardas
                .filter((g) => g.inferiorId !== executorId && g.superiorId !== executorId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {nomeGuarda(g)}
                  </option>
                ))}
            </select>
          </Campo>
        )}

        {precisaAlvo && (
          <Campo rotulo={tipo === 'interferencia' ? 'Defensor direto (um único, escolhido antes do teste)' : 'Oponente'}>
            <select className="entrada" value={alvoId} onChange={(e) => setAlvoId(e.target.value)}>
              <option value="">Escolher…</option>
              {candidatos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {tipo === 'queda' && (
          <label className="alternar">
            <input type="checkbox" checked={acompanhar} onChange={(e) => setAcompanhar(e.target.checked)} />
            <span>O atacante acompanha a queda (declarado antes do teste)</span>
          </label>
        )}
        {(tipo === 'entrar-guarda' || tipo === 'recuperar-guarda') && (
          <Campo rotulo="Subcategoria de guarda">
            <select className="entrada" value={subcategoria} onChange={(e) => setSubcategoria(e.target.value as SubcategoriaGuarda)}>
              {SUBCATEGORIAS_GUARDA.map((s) => (
                <option key={s} value={s}>
                  {NOME_SUBCATEGORIA[s]}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {tipo === 'escape-dominante' && (
          <Campo rotulo="Destino defensivo intermediário (declarado e validado antes do teste)">
            <select className="entrada" value={destino} onChange={(e) => setDestino(e.target.value as DestinoIntermediario)}>
              {DESTINOS.map((x) => (
                <option key={x} value={x}>
                  {NOME_DESTINO[x]}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {!semTeste && !tecnicaManual && (
          <fieldset className="grupo">
            <legend>Abordagens (cada parte escolhe a sua)</legend>
            <div className="grade-campos">
              <Campo rotulo={`Abordagem de ${executor?.nome ?? 'executor'}`}>
                <select className="entrada" value={abordagemExecutor} onChange={(e) => setAbordagemExecutor(e.target.value as 'fis' | 'des')}>
                  <option value="fis">FIS</option>
                  <option value="des">DES</option>
                </select>
              </Campo>
              <Campo rotulo={`Abordagem de ${alvo?.nome ?? 'oponente'}`}>
                <select className="entrada" value={abordagemAlvo} onChange={(e) => setAbordagemAlvo(e.target.value as 'fis' | 'des')}>
                  <option value="fis">FIS</option>
                  <option value="des">DES</option>
                </select>
              </Campo>
            </div>
            <label className="alternar">
              <input type="checkbox" checked={brutaExecutor && fichaExecutor?.origem === 'esquecido' && abordagemExecutor === 'fis'} disabled={fichaExecutor?.origem !== 'esquecido' || abordagemExecutor !== 'fis'} onChange={(e) => setBrutaExecutor(e.target.checked)} />
              <span>{executor?.nome ?? 'Executor'}: força bruta pura (Esquecido rola 2d20 e fica com o maior)</span>
            </label>
            <label className="alternar">
              <input type="checkbox" checked={brutaAlvo && fichaAlvo?.origem === 'esquecido' && abordagemAlvo === 'fis'} disabled={fichaAlvo?.origem !== 'esquecido' || abordagemAlvo !== 'fis'} onChange={(e) => setBrutaAlvo(e.target.checked)} />
              <span>{alvo?.nome ?? 'Oponente'}: força bruta pura</span>
            </label>
            <p className="nota">
              Só vale para Esquecidos com abordagem de FIS, quando o mestre valida que é força bruta pura — não em toda disputa de agarramento. <RefRegra id="forca-bruta" />
            </p>
          </fieldset>
        )}
        {erro && (
          <p className="campo__erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

function DecisaoDeSessao({ aoRegistrar }: { aoRegistrar(texto: string, referencia: string): void }) {
  const { campanha, despachar } = useVisao();
  const [texto, setTexto] = useState('');
  const [referencia, setReferencia] = useState('');
  return (
    <details className="token-form">
      <summary>Decisões de sessão do mestre ({campanha.decisoes.length})</summary>
      <div className="formulario formulario--compacto">
        <p className="nota">Registre aqui decisões tomadas na mesa (por exemplo, sobre uma técnica pendente). Elas valem como anotação da sessão e não alteram o cânone nem o estado de aprovação de nenhuma regra.</p>
        <Campo rotulo="Regra ou técnica (opcional)">
          <input className="entrada" value={referencia} maxLength={60} placeholder="ex.: LET-ESP-016" onChange={(e) => setReferencia(e.target.value)} />
        </Campo>
        <Campo rotulo="Decisão">
          <textarea className="entrada entrada--area" rows={2} maxLength={2000} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </Campo>
        <Botao
          pequeno
          disabled={!texto.trim()}
          onClick={() => {
            aoRegistrar(texto.trim(), referencia.trim());
            setTexto('');
            setReferencia('');
          }}
        >
          Registrar decisão
        </Botao>
        {campanha.decisoes.length > 0 && (
          <ul className="lista-simples">
            {[...campanha.decisoes].reverse().map((d) => (
              <li key={d.id}>
                {d.referencia && <strong>{d.referencia}: </strong>}
                {d.texto}{' '}
                <button type="button" className="link" onClick={() => despachar({ tipo: 'decisao.excluir', decisaoId: d.id })}>
                  remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
