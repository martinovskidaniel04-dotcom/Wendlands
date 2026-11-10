/**
 * Inspetor (painel direito): personagem selecionado, recursos, ações rápidas,
 * dados do token e movimento sem arrastar.
 */
import { useState } from 'react';
import type { Cena, ChaveAtributo, ChaveRecurso, Ficha, Id, Token } from '../../dominio/esquema';
import { ATRIBUTOS, CORES_TOKEN } from '../../dominio/esquema';
import { tokenPertenceA } from '../../dominio/comandos';
import { celulaDe, centroCelula, distanciaMetros, formatarMetros } from '../../dominio/mapa';
import { CATEGORIAS_ARMA, NOME_ARMA, type CategoriaArma } from '../../dominio/regras/combate';
import { CUSTO_GRAU_YANT, NOME_ORIGEM, ROTULO_GRAU, SIGLA_ATRIBUTO, derivar, formatarModificador } from '../../dominio/regras/ficha';
import { ACEITAR_IMAGENS, BarraRecurso, Botao, BotaoIcone, Campo, CampoNumero, Dialogo, EstadoVazio, Etiqueta, RefRegra, Retrato, escolherArquivo } from '../comuns';
import { useConfirmar, useLoja, useVisao } from '../contexto';
import { Icone, type NomeIcone } from '../icones';

interface Props {
  cena: Cena | null;
  selecao: Id[];
  aoAbrirFicha(fichaId: Id, secao?: 'inventario'): void;
  aoRolagemLivre(): void;
  aguardandoDestino: boolean;
  aoPedirDestino(): void;
  aoPedirExclusao(ids: Id[]): void;
  aoVerCombate(): void;
}

const NOME_COR: Record<Token['cor'], string> = { neutro: 'Neutro', latao: 'Latão', vinho: 'Vinho', azul: 'Azul', verde: 'Verde' };
const NOME_CONDICAO = { normal: 'Normal', incapacitado: 'Incapacitado (0 PV)', estabilizado: 'Estabilizado', critico: 'Estado crítico — exige ajuda' } as const;

export function Inspetor(props: Props) {
  const { cena, selecao } = props;
  const { campanha, ator, ehMestre } = useVisao();
  const tokens = cena ? cena.tokens.filter((t) => selecao.includes(t.id)) : [];

  if (tokens.length > 1 && cena) return <VariosTokens {...props} cena={cena} tokens={tokens} />;

  const token = tokens[0] ?? null;
  let ficha: Ficha | null = token?.fichaId ? campanha.fichas.find((f) => f.id === token.fichaId) ?? null : null;
  // Sem seleção, o jogador vê a própria ficha.
  if (!token && !ehMestre && ator.jogadorId) ficha = campanha.fichas.find((f) => f.donoJogadorId === ator.jogadorId) ?? null;

  if (!token && !ficha) {
    return (
      <div className="inspetor">
        <EstadoVazio icone="pessoa" titulo="Nenhum token selecionado">
          Selecione um token no mapa para ver o personagem, os recursos e as ações.
        </EstadoVazio>
        <p className="rodape-nota">Decisões pelo mestre.</p>
      </div>
    );
  }

  return (
    <div className="inspetor">
      {ficha ? <CartaoFicha ficha={ficha} token={token} {...props} /> : token && <CabecalhoToken token={token} />}
      {token && cena && <SecaoMovimento {...props} cena={cena} tokens={[token]} />}
      {token && cena && ehMestre && <SecaoToken cena={cena} token={token} aoPedirExclusao={props.aoPedirExclusao} />}
      <p className="rodape-nota">Decisões pelo mestre.</p>
    </div>
  );
}

function CabecalhoToken({ token }: { token: Token }) {
  return (
    <header className="persona">
      <Retrato arquivoId={token.retratoArquivoId} nome={token.nome} tamanho={68} />
      <div className="persona__texto">
        <h2 className="persona__nome">{token.nome}</h2>
        <p className="persona__sub">Token sem ficha vinculada</p>
      </div>
    </header>
  );
}

function CartaoFicha({ ficha, token, cena, aoAbrirFicha, aoRolagemLivre, aoVerCombate }: Props & { ficha: Ficha; token: Token | null }) {
  const { campanha, ator, ehMestre, previa, despachar } = useVisao();
  const confirmar = useConfirmar();
  const [acaoAberta, setAcaoAberta] = useState<'teste' | 'yant' | null>(null);
  const [privado, setPrivado] = useState(false);
  const [atacando, setAtacando] = useState(false);
  const podeEditar = !previa && (ehMestre || ficha.donoJogadorId === ator.jogadorId);

  if (ficha.visaoParcial) {
    return (
      <>
        <header className="persona">
          <Retrato arquivoId={token?.retratoArquivoId ?? ficha.retratoArquivoId} nome={ficha.nome} tamanho={68} />
          <div className="persona__texto">
            <h2 className="persona__nome">{ficha.nome}</h2>
            <p className="persona__sub">{ficha.subtitulo || 'Resumo público'}</p>
          </div>
        </header>
        <p className="nota">{ficha.notasPublicas || 'Sem notas públicas.'}</p>
      </>
    );
  }

  const d = derivar(ficha);
  const visibilidade = privado ? 'mestre' : 'publica';
  const recuperar = async (recurso: 'vig' | 'ry') => {
    const atual = recurso === 'vig' ? ficha.vigAtual : ficha.ryAtual;
    const max = recurso === 'vig' ? d.vigMax.total : d.ryMax.total;
    const ganho = recurso === 'vig' ? 3 : 2;
    const emCombate = campanha.combate?.participantes.some((p) => p.fichaId === ficha.id) ?? false;
    const ok = await confirmar({
      titulo: recurso === 'vig' ? 'Recuperar vigor' : 'Recuperar Yant',
      texto: (
        <>
          {ficha.nome} recupera +{ganho} {recurso.toUpperCase()}: {atual} → {Math.min(max, atual + ganho)} (máximo {max}).
          {emCombate ? ' Consome a ação principal desta rodada.' : ' Fora de combate nenhuma ação é marcada.'}
        </>
      ),
      confirmar: 'Recuperar',
    });
    if (ok) despachar({ tipo: 'ficha.recuperar', fichaId: ficha.id, recurso });
  };

  return (
    <>
      <header className="persona">
        <Retrato arquivoId={token?.retratoArquivoId ?? ficha.retratoArquivoId} nome={ficha.nome} tamanho={68} />
        <div className="persona__texto">
          <h2 className="persona__nome">{ficha.nome}</h2>
          <p className="persona__sub">
            {ficha.subtitulo || `${NOME_ORIGEM[ficha.origem]} · nível ${ficha.nivel}`}
            {ficha.demo && ' · fictício'}
          </p>
        </div>
        <BotaoIcone icone="editar" rotulo={`Abrir a ficha de ${ficha.nome}`} onClick={() => aoAbrirFicha(ficha.id)} />
      </header>

      <div className="atributos" role="group" aria-label="Atributos">
        {ATRIBUTOS.map((a) => (
          <div key={a} className="atributo" title={d.atributosTeste[a] !== d.atributos[a] ? '−2 em testes por RY 0' : undefined}>
            <span className="atributo__sigla">{SIGLA_ATRIBUTO[a]}</span>
            <span className="atributo__valor">{formatarModificador(d.atributos[a])}</span>
            {d.atributosTeste[a] !== d.atributos[a] && <span className="atributo__pena">teste {formatarModificador(d.atributosTeste[a])}</span>}
          </div>
        ))}
      </div>

      <div className="recursos">
        <LinhaRecurso ficha={ficha} recurso="pv" atual={ficha.pvAtual} max={d.pvMax.total} editavel={podeEditar} />
        <LinhaRecurso ficha={ficha} recurso="vig" atual={ficha.vigAtual} max={d.vigMax.total} editavel={podeEditar} />
        <LinhaRecurso ficha={ficha} recurso="ry" atual={ficha.ryAtual} max={d.ryMax.total} editavel={podeEditar && d.ryMax.total > 0} />
      </div>
      {d.penalidadeRyZero === 'ativa' && (
        <p className="nota nota--alerta">
          RY em 0: −2 em MEN e YAN até recuperar. <RefRegra id="ry-zero" />
        </p>
      )}

      {ficha.condicao.estado !== 'normal' && <Condicao ficha={ficha} />}

      <p className="derivados">
        <span>
          Defesa <strong>{d.defesa.total}</strong>
        </span>
        <span>
          Redução <strong>{d.reducao.total}</strong>
        </span>
        <span>
          Carga <strong>{d.carga.usada}</strong>/{d.carga.total}
        </span>
        <RefRegra id="armaduras" />
      </p>

      <div className="par-botoes">
        <Botao icone="ficha" onClick={() => aoAbrirFicha(ficha.id)}>
          Ficha
        </Botao>
        <Botao icone="mochila" onClick={() => aoAbrirFicha(ficha.id, 'inventario')}>
          Inventário
        </Botao>
      </div>

      <section className="acoes" aria-label="Ações">
        <h3 className="secao__titulo">Ações</h3>
        <LinhaAcao icone="dado" rotulo="Teste de atributo" expandida={acaoAberta === 'teste'} aoClicar={() => setAcaoAberta(acaoAberta === 'teste' ? null : 'teste')} desabilitada={!podeEditar} />
        {acaoAberta === 'teste' && (
          <div className="acao__detalhe">
            <div className="linha-botoes">
              {ATRIBUTOS.map((a: ChaveAtributo) => (
                <Botao key={a} pequeno onClick={() => despachar({ tipo: 'teste.atributo', fichaId: ficha.id, atributo: a, visibilidade })} aria-label={`Rolar teste de ${SIGLA_ATRIBUTO[a]}: d20 ${formatarModificador(d.atributosTeste[a])}`}>
                  {SIGLA_ATRIBUTO[a]} {formatarModificador(d.atributosTeste[a])}
                </Botao>
              ))}
            </div>
            <label className="alternar">
              <input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} />
              <span>Rolagem privada ao mestre</span>
            </label>
          </div>
        )}
        <LinhaAcao icone="coracao" rotulo="Recuperar vigor" aoClicar={() => void recuperar('vig')} desabilitada={!podeEditar || ficha.vigAtual >= d.vigMax.total} />
        {d.ryMax.total > 0 && <LinhaAcao icone="cristal" rotulo="Recuperar Yant" aoClicar={() => void recuperar('ry')} desabilitada={!podeEditar || ficha.ryAtual >= d.ryMax.total} />}
        {d.grauYantMaximo > 0 && (
          <>
            <LinhaAcao icone="cristal" rotulo="Usar Yant (custo por grau)" expandida={acaoAberta === 'yant'} aoClicar={() => setAcaoAberta(acaoAberta === 'yant' ? null : 'yant')} desabilitada={!podeEditar} />
            {acaoAberta === 'yant' && (
              <div className="acao__detalhe">
                <div className="linha-botoes">
                  {[1, 2, 3, 4].filter((g) => g <= d.grauYantMaximo).map((g) => (
                    <Botao key={g} pequeno disabled={ficha.ryAtual < CUSTO_GRAU_YANT[g]} onClick={() => despachar({ tipo: 'ficha.conjurar', fichaId: ficha.id, grau: g, nome: '' })}>
                      Grau {ROTULO_GRAU[g]} · {CUSTO_GRAU_YANT[g]} RY
                    </Botao>
                  ))}
                </div>
                <p className="nota">
                  Desconta o custo fixo do grau. O efeito da técnica é decidido pelo mestre. <RefRegra id="graus-yant" />
                </p>
              </div>
            )}
          </>
        )}
        <LinhaAcao icone="dado" rotulo="Rolagem livre" aoClicar={aoRolagemLivre} />
        {ehMestre && cena && <LinhaAcao icone="espada" rotulo="Atacar…" aoClicar={() => setAtacando(true)} />}
      </section>
      {atacando && cena && (
        <DialogoAtaque
          atacante={ficha}
          cena={cena}
          aoFechar={() => setAtacando(false)}
          aoResolver={() => {
            setAtacando(false);
            aoVerCombate();
          }}
        />
      )}
    </>
  );
}

function LinhaAcao({ icone, rotulo, aoClicar, expandida, desabilitada }: { icone: NomeIcone; rotulo: string; aoClicar(): void; expandida?: boolean; desabilitada?: boolean }) {
  return (
    <button type="button" className="acao" onClick={aoClicar} aria-expanded={expandida} disabled={desabilitada}>
      <Icone nome={icone} tamanho={19} />
      <span>{rotulo}</span>
      <Icone nome={expandida ? 'setaBaixo' : 'setaDireita'} tamanho={15} className="acao__seta" />
    </button>
  );
}

function LinhaRecurso({ ficha, recurso, atual, max, editavel }: { ficha: Ficha; recurso: ChaveRecurso; atual: number; max: number; editavel: boolean }) {
  const { despachar } = useVisao();
  const [aberto, setAberto] = useState(false);
  const [quantia, setQuantia] = useState(1);
  const [motivo, setMotivo] = useState('');
  const aplicar = (modo: 'delta' | 'definir', valor: number) => {
    despachar({ tipo: 'ficha.recurso', fichaId: ficha.id, recurso, modo, valor, motivo });
    setMotivo('');
  };
  const nome = recurso.toUpperCase();
  return (
    <div className="recurso-linha">
      <BarraRecurso recurso={recurso} atual={atual} max={max}>
        {editavel && (
          <span className="recurso__botoes">
            <BotaoIcone icone="menos" rotulo={`Tirar 1 de ${nome}`} tamanho={14} disabled={atual <= 0} onClick={() => aplicar('delta', -1)} />
            <BotaoIcone icone="mais" rotulo={`Somar 1 a ${nome}`} tamanho={14} disabled={atual >= max} onClick={() => aplicar('delta', 1)} />
            <BotaoIcone icone="editar" rotulo={`Ajustar ${nome} por um valor`} tamanho={14} ativo={aberto} onClick={() => setAberto((v) => !v)} />
          </span>
        )}
      </BarraRecurso>
      {aberto && editavel && (
        <div className="recurso__ajuste">
          <CampoNumero rotulo={`Valor para ajustar ${nome}`} valor={quantia} min={0} max={9999} aoMudar={(n) => setQuantia(Math.round(n))} />
          <input className="entrada" aria-label="Motivo (opcional)" placeholder="Motivo (opcional)" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="linha-botoes">
            <Botao pequeno onClick={() => aplicar('delta', -quantia)}>
              Tirar {quantia}
            </Botao>
            <Botao pequeno onClick={() => aplicar('delta', quantia)}>
              Somar {quantia}
            </Botao>
            <Botao pequeno variante="fantasma" onClick={() => aplicar('definir', quantia)}>
              Definir em {quantia}
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}

function Condicao({ ficha }: { ficha: Ficha }) {
  const { campanha, ehMestre, despachar } = useVisao();
  const [ajudante, setAjudante] = useState('');
  const outros = campanha.fichas.filter((f) => f.id !== ficha.id && !f.visaoParcial);
  return (
    <div className="condicao" role="status">
      <Etiqueta tom={ficha.condicao.estado === 'estabilizado' ? 'verde' : 'vinho'}>{NOME_CONDICAO[ficha.condicao.estado]}</Etiqueta>
      <RefRegra id="zero-pv" />
      {ficha.condicao.estado === 'incapacitado' && (
        <>
          <p className="nota">
            Sucessos {ficha.condicao.sucessos}/3 · Falhas {ficha.condicao.falhas}/3
          </p>
          {ehMestre && (
            <>
              <Botao pequeno icone="dado" onClick={() => despachar({ tipo: 'ficha.estabilizacao', fichaId: ficha.id, modo: 'proprio', ajudanteFichaId: null })}>
                Teste no próprio turno (FIS, CD 10)
              </Botao>
              <div className="linha-botoes">
                <select className="entrada" aria-label="Quem presta ajuda" value={ajudante} onChange={(e) => setAjudante(e.target.value)}>
                  <option value="">Ajuda de…</option>
                  {outros.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
                <Botao pequeno disabled={!ajudante} onClick={() => despachar({ tipo: 'ficha.estabilizacao', fichaId: ficha.id, modo: 'ajuda', ajudanteFichaId: ajudante })}>
                  Estabilizar (MEN, CD 12)
                </Botao>
              </div>
              <div className="linha-botoes">
                <Botao pequeno variante="fantasma" onClick={() => despachar({ tipo: 'ficha.condicao', fichaId: ficha.id, estado: 'incapacitado', sucessos: Math.min(3, ficha.condicao.sucessos + 1), falhas: ficha.condicao.falhas })}>
                  + sucesso
                </Botao>
                <Botao pequeno variante="fantasma" onClick={() => despachar({ tipo: 'ficha.condicao', fichaId: ficha.id, estado: 'incapacitado', sucessos: ficha.condicao.sucessos, falhas: Math.min(3, ficha.condicao.falhas + 1) })}>
                  + falha
                </Botao>
                <Botao pequeno variante="fantasma" onClick={() => despachar({ tipo: 'ficha.condicao', fichaId: ficha.id, estado: 'estabilizado', sucessos: 0, falhas: 0 })}>
                  Marcar estabilizado
                </Botao>
              </div>
            </>
          )}
        </>
      )}
      {ficha.condicao.estado === 'critico' && <p className="nota">Três falhas: estado crítico. Exige ajuda; não há morte instantânea.</p>}
    </div>
  );
}

function SecaoMovimento({ cena, tokens, aguardandoDestino, aoPedirDestino }: Props & { cena: Cena; tokens: Token[] }) {
  const { campanha, ator, ehMestre, previa, despachar } = useVisao();
  const moveis = tokens.filter((t) => !previa && (ehMestre || (ator.jogadorId !== null && tokenPertenceA(campanha, t, ator.jogadorId))));
  if (moveis.length === 0) return null;
  const g = cena.grade;
  const mover = (dx: number, dy: number) => {
    const movimentos = moveis.map((t) => {
      const [cx, cy] = celulaDe(t, g);
      const alvo = g.encaixar ? centroCelula(cx + dx, cy + dy, g) : { x: t.x + dx * g.tamanhoCelula, y: t.y + dy * g.tamanhoCelula };
      const par = Math.round(t.tamanho) % 2 === 0;
      const p = g.encaixar && par ? { x: t.x + dx * g.tamanhoCelula, y: t.y + dy * g.tamanhoCelula } : alvo;
      return { tokenId: t.id, x: Math.min(cena.largura, Math.max(0, p.x)), y: Math.min(cena.altura, Math.max(0, p.y)) };
    });
    despachar({ tipo: 'token.mover', cenaId: cena.id, movimentos });
  };
  const direcoes: Array<[number, number, string, string]> = [
    [-1, -1, '↖', 'noroeste'], [0, -1, '↑', 'norte'], [1, -1, '↗', 'nordeste'],
    [-1, 0, '←', 'oeste'], [0, 0, '', ''], [1, 0, '→', 'leste'],
    [-1, 1, '↙', 'sudoeste'], [0, 1, '↓', 'sul'], [1, 1, '↘', 'sudeste'],
  ];
  const [cx, cy] = celulaDe(moveis[0], g);
  return (
    <section className="movimento" aria-label="Mover sem arrastar">
      <h3 className="secao__titulo">Mover</h3>
      <div className="movimento__corpo">
        <div className="dpad" role="group" aria-label="Mover uma célula">
          {direcoes.map(([dx, dy, simbolo, nome], i) =>
            dx === 0 && dy === 0 ? (
              <button key={i} type="button" className={`dpad__centro${aguardandoDestino ? ' dpad__centro--ativo' : ''}`} aria-pressed={aguardandoDestino} aria-label="Escolher o destino tocando no mapa" title="Escolher o destino tocando no mapa" onClick={aoPedirDestino}>
                <Icone nome="alvo" tamanho={17} />
              </button>
            ) : (
              <button key={i} type="button" className="dpad__seta" aria-label={`Mover uma célula para ${nome}`} onClick={() => mover(dx, dy)}>
                {simbolo}
              </button>
            ),
          )}
        </div>
        <p className="nota">
          {moveis.length === 1 ? `Coluna ${cx + 1}, linha ${cy + 1}.` : `${moveis.length} tokens.`} Cada célula = {String(g.metrosPorCelula).replace('.', ',')} m. Também é possível usar as setas do teclado com o token em foco.
          {aguardandoDestino && <strong> Toque no mapa para escolher o destino.</strong>}
        </p>
      </div>
    </section>
  );
}

function SecaoToken({ cena, token, aoPedirExclusao }: { cena: Cena; token: Token; aoPedirExclusao(ids: Id[]): void }) {
  const { campanha, despachar } = useVisao();
  const loja = useLoja();
  const alterar = (alteracoes: Partial<Pick<Token, 'nome' | 'tamanho' | 'fichaId' | 'donoJogadorId' | 'oculto' | 'cor' | 'retratoArquivoId'>>) =>
    despachar({ tipo: 'token.atualizar', cenaId: cena.id, tokenId: token.id, alteracoes });
  const trocarRetrato = async () => {
    const arquivo = await escolherArquivo(ACEITAR_IMAGENS);
    if (!arquivo) return;
    const meta = await loja.importarImagem(arquivo, arquivo.name, 'retrato');
    if (meta) alterar({ retratoArquivoId: meta.id });
  };
  return (
    <details className="token-form">
      <summary>Token no mapa</summary>
      <div className="formulario formulario--compacto">
        <Campo rotulo="Nome no mapa">
          <input className="entrada" defaultValue={token.nome} key={token.id + token.nome} maxLength={60} onBlur={(e) => e.target.value.trim() && e.target.value !== token.nome && alterar({ nome: e.target.value.trim() })} />
        </Campo>
        <div className="grade-campos">
          <Campo rotulo="Tamanho (células)">
            <CampoNumero valor={token.tamanho} min={0.5} max={10} passo={0.5} aoMudar={(n) => alterar({ tamanho: n })} />
          </Campo>
          <Campo rotulo="Cor da base">
            <select className="entrada" value={token.cor} onChange={(e) => alterar({ cor: e.target.value as Token['cor'] })}>
              {CORES_TOKEN.map((c) => (
                <option key={c} value={c}>
                  {NOME_COR[c]}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Ficha vinculada">
          <select className="entrada" value={token.fichaId ?? ''} onChange={(e) => alterar({ fichaId: e.target.value || null })}>
            <option value="">Sem ficha</option>
            {campanha.fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Jogador que pode mover" dica="O dono da ficha vinculada também pode mover o token.">
          <select className="entrada" value={token.donoJogadorId ?? ''} onChange={(e) => alterar({ donoJogadorId: e.target.value || null })}>
            <option value="">Apenas o mestre</option>
            {campanha.jogadores.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nome}
              </option>
            ))}
          </select>
        </Campo>
        <label className="alternar">
          <input type="checkbox" checked={token.oculto} onChange={(e) => alterar({ oculto: e.target.checked })} />
          <span>Oculto para os jogadores (não é enviado a eles)</span>
        </label>
        <div className="linha-botoes">
          <Botao pequeno icone="imagem" onClick={() => void trocarRetrato()}>
            Retrato do token…
          </Botao>
          {token.retratoArquivoId && (
            <Botao pequeno variante="fantasma" onClick={() => alterar({ retratoArquivoId: null })}>
              Usar o da ficha
            </Botao>
          )}
          <Botao pequeno variante="perigo" icone="lixeira" onClick={() => aoPedirExclusao([token.id])}>
            Excluir token
          </Botao>
        </div>
      </div>
    </details>
  );
}

function VariosTokens(props: Props & { cena: Cena; tokens: Token[] }) {
  const { cena, tokens, aoPedirExclusao } = props;
  const { ehMestre, despachar } = useVisao();
  const todosOcultos = tokens.every((t) => t.oculto);
  return (
    <div className="inspetor">
      <header className="persona">
        <span className="retrato retrato--grupo" style={{ width: 68, height: 68 }}>
          <Icone nome="area" tamanho={30} />
        </span>
        <div className="persona__texto">
          <h2 className="persona__nome">{tokens.length} tokens</h2>
          <p className="persona__sub">{tokens.map((t) => t.nome).join(', ')}</p>
        </div>
      </header>
      {tokens.length === 2 && (
        <p className="derivados">
          <span>
            Distância entre os dois: <strong>{formatarMetros(distanciaMetros(tokens[0], tokens[1], cena.grade))}</strong>
          </span>
          <RefRegra id="convencao-medicao" />
        </p>
      )}
      <SecaoMovimento {...props} cena={cena} tokens={tokens} />
      {ehMestre && (
        <div className="linha-botoes">
          <Botao pequeno icone={todosOcultos ? 'olho' : 'olhoFechado'} onClick={() => tokens.forEach((t) => despachar({ tipo: 'token.atualizar', cenaId: cena.id, tokenId: t.id, alteracoes: { oculto: !todosOcultos } }))}>
            {todosOcultos ? 'Mostrar aos jogadores' : 'Ocultar dos jogadores'}
          </Botao>
          <Botao pequeno variante="perigo" icone="lixeira" onClick={() => aoPedirExclusao(tokens.map((t) => t.id))}>
            Excluir
          </Botao>
        </div>
      )}
      <p className="rodape-nota">Decisões pelo mestre.</p>
    </div>
  );
}

export function DialogoAtaque({ atacante, cena, aoFechar, aoResolver }: { atacante: Ficha; cena: Cena; aoFechar(): void; aoResolver(): void }) {
  const { campanha, despachar } = useVisao();
  const alvos = cena.tokens.filter((t) => t.fichaId && t.fichaId !== atacante.id).map((t) => ({ token: t, ficha: campanha.fichas.find((f) => f.id === t.fichaId)! })).filter((a) => a.ficha);
  const armas = atacante.equipamento.filter((i) => i.tipo === 'arma' && i.equipado && i.categoria);
  const [alvo, setAlvo] = useState(alvos[0]?.ficha.id ?? '');
  const [atributo, setAtributo] = useState<ChaveAtributo>('fis');
  const [arma, setArma] = useState<CategoriaArma>((armas[0]?.categoria as CategoriaArma | undefined) ?? 'leve');
  const d = derivar(atacante);
  const fichaAlvo = alvos.find((a) => a.ficha.id === alvo)?.ficha;
  return (
    <Dialogo
      titulo={`Ataque de ${atacante.nome}`}
      aoFechar={aoFechar}
      largura="pequena"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            icone="dado"
            disabled={!alvo}
            onClick={() => {
              if (despachar({ tipo: 'combate.resolverAtaque', pedido: { atacanteFichaId: atacante.id, alvoFichaId: alvo, atributo, arma } }).ok) aoResolver();
            }}
          >
            Rolar ataque
          </Botao>
        </>
      }
    >
      <div className="formulario">
        {alvos.length === 0 ? (
          <p className="nota">Não há outros tokens com ficha nesta cena para servir de alvo.</p>
        ) : (
          <>
            <Campo rotulo="Alvo">
              <select className="entrada" value={alvo} onChange={(e) => setAlvo(e.target.value)}>
                {alvos.map((a) => (
                  <option key={a.token.id} value={a.ficha.id}>
                    {a.token.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grade-campos">
              <Campo rotulo="Atributo do ataque">
                <select className="entrada" value={atributo} onChange={(e) => setAtributo(e.target.value as ChaveAtributo)}>
                  {ATRIBUTOS.map((a) => (
                    <option key={a} value={a}>
                      {SIGLA_ATRIBUTO[a]} {formatarModificador(d.atributosTeste[a])}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Arma">
                <select className="entrada" value={arma} onChange={(e) => setArma(e.target.value as CategoriaArma)}>
                  {CATEGORIAS_ARMA.map((c) => (
                    <option key={c} value={c}>
                      {NOME_ARMA[c]}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            {armas.length > 0 && <p className="nota">Equipado: {armas.map((i) => `${i.nome} (${i.categoria})`).join(', ')}.</p>}
            {fichaAlvo && (
              <p className="nota">
                d20 {formatarModificador(d.atributosTeste[atributo])} contra Defesa {derivar(fichaAlvo).defesa.total}; redução do alvo {derivar(fichaAlvo).reducao.total}. O resultado só é aplicado depois da confirmação do mestre.{' '}
                <RefRegra id="ataque" />
              </p>
            )}
          </>
        )}
      </div>
    </Dialogo>
  );
}
