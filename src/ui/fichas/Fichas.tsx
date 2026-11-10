/**
 * Fichas: lista, editor completo (valores calculados × ajustes manuais),
 * inventário, técnicas, notas, registro de alterações, importação e exportação.
 */
import { useEffect, useRef, useState } from 'react';
import type { AjusteManual, ChaveAtributo, Ficha, Id, ItemEquipamento, Origem, TecnicaFicha } from '../../dominio/esquema';
import { ALVOS_AJUSTE, ATRIBUTOS, CLAS, ESTILOS, NIVEIS_AUMENTO, ORIGENS } from '../../dominio/esquema';
import { CREDITOS_INICIAIS, equipamentoInicial, novoId, novoItem } from '../../dominio/fabrica';
import { exportarFicha, lerFicha } from '../../dominio/pacote';
import {
  CUSTO_CATEGORIA_FISICA,
  CUSTO_GRAU_YANT,
  NOME_ATRIBUTO,
  NOME_ORIGEM,
  ROTULO_GRAU,
  SIGLA_ATRIBUTO,
  derivar,
  formatarModificador,
  validarCriacao,
  vagasTecnicas,
  type ValorDerivado,
} from '../../dominio/regras/ficha';
import { CATALOGO_TECNICAS, PODERES_DE_CLA, rotuloAutomacao, tecnicaDoCatalogo } from '../../dominio/regras/tecnicas';
import { ACEITAR_IMAGENS, BarraRecurso, Botao, BotaoIcone, Campo, CampoNumero, EstadoVazio, Etiqueta, RefRegra, Retrato, dataCurta, escolherArquivo } from '../comuns';
import { useConfirmar, useLoja, useVisao } from '../contexto';
import { baixarBlob, nomeDeArquivo } from '../loja';
import { CriarFicha } from './CriarFicha';

const NOME_CLA: Record<(typeof CLAS)[number], string> = { '': 'Nenhum', gionatte: 'Gionatte', matior: 'Matior', opartyn: 'Opartyn' };
const NOME_ESTILO: Record<(typeof ESTILOS)[number], string> = { '': 'Nenhum', gartio: 'Gartio', 'corpo-armado': 'Corpo Armado', letalitas: 'Letalitas' };
const NOME_ALVO: Record<AjusteManual['alvo'], string> = { pvMax: 'PV máximos', vigMax: 'VIG máxima', ryMax: 'RY máxima', defesa: 'Defesa', reducao: 'Redução', carga: 'Carga' };
const NOME_TIPO_ITEM: Record<ItemEquipamento['tipo'], string> = { arma: 'Arma', armadura: 'Armadura', escudo: 'Escudo', item: 'Item' };

interface Props {
  aberta: { id: Id | null; secao?: 'inventario' };
  aoAbrir(id: Id | null): void;
  aoGerenciarJogadores(): void;
}

export function PaginaFichas({ aberta, aoAbrir, aoGerenciarJogadores }: Props) {
  const { campanha, ator, ehMestre, despachar } = useVisao();
  const loja = useLoja();
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);
  const fichas = campanha.fichas.filter((f) => f.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  const atual = campanha.fichas.find((f) => f.id === aberta.id) ?? (ehMestre ? null : campanha.fichas.find((f) => f.donoJogadorId === ator.jogadorId) ?? null);

  const importar = async () => {
    const arquivo = await escolherArquivo('application/json,.json');
    if (!arquivo) return;
    let bruto: unknown;
    try {
      bruto = JSON.parse(await arquivo.text());
    } catch {
      loja.avisar('erro', 'O arquivo escolhido não é um JSON válido.');
      return;
    }
    const r = lerFicha(bruto, () => novoId());
    if (!r.ok) {
      loja.avisar('erro', r.erro);
      return;
    }
    if (despachar({ tipo: 'ficha.criar', ficha: r.ficha }).ok) {
      aoAbrir(r.ficha.id);
      loja.avisar('sucesso', `Ficha "${r.ficha.nome}" importada (retrato e dono não acompanham o arquivo).`);
    }
  };

  return (
    <div className="pagina pagina--duas">
      <aside className="lista-lateral" aria-label="Fichas da campanha">
        <header className="lista-lateral__topo">
          <h1 className="titulo-pagina">Fichas</h1>
          {ehMestre && (
            <div className="linha-botoes">
              <Botao pequeno variante="primario" icone="mais" onClick={() => setCriando(true)}>
                Nova ficha
              </Botao>
              <Botao pequeno icone="importar" onClick={() => void importar()}>
                Importar
              </Botao>
            </div>
          )}
        </header>
        <input className="entrada" type="search" placeholder="Buscar ficha" aria-label="Buscar ficha" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {campanha.fichas.length === 0 ? (
          <p className="nota">{ehMestre ? 'Nenhuma ficha ainda. Crie a primeira com “Nova ficha”.' : 'Nenhuma ficha disponível para você.'}</p>
        ) : fichas.length === 0 ? (
          <p className="nota">Nenhuma ficha corresponde à busca.</p>
        ) : (
          <ul className="lista-fichas">
            {fichas.map((f) => (
              <li key={f.id}>
                <button type="button" className="item-ficha" aria-current={atual?.id === f.id ? 'true' : undefined} onClick={() => aoAbrir(f.id)}>
                  <Retrato arquivoId={f.retratoArquivoId} nome={f.nome} tamanho={40} />
                  <span className="item-ficha__texto">
                    <span className="item-ficha__nome">{f.nome}</span>
                    <span className="item-ficha__sub">
                      {f.visaoParcial ? 'Resumo público' : `${NOME_ORIGEM[f.origem]} · nível ${f.nivel}`}
                      {f.tipo === 'pnj' && ' · PNJ'}
                      {f.demo && ' · exemplo'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {ehMestre && (
          <Botao pequeno variante="fantasma" icone="pessoa" onClick={aoGerenciarJogadores}>
            Jogadores ({campanha.jogadores.length})
          </Botao>
        )}
      </aside>
      <section className="detalhe" aria-label="Ficha aberta">
        {atual ? <EditorFicha key={atual.id} ficha={atual} secao={aberta.id === atual.id ? aberta.secao : undefined} aoFechar={() => aoAbrir(null)} /> : <EstadoVazio icone="ficha" titulo="Escolha uma ficha na lista" />}
      </section>
      {criando && (
        <CriarFicha
          aoFechar={() => setCriando(false)}
          aoCriar={(id) => {
            setCriando(false);
            aoAbrir(id);
          }}
        />
      )}
    </div>
  );
}

function Parcela({ rotulo, valor, regra }: { rotulo: string; valor: ValorDerivado; regra: string }) {
  return (
    <div className="parcela">
      <span className="parcela__rotulo">
        {rotulo} <RefRegra id={regra} />
      </span>
      <span className="parcela__total">{valor.total}</span>
      <span className="parcela__detalhe">
        calculado {valor.calculado}
        {valor.ajuste !== 0 && ` · ajuste manual ${formatarModificador(valor.ajuste)}`}
      </span>
    </div>
  );
}

function EditorFicha({ ficha, secao, aoFechar }: { ficha: Ficha; secao?: 'inventario'; aoFechar(): void }) {
  const { campanha, ator, ehMestre, previa, despachar } = useVisao();
  const loja = useLoja();
  const confirmar = useConfirmar();
  const refInventario = useRef<HTMLElement>(null);
  useEffect(() => {
    if (secao === 'inventario') refInventario.current?.scrollIntoView({ block: 'start' });
  }, [secao]);

  if (ficha.visaoParcial) {
    return (
      <div className="ficha">
        <header className="ficha__topo">
          <Retrato arquivoId={ficha.retratoArquivoId} nome={ficha.nome} tamanho={84} />
          <div>
            <h2 className="ficha__nome">{ficha.nome}</h2>
            <p className="nota">{ficha.subtitulo || 'Resumo público'}</p>
          </div>
        </header>
        <p className="nota">O mestre compartilhou apenas o resumo público desta ficha.</p>
        <p>{ficha.notasPublicas || 'Sem notas públicas.'}</p>
      </div>
    );
  }

  const dono = !previa && ficha.donoJogadorId !== null && ficha.donoJogadorId === ator.jogadorId;
  const mestre = ehMestre && !previa;
  const podeRecursos = mestre || dono;
  const d = derivar(ficha);
  const alterar = (alteracoes: Parameters<typeof despachar>[0] extends infer C ? (C extends { tipo: 'ficha.atualizar'; alteracoes: infer A } ? A : never) : never) =>
    despachar({ tipo: 'ficha.atualizar', fichaId: ficha.id, alteracoes });
  const errosCriacao = ficha.nivel === 1 && ficha.aumentos.length === 0 ? validarCriacao(ficha.origem, ficha.atributosBase) : [];
  const vagas = vagasTecnicas(ficha.origem, ficha.nivel);
  const poder = ficha.cla ? PODERES_DE_CLA[ficha.cla] : null;

  const trocarRetrato = async () => {
    const arquivo = await escolherArquivo(ACEITAR_IMAGENS);
    if (!arquivo) return;
    const meta = await loja.importarImagem(arquivo, arquivo.name, 'retrato');
    if (!meta) return;
    const anterior = ficha.retratoArquivoId;
    if (alterar({ retratoArquivoId: meta.id }).ok && anterior) void loja.removerImagem(anterior);
  };

  const excluir = async () => {
    const local = loja.obter().modo === 'local';
    const ok = await confirmar({
      titulo: 'Excluir ficha',
      texto: `Excluir a ficha de ${ficha.nome}? Os tokens vinculados continuam no mapa, sem ficha.${local ? '' : ' Na mesa online esta ação não pode ser desfeita.'}`,
      confirmar: 'Excluir ficha',
      perigo: true,
    });
    if (ok && despachar({ tipo: 'ficha.excluir', fichaId: ficha.id }).ok) {
      aoFechar();
      if (local) loja.avisar('info', `Ficha de ${ficha.nome} excluída.`, { rotulo: 'Desfazer', executar: () => loja.desfazer() });
    }
  };

  return (
    <div className="ficha">
      <header className="ficha__topo">
        <div className="ficha__retrato">
          <Retrato arquivoId={ficha.retratoArquivoId} nome={ficha.nome} tamanho={96} />
          {mestre && (
            <div className="linha-botoes">
              <Botao pequeno variante="fantasma" onClick={() => void trocarRetrato()}>
                {ficha.retratoArquivoId ? 'Trocar' : 'Retrato…'}
              </Botao>
              {ficha.retratoArquivoId && (
                <Botao
                  pequeno
                  variante="fantasma"
                  onClick={() => {
                    const id = ficha.retratoArquivoId!;
                    if (alterar({ retratoArquivoId: null }).ok) void loja.removerImagem(id);
                  }}
                >
                  Remover
                </Botao>
              )}
            </div>
          )}
        </div>
        <div className="ficha__identidade">
          <div className="grade-campos">
            <Campo rotulo="Nome">
              <input className="entrada" defaultValue={ficha.nome} maxLength={80} disabled={!mestre} onBlur={(e) => e.target.value.trim() && e.target.value !== ficha.nome && alterar({ nome: e.target.value.trim() })} />
            </Campo>
            <Campo rotulo="Descrição curta">
              <input className="entrada" defaultValue={ficha.subtitulo} maxLength={120} disabled={!mestre} onBlur={(e) => e.target.value !== ficha.subtitulo && alterar({ subtitulo: e.target.value })} />
            </Campo>
            <Campo rotulo="Origem" dica={<RefRegra id="origem" rotulo="Regra de origem" />}>
              <select className="entrada" value={ficha.origem} disabled={!mestre} onChange={(e) => alterar({ origem: e.target.value as Origem })}>
                {ORIGENS.map((o) => (
                  <option key={o} value={o}>
                    {NOME_ORIGEM[o]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Nível">
              <CampoNumero valor={ficha.nivel} min={1} max={20} desabilitado={!mestre} aoMudar={(n) => alterar({ nivel: Math.round(n) })} />
            </Campo>
            <Campo rotulo="Facção" dica="Pertencer ao Sangue de Darion não dá poderes nem recursos extras.">
              <input className="entrada" defaultValue={ficha.faccao} maxLength={60} disabled={!mestre} list="faccoes" onBlur={(e) => e.target.value !== ficha.faccao && alterar({ faccao: e.target.value })} />
              <datalist id="faccoes">
                <option value="Sangue de Darion" />
              </datalist>
            </Campo>
            <Campo rotulo="Clã">
              <select className="entrada" value={ficha.cla} disabled={!mestre} onChange={(e) => alterar({ cla: e.target.value as Ficha['cla'] })}>
                {CLAS.map((c) => (
                  <option key={c} value={c}>
                    {NOME_CLA[c]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Estilo marcial principal" dica="Escolher um estilo não dá bônus mecânico.">
              <select className="entrada" value={ficha.estiloMarcial} disabled={!mestre} onChange={(e) => alterar({ estiloMarcial: e.target.value as Ficha['estiloMarcial'] })}>
                {ESTILOS.map((c) => (
                  <option key={c} value={c}>
                    {NOME_ESTILO[c]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Tipo">
              <select className="entrada" value={ficha.tipo} disabled={!mestre} onChange={(e) => alterar({ tipo: e.target.value as Ficha['tipo'] })}>
                <option value="pj">Personagem de jogador</option>
                <option value="pnj">Personagem do mestre</option>
              </select>
            </Campo>
          </div>
          {ficha.demo && <Etiqueta tom="latao">Ficha de exemplo — estatísticas fictícias</Etiqueta>}
          {poder && (
            <p className="nota nota--alerta">
              <strong>{poder.nome}:</strong> {poder.nota}
            </p>
          )}
        </div>
      </header>

      {mestre && (
        <section className="bloco">
          <h3 className="bloco__titulo">Acesso</h3>
          <div className="grade-campos">
            <Campo rotulo="Jogador dono da ficha" dica="O dono vê a ficha inteira (menos as notas do mestre) e pode ajustar recursos, notas e inventário.">
              <select className="entrada" value={ficha.donoJogadorId ?? ''} onChange={(e) => alterar({ donoJogadorId: e.target.value || null })}>
                <option value="">Nenhum (só o mestre)</option>
                {campanha.jogadores.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="O que os outros jogadores recebem">
              <select className="entrada" value={ficha.compartilhamento} onChange={(e) => alterar({ compartilhamento: e.target.value as Ficha['compartilhamento'] })}>
                <option value="oculta">Nada (ficha oculta)</option>
                <option value="resumo">Resumo: nome, retrato e notas públicas</option>
                <option value="completa">Ficha completa, sem notas privadas</option>
              </select>
            </Campo>
          </div>
        </section>
      )}

      <section className="bloco">
        <h3 className="bloco__titulo">
          Atributos <RefRegra id="criacao-atributos" />
        </h3>
        <div className="atributos atributos--ficha">
          {ATRIBUTOS.map((a: ChaveAtributo) => (
            <div key={a} className="atributo atributo--editavel">
              <span className="atributo__sigla" title={NOME_ATRIBUTO[a]}>
                {SIGLA_ATRIBUTO[a]}
              </span>
              <span className="atributo__valor">{formatarModificador(d.atributos[a])}</span>
              <span className="atributo__base">
                base{' '}
                {mestre ? (
                  <CampoNumero
                    className="entrada entrada--mini"
                    rotulo={`${SIGLA_ATRIBUTO[a]} de criação`}
                    valor={ficha.atributosBase[a]}
                    min={-5}
                    max={10}
                    desabilitado={a === 'yan' && ficha.origem === 'esquecido'}
                    aoMudar={(n) => alterar({ atributosBase: { ...ficha.atributosBase, [a]: Math.round(n) } })}
                  />
                ) : (
                  ficha.atributosBase[a]
                )}
              </span>
            </div>
          ))}
        </div>
        {ficha.origem === 'esquecido' && <p className="nota">Esquecidos não possuem Yant: YAN permanece 0 e a reserva é 0.</p>}
        {errosCriacao.length > 0 && (
          <p className="nota nota--alerta" role="status">
            Fora da regra de criação: {errosCriacao.join(' ')} O mestre pode manter os valores como decisão manual.
          </p>
        )}
        <div className="aumentos">
          <span className="aumentos__titulo">Aumentos por nível (+1, teto +6):</span>
          {NIVEIS_AUMENTO.map((nivel) => {
            const feito = ficha.aumentos.find((x) => x.nivel === nivel);
            if (feito) {
              return (
                <span key={nivel} className="aumento">
                  Nível {nivel}: +1 {SIGLA_ATRIBUTO[feito.atributo]}
                  {mestre && <BotaoIcone icone="fechar" rotulo={`Remover o aumento do nível ${nivel}`} tamanho={12} onClick={() => despachar({ tipo: 'ficha.removerAumento', fichaId: ficha.id, nivel })} />}
                </span>
              );
            }
            if (ficha.nivel < nivel) return <span key={nivel} className="aumento aumento--futuro">Nível {nivel}: —</span>;
            return (
              <span key={nivel} className="aumento aumento--pendente">
                Nível {nivel}:
                {mestre ? (
                  <select className="entrada entrada--mini" aria-label={`Registrar o aumento do nível ${nivel}`} value="" onChange={(e) => e.target.value && despachar({ tipo: 'ficha.aumento', fichaId: ficha.id, nivel, atributo: e.target.value as ChaveAtributo })}>
                    <option value="">registrar +1 em…</option>
                    {ATRIBUTOS.filter((a) => !(a === 'yan' && ficha.origem === 'esquecido')).map((a) => (
                      <option key={a} value={a}>
                        {SIGLA_ATRIBUTO[a]}
                      </option>
                    ))}
                  </select>
                ) : (
                  ' a registrar'
                )}
              </span>
            );
          })}
          <RefRegra id="aumento-fis" rotulo="FIS: +2 PV e VIG" />
        </div>
      </section>

      <section className="bloco">
        <h3 className="bloco__titulo">Recursos</h3>
        <div className="recursos recursos--ficha">
          {(['pv', 'vig', 'ry'] as const).map((r) => {
            const max = r === 'pv' ? d.pvMax.total : r === 'vig' ? d.vigMax.total : d.ryMax.total;
            const atual = r === 'pv' ? ficha.pvAtual : r === 'vig' ? ficha.vigAtual : ficha.ryAtual;
            return (
              <BarraRecurso key={r} recurso={r} atual={atual} max={max}>
                {podeRecursos && max > 0 && (
                  <CampoNumero className="entrada entrada--mini" rotulo={`${r.toUpperCase()} atual`} valor={atual} min={0} max={max} aoMudar={(n) => despachar({ tipo: 'ficha.recurso', fichaId: ficha.id, recurso: r, modo: 'definir', valor: Math.round(n), motivo: 'Edição na ficha' })} />
                )}
              </BarraRecurso>
            );
          })}
        </div>
        <div className="parcelas">
          <Parcela rotulo="PV máximos" valor={d.pvMax} regra="pv-vig" />
          <Parcela rotulo="VIG máxima" valor={d.vigMax} regra="pv-vig" />
          <Parcela rotulo="RY máxima" valor={d.ryMax} regra="ry" />
          <Parcela rotulo="Defesa" valor={d.defesa} regra="ataque" />
          <Parcela rotulo="Redução" valor={d.reducao} regra="armaduras" />
          <Parcela rotulo="Carga (espaços)" valor={d.carga} regra="carga" />
        </div>
        <p className="nota">
          Defesa = 10 + DES {formatarModificador(d.atributos.des)} + equipamento {d.defesa.equipamento}
          {d.defesa.equipamentoBruto > d.defesa.equipamento ? ` (teto +4; equipado +${d.defesa.equipamentoBruto})` : ''}. Redução = armadura {d.reducao.armadura}
          {d.reducao.natural > 0 ? ` + natural ${d.reducao.natural} (até 6)` : ''}. Carga em uso: {d.carga.usada} de {d.carga.total}
          {d.carga.usada > d.carga.total ? ' — acima da capacidade.' : '.'}
        </p>
        {d.penalidadeRyZero === 'pendente' && (
          <p className="nota">
            RY 0 permanente: a penalidade de −2 em MEN/YAN não é aplicada a Esquecidos (aplicação pendente de esclarecimento). <RefRegra id="ry-zero" />
          </p>
        )}
        {ficha.origem !== 'esquecido' && (
          <div className="linha-botoes linha-botoes--centro">
            <span className="nota">
              Reserva de Yant: <strong>{ficha.ryBase}</strong>. {ficha.ryDetalhe || 'Ainda não definida.'}
            </span>
            {mestre && (
              <>
                <Botao
                  pequeno
                  icone="dado"
                  onClick={async () => {
                    if (ficha.ryBase === 0 || (await confirmar({ titulo: 'Sortear a reserva de novo', texto: `A reserva de Yant é fixa. Substituir o valor atual (${ficha.ryBase}) por um novo sorteio?`, confirmar: 'Sortear de novo' }))) {
                      despachar({ tipo: 'ficha.ry', fichaId: ficha.id, modo: 'sortear' });
                    }
                  }}
                >
                  Sortear ({ficha.origem === 'normal' ? '8 + 1d6' : 'dobro de 8 + 1d6'})
                </Botao>
                <label className="campo-linha">
                  <span>Definir:</span>
                  <CampoNumero className="entrada entrada--mini" rotulo="Reserva de Yant (manual)" valor={ficha.ryBase} min={0} max={999} aoMudar={(n) => despachar({ tipo: 'ficha.ry', fichaId: ficha.id, modo: 'manual', valor: Math.round(n) })} />
                </label>
              </>
            )}
          </div>
        )}
        {mestre && (
          <div className="linha-botoes">
            <span className="nota">
              Descanso <RefRegra id="recuperacao" />:
            </span>
            {(
              [
                ['vig-10min', '10 min (VIG)'],
                ['ry-30min', '30 min (VIG e RY)'],
                ['1h', '1 h (metade dos PV)'],
                ['8h', '8 h (tudo)'],
              ] as const
            ).map(([tipo, nome]) => (
              <Botao key={tipo} pequeno variante="fantasma" onClick={() => despachar({ tipo: 'ficha.descanso', fichaIds: [ficha.id], descanso: tipo })}>
                {nome}
              </Botao>
            ))}
          </div>
        )}
        <Ajustes ficha={ficha} mestre={mestre} />
      </section>

      <section className="bloco" ref={refInventario} id="inventario">
        <h3 className="bloco__titulo">
          Inventário <RefRegra id="carga" />
        </h3>
        <Inventario ficha={ficha} editavel={podeRecursos} mestre={mestre} />
      </section>

      <section className="bloco">
        <h3 className="bloco__titulo">Técnicas</h3>
        <p className="nota">
          Vagas pelo nível: {ficha.origem === 'esquecido' ? 'sem técnicas de Yant' : `${vagas.yantComuns} de Yant comuns${vagas.yantAdaptabilidade ? ` + ${vagas.yantAdaptabilidade} de Adaptabilidade Progressiva` : ''}`}; {vagas.fisicas} físicas (até{' '}
          {vagas.limiteFisicasExtras} extra(s) por treino). A contagem é uma conferência: o aplicativo não bloqueia a ficha. <RefRegra id="tecnicas-fisicas" /> <RefRegra id="graus-yant" />
        </p>
        <Tecnicas ficha={ficha} mestre={mestre} />
      </section>

      <section className="bloco">
        <h3 className="bloco__titulo">Notas</h3>
        <div className="formulario">
          <Campo rotulo="Notas públicas (visíveis a quem recebe a ficha)" largo>
            <textarea className="entrada entrada--area" rows={3} maxLength={5000} disabled={!podeRecursos} defaultValue={ficha.notasPublicas} onBlur={(e) => e.target.value !== ficha.notasPublicas && alterar({ notasPublicas: e.target.value })} />
          </Campo>
          <Campo rotulo="Notas privadas (só o dono da ficha e o mestre)" largo>
            <textarea className="entrada entrada--area" rows={3} maxLength={5000} disabled={!podeRecursos} defaultValue={ficha.notasPrivadas} onBlur={(e) => e.target.value !== ficha.notasPrivadas && alterar({ notasPrivadas: e.target.value })} />
          </Campo>
          {mestre && (
            <Campo rotulo="Notas do mestre (nunca enviadas a jogadores)" largo>
              <textarea className="entrada entrada--area" rows={3} maxLength={5000} defaultValue={ficha.notasMestre} onBlur={(e) => e.target.value !== ficha.notasMestre && alterar({ notasMestre: e.target.value })} />
            </Campo>
          )}
        </div>
      </section>

      <section className="bloco">
        <h3 className="bloco__titulo">Registro de alterações</h3>
        {ficha.registroOrigem && <p className="nota">{ficha.registroOrigem}</p>}
        {ficha.registro.length === 0 ? (
          <p className="nota">Nenhuma alteração registrada.</p>
        ) : (
          <div className="rolagem-x">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Quem</th>
                  <th scope="col">Campo</th>
                  <th scope="col">De</th>
                  <th scope="col">Para</th>
                  <th scope="col">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {[...ficha.registro].reverse().slice(0, 40).map((r) => (
                  <tr key={r.id}>
                    <td>{dataCurta(r.em)}</td>
                    <td>{r.autor}</td>
                    <td>{r.campo}</td>
                    <td>{r.de}</td>
                    <td>{r.para}</td>
                    <td>{r.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="linha-botoes">
        <Botao
          icone="exportar"
          onClick={() => baixarBlob(new Blob([JSON.stringify(exportarFicha(ficha), null, 2)], { type: 'application/json' }), `${nomeDeArquivo(ficha.nome)}.ficha.json`)}
          title="Exporta os dados da ficha. Retrato, dono e notas do mestre não acompanham o arquivo."
        >
          Exportar ficha
        </Botao>
        {mestre && (
          <>
            <Botao icone="duplicar" onClick={() => despachar({ tipo: 'ficha.duplicar', fichaId: ficha.id })}>
              Duplicar
            </Botao>
            <Botao variante="perigo" icone="lixeira" onClick={() => void excluir()}>
              Excluir ficha
            </Botao>
          </>
        )}
      </footer>
    </div>
  );
}

function Ajustes({ ficha, mestre }: { ficha: Ficha; mestre: boolean }) {
  const { despachar } = useVisao();
  const [alvo, setAlvo] = useState<AjusteManual['alvo']>('pvMax');
  const [valor, setValor] = useState(1);
  const [motivo, setMotivo] = useState('');
  if (!mestre && ficha.ajustes.length === 0) return null;
  return (
    <details className="token-form" open={ficha.ajustes.length > 0}>
      <summary>Ajustes manuais registrados ({ficha.ajustes.length})</summary>
      <div className="formulario formulario--compacto">
        <p className="nota">Um ajuste soma ou subtrai do valor calculado pela regra e fica registrado com motivo. Ele não muda a fórmula nem o cânone.</p>
        {ficha.ajustes.length > 0 && (
          <ul className="lista-linhas">
            {ficha.ajustes.map((a) => (
              <li key={a.id}>
                <span>
                  <strong>
                    {NOME_ALVO[a.alvo]} {formatarModificador(a.valor)}
                  </strong>{' '}
                  — {a.motivo} <span className="nota">({a.autor}, {dataCurta(a.em)})</span>
                </span>
                {mestre && <BotaoIcone icone="lixeira" rotulo="Remover este ajuste" tamanho={14} onClick={() => despachar({ tipo: 'ficha.removerAjuste', fichaId: ficha.id, ajusteId: a.id })} />}
              </li>
            ))}
          </ul>
        )}
        {mestre && (
          <form
            className="linha-botoes linha-botoes--base"
            onSubmit={(e) => {
              e.preventDefault();
              if (!motivo.trim() || valor === 0) return;
              if (despachar({ tipo: 'ficha.ajuste', fichaId: ficha.id, alvo, valor, motivo: motivo.trim() }).ok) setMotivo('');
            }}
          >
            <Campo rotulo="Valor ajustado">
              <select className="entrada" value={alvo} onChange={(e) => setAlvo(e.target.value as AjusteManual['alvo'])}>
                {ALVOS_AJUSTE.map((x) => (
                  <option key={x} value={x}>
                    {NOME_ALVO[x]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Ajuste (±)">
              <CampoNumero valor={valor} min={-999} max={999} aoMudar={(n) => setValor(Math.round(n))} />
            </Campo>
            <Campo rotulo="Motivo (obrigatório)">
              <input className="entrada" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
            <Botao type="submit" disabled={!motivo.trim() || valor === 0}>
              Registrar ajuste
            </Botao>
          </form>
        )}
      </div>
    </details>
  );
}

function Inventario({ ficha, editavel, mestre }: { ficha: Ficha; editavel: boolean; mestre: boolean }) {
  const { despachar } = useVisao();
  const salvar = (item: ItemEquipamento) => despachar({ tipo: 'ficha.item', fichaId: ficha.id, item });
  return (
    <>
      <div className="linha-botoes linha-botoes--centro">
        <label className="campo-linha">
          <span>Créditos (Cr):</span>
          <CampoNumero className="entrada entrada--mini" rotulo="Créditos" valor={ficha.creditos} min={0} max={99999999} desabilitado={!editavel} aoMudar={(n) => despachar({ tipo: 'ficha.atualizar', fichaId: ficha.id, alteracoes: { creditos: Math.round(n) } })} />
        </label>
        {editavel && (
          <Botao pequeno icone="mais" onClick={() => salvar(novoItem({ nome: 'Novo item' }))}>
            Adicionar item
          </Botao>
        )}
        {mestre && ficha.equipamento.length === 0 && (
          <Botao
            pequeno
            variante="fantasma"
            onClick={() => {
              for (const item of equipamentoInicial()) salvar(item);
              if (ficha.creditos === 0) despachar({ tipo: 'ficha.atualizar', fichaId: ficha.id, alteracoes: { creditos: CREDITOS_INICIAIS } });
            }}
          >
            Equipamento inicial (150 Cr)
          </Botao>
        )}
        <RefRegra id="equipamento-inicial" />
      </div>
      {ficha.equipamento.length === 0 ? (
        <p className="nota">Inventário vazio.</p>
      ) : (
        <div className="rolagem-x">
          <table className="tabela tabela--inventario">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Tipo</th>
                <th scope="col">Categoria</th>
                <th scope="col">Espaços</th>
                <th scope="col">Qtd.</th>
                <th scope="col">Em uso</th>
                <th scope="col">
                  <span className="sr">Remover</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ficha.equipamento.map((i) => (
                <tr key={i.id}>
                  <td>
                    <input className="entrada" aria-label="Nome do item" defaultValue={i.nome} maxLength={80} disabled={!editavel} onBlur={(e) => e.target.value.trim() && e.target.value !== i.nome && salvar({ ...i, nome: e.target.value.trim() })} />
                  </td>
                  <td>
                    <select
                      className="entrada"
                      aria-label={`Tipo de ${i.nome}`}
                      value={i.tipo}
                      disabled={!editavel}
                      onChange={(e) => {
                        const tipo = e.target.value as ItemEquipamento['tipo'];
                        salvar({ ...i, tipo, categoria: tipo === 'arma' || tipo === 'armadura' ? i.categoria ?? 'leve' : null });
                      }}
                    >
                      {(Object.keys(NOME_TIPO_ITEM) as ItemEquipamento['tipo'][]).map((t) => (
                        <option key={t} value={t}>
                          {NOME_TIPO_ITEM[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {i.tipo === 'arma' || i.tipo === 'armadura' ? (
                      <select className="entrada" aria-label={`Categoria de ${i.nome}`} value={i.categoria ?? 'leve'} disabled={!editavel} onChange={(e) => salvar({ ...i, categoria: e.target.value as ItemEquipamento['categoria'] })}>
                        <option value="leve">{i.tipo === 'arma' ? 'Leve (d4)' : 'Leve (+1 / red. 1)'}</option>
                        <option value="media">{i.tipo === 'arma' ? 'Média (d6)' : 'Média (+2 / red. 2)'}</option>
                        <option value="pesada">{i.tipo === 'arma' ? 'Pesada (d8)' : 'Pesada (+3 / red. 3)'}</option>
                      </select>
                    ) : i.tipo === 'escudo' ? (
                      'Defesa +1'
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <CampoNumero className="entrada entrada--mini" rotulo={`Espaços de ${i.nome}`} valor={i.espacos} min={0} max={99} passo={0.5} desabilitado={!editavel} aoMudar={(n) => salvar({ ...i, espacos: n })} />
                  </td>
                  <td>
                    <CampoNumero className="entrada entrada--mini" rotulo={`Quantidade de ${i.nome}`} valor={i.quantidade} min={0} max={9999} desabilitado={!editavel} aoMudar={(n) => salvar({ ...i, quantidade: Math.round(n) })} />
                  </td>
                  <td>
                    {i.tipo !== 'item' && (
                      <input type="checkbox" aria-label={`${i.nome} equipado`} checked={i.equipado} disabled={!editavel} onChange={(e) => salvar({ ...i, equipado: e.target.checked })} />
                    )}
                  </td>
                  <td>{editavel && <BotaoIcone icone="lixeira" rotulo={`Remover ${i.nome}`} tamanho={15} onClick={() => despachar({ tipo: 'ficha.removerItem', fichaId: ficha.id, itemId: i.id })} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Tecnicas({ ficha, mestre }: { ficha: Ficha; mestre: boolean }) {
  const { despachar } = useVisao();
  const [codigo, setCodigo] = useState('');
  const salvar = (tecnica: TecnicaFicha) => despachar({ tipo: 'ficha.tecnica', fichaId: ficha.id, tecnica });
  const jaTem = new Set(ficha.tecnicas.map((t) => (t.refCatalogo ?? '').toUpperCase()));
  return (
    <>
      {ficha.tecnicas.length === 0 ? (
        <p className="nota">Nenhuma técnica registrada.</p>
      ) : (
        <ul className="tecnicas">
          {ficha.tecnicas.map((t) => {
            const c = tecnicaDoCatalogo(t.refCatalogo);
            return (
              <li key={t.id} className="tecnica">
                <div className="tecnica__topo">
                  {mestre && !c ? (
                    <input className="entrada" aria-label="Nome da técnica" defaultValue={t.nome} maxLength={120} onBlur={(e) => e.target.value.trim() && e.target.value !== t.nome && salvar({ ...t, nome: e.target.value.trim() })} />
                  ) : (
                    <strong>{c ? `${c.codigo} ${c.nome} ${c.versao}` : t.nome}</strong>
                  )}
                  {c ? (
                    <Etiqueta tom={c.status === 'aprovada' ? (c.automacao === 'automatica' ? 'verde' : 'latao') : c.status === 'pendente' ? 'alerta' : 'vinho'}>{rotuloAutomacao(c)}</Etiqueta>
                  ) : (
                    <Etiqueta>Registro livre — resolução pelo mestre</Etiqueta>
                  )}
                  {mestre && <BotaoIcone icone="lixeira" rotulo={`Remover a técnica ${t.nome}`} tamanho={15} onClick={() => despachar({ tipo: 'ficha.removerTecnica', fichaId: ficha.id, tecnicaId: t.id })} />}
                </div>
                <div className="tecnica__meta">
                  {t.tipo === 'yant' ? (
                    <label className="campo-linha">
                      <span>Yant · grau</span>
                      <select className="entrada entrada--mini" aria-label="Grau" value={t.grau ?? 1} disabled={!mestre} onChange={(e) => salvar({ ...t, grau: Number(e.target.value) })}>
                        {[1, 2, 3, 4].map((g) => (
                          <option key={g} value={g}>
                            {ROTULO_GRAU[g]} ({CUSTO_GRAU_YANT[g]} RY)
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="campo-linha">
                      <span>Física ·</span>
                      <select className="entrada entrada--mini" aria-label="Categoria" value={t.categoria ?? 'especial'} disabled={!mestre || !!c} onChange={(e) => salvar({ ...t, categoria: e.target.value as TecnicaFicha['categoria'] })}>
                        <option value="especial">Especial ({CUSTO_CATEGORIA_FISICA.especial} VIG)</option>
                        <option value="avancada">Avançada ({CUSTO_CATEGORIA_FISICA.avancada} VIG, nível 5)</option>
                        <option value="suprema">Suprema ({CUSTO_CATEGORIA_FISICA.suprema} VIG, nível 10)</option>
                      </select>
                    </label>
                  )}
                  {c && <span className="nota">{c.auditoria}</span>}
                </div>
                {c && <p className="nota">{c.nota}</p>}
                {(mestre || t.notas) && (
                  <textarea className="entrada entrada--area" aria-label={`Anotações sobre ${t.nome}`} rows={1} maxLength={1000} placeholder="Anotações" disabled={!mestre} defaultValue={t.notas} onBlur={(e) => e.target.value !== t.notas && salvar({ ...t, notas: e.target.value })} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {mestre && (
        <div className="linha-botoes linha-botoes--base">
          <Campo rotulo="Adicionar técnica do catálogo">
            <select className="entrada" value={codigo} onChange={(e) => setCodigo(e.target.value)}>
              <option value="">Escolher…</option>
              {CATALOGO_TECNICAS.filter((c) => !jaTem.has(c.codigo)).map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} {c.nome} — {rotuloAutomacao(c)}
                </option>
              ))}
            </select>
          </Campo>
          <Botao
            disabled={!codigo}
            onClick={() => {
              const c = tecnicaDoCatalogo(codigo);
              if (!c) return;
              salvar({ id: novoId('tec'), nome: c.nome, tipo: 'fisica', grau: null, categoria: c.categoria, refCatalogo: c.codigo, notas: '' });
              setCodigo('');
            }}
          >
            Adicionar
          </Botao>
          <Botao variante="fantasma" onClick={() => salvar({ id: novoId('tec'), nome: 'Técnica física', tipo: 'fisica', grau: null, categoria: 'especial', refCatalogo: null, notas: '' })}>
            Técnica física livre
          </Botao>
          {ficha.origem !== 'esquecido' && (
            <Botao variante="fantasma" onClick={() => salvar({ id: novoId('tec'), nome: 'Técnica de Yant', tipo: 'yant', grau: 1, categoria: null, refCatalogo: null, notas: '' })}>
              Técnica de Yant livre
            </Botao>
          )}
        </div>
      )}
    </>
  );
}
