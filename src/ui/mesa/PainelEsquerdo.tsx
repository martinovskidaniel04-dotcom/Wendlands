/**
 * Painel esquerdo da mesa: cenas, camadas e iniciativa.
 */
import { useState } from 'react';
import type { Cena, Id, MapaDemoId } from '../../dominio/esquema';
import { MAPAS_DEMO } from '../../dominio/esquema';
import { NOME_MAPA_DEMO, cenaDemo, novaCena } from '../../dominio/fabrica';
import { ACEITAR_IMAGENS, Botao, BotaoIcone, CampoNumero, Secao, escolherArquivo } from '../comuns';
import { useArquivoUrl, useConfirmar, useLoja, useVisao } from '../contexto';
import { Icone, type NomeIcone } from '../icones';
import { urlMapaDemo } from './mapasDemo';
import type { CamadasVisiveis } from './tipos';

interface Props {
  cenaVistaId: Id | null;
  aoVerCena(id: Id): void;
  aoConfigurarCena(id: Id): void;
  camadas: CamadasVisiveis;
  aoMudarCamadas(c: CamadasVisiveis): void;
  selecao: Id[];
  aoSelecionar(ids: Id[]): void;
}

/** Lê largura e altura de uma imagem escolhida pelo usuário. */
export async function dimensoesDaImagem(arquivo: Blob): Promise<{ largura: number; altura: number } | null> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const d = { largura: bitmap.width, altura: bitmap.height };
    bitmap.close();
    return d;
  } catch {
    return null;
  }
}

export function PainelEsquerdo({ cenaVistaId, aoVerCena, aoConfigurarCena, camadas, aoMudarCamadas, selecao, aoSelecionar }: Props) {
  return (
    <div className="painel-esq">
      <SecaoCenas cenaVistaId={cenaVistaId} aoVerCena={aoVerCena} aoConfigurarCena={aoConfigurarCena} />
      <SecaoCamadas camadas={camadas} aoMudar={aoMudarCamadas} />
      <SecaoIniciativa cenaVistaId={cenaVistaId} selecao={selecao} aoSelecionar={aoSelecionar} />
    </div>
  );
}

function Miniatura({ cena }: { cena: Cena }) {
  const url = useArquivoUrl(cena.mapa.tipo === 'arquivo' ? cena.mapa.arquivoId : null);
  const src = cena.mapa.tipo === 'demo' ? urlMapaDemo(cena.mapa.demoId) : url;
  return <span className="cena__mini">{src ? <img src={src} alt="" /> : <Icone nome="mapa" tamanho={18} />}</span>;
}

function SecaoCenas({ cenaVistaId, aoVerCena, aoConfigurarCena }: Pick<Props, 'cenaVistaId' | 'aoVerCena' | 'aoConfigurarCena'>) {
  const { campanha, ehMestre, despachar } = useVisao();
  const loja = useLoja();
  const confirmar = useConfirmar();
  const [menuNova, setMenuNova] = useState(false);
  const [menuDe, setMenuDe] = useState<Id | null>(null);
  const [renomeando, setRenomeando] = useState<{ id: Id; nome: string } | null>(null);

  const criar = (cena: Cena) => {
    if (despachar({ tipo: 'cena.criar', cena }).ok) aoVerCena(cena.id);
    setMenuNova(false);
  };

  const importarMapa = async () => {
    setMenuNova(false);
    const arquivo = await escolherArquivo(ACEITAR_IMAGENS);
    if (!arquivo) return;
    const dimensoes = await dimensoesDaImagem(arquivo);
    if (!dimensoes) {
      loja.avisar('erro', 'Não foi possível ler a imagem escolhida.');
      return;
    }
    const meta = await loja.importarImagem(arquivo, arquivo.name, 'mapa');
    if (!meta) return;
    const nome = arquivo.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Novo mapa';
    const cena = novaCena({ nome, mapa: { tipo: 'arquivo', arquivoId: meta.id }, largura: dimensoes.largura, altura: dimensoes.altura });
    if (despachar({ tipo: 'cena.criar', cena }).ok) {
      aoVerCena(cena.id);
      aoConfigurarCena(cena.id);
      loja.avisar('info', 'Mapa importado. Confira a calibração da grade (metros por célula).');
    }
  };

  const excluir = async (cena: Cena) => {
    setMenuDe(null);
    const ok = await confirmar({
      titulo: 'Excluir cena',
      texto: (
        <>
          Excluir a cena <strong>{cena.nome}</strong> com seus {cena.tokens.length} token(s), desenhos e névoa?
          {loja.obter().modo === 'local' ? ' Você pode desfazer logo em seguida.' : ' Na mesa online esta ação não pode ser desfeita.'}
        </>
      ),
      confirmar: 'Excluir cena',
      perigo: true,
    });
    if (ok && despachar({ tipo: 'cena.excluir', cenaId: cena.id }).ok && loja.obter().modo === 'local') {
      loja.avisar('info', `Cena "${cena.nome}" excluída.`, { rotulo: 'Desfazer', executar: () => loja.desfazer() });
    }
  };

  return (
    <Secao
      titulo="Cenas"
      recolhivel
      acoes={
        ehMestre && (
          <div className="menu-ancora">
            <BotaoIcone icone="mais" rotulo="Nova cena" tamanho={16} aria-expanded={menuNova} aria-haspopup="menu" onClick={() => setMenuNova((v) => !v)} />
            {menuNova && (
              <div className="menu" role="menu">
                <button type="button" role="menuitem" onClick={() => criar(novaCena({ nome: `Cena ${campanha.cenas.length + 1}` }))}>
                  Cena vazia
                </button>
                <button type="button" role="menuitem" onClick={() => void importarMapa()}>
                  Importar mapa…
                </button>
                <div className="menu__titulo">Mapas de demonstração</div>
                {MAPAS_DEMO.map((id: MapaDemoId) => (
                  <button key={id} type="button" role="menuitem" onClick={() => criar(cenaDemo(id))}>
                    {NOME_MAPA_DEMO[id]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      }
    >
      {campanha.cenas.length === 0 ? (
        <p className="nota">{ehMestre ? 'Nenhuma cena ainda. Crie uma cena ou importe um mapa.' : 'O mestre ainda não abriu uma cena.'}</p>
      ) : (
        <ul className="cenas">
          {campanha.cenas.map((cena) => {
            const vista = cena.id === cenaVistaId;
            const ativa = cena.id === campanha.cenaAtivaId;
            return (
              <li key={cena.id} className={`cena${vista ? ' cena--vista' : ''}`}>
                {renomeando?.id === cena.id ? (
                  <form
                    className="cena__renomear"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (renomeando.nome.trim()) despachar({ tipo: 'cena.atualizar', cenaId: cena.id, nome: renomeando.nome.trim() });
                      setRenomeando(null);
                    }}
                  >
                    <input
                      className="entrada"
                      autoFocus
                      aria-label="Nome da cena"
                      maxLength={80}
                      value={renomeando.nome}
                      onChange={(e) => setRenomeando({ id: cena.id, nome: e.target.value })}
                      onBlur={() => setRenomeando(null)}
                      onKeyDown={(e) => e.key === 'Escape' && setRenomeando(null)}
                    />
                  </form>
                ) : (
                  <button type="button" className="cena__botao" aria-current={vista ? 'true' : undefined} onClick={() => aoVerCena(cena.id)}>
                    <Miniatura cena={cena} />
                    <span className="cena__texto">
                      <span className="cena__nome">{cena.nome}</span>
                      {ativa && ehMestre && (
                        <span className="cena__ativa" title="Cena ativa: é a que os jogadores veem">
                          ativa para os jogadores
                        </span>
                      )}
                    </span>
                  </button>
                )}
                {ehMestre && renomeando?.id !== cena.id && (
                  <div className="menu-ancora">
                    <BotaoIcone icone="menu" rotulo={`Opções da cena ${cena.nome}`} tamanho={15} aria-haspopup="menu" aria-expanded={menuDe === cena.id} onClick={() => setMenuDe(menuDe === cena.id ? null : cena.id)} />
                    {menuDe === cena.id && (
                      <div className="menu menu--direita" role="menu">
                        {!ativa && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              despachar({ tipo: 'cena.ativar', cenaId: cena.id });
                              setMenuDe(null);
                            }}
                          >
                            Ativar para os jogadores
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            aoConfigurarCena(cena.id);
                            setMenuDe(null);
                          }}
                        >
                          Configurar grade e mapa…
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setRenomeando({ id: cena.id, nome: cena.nome });
                            setMenuDe(null);
                          }}
                        >
                          Renomear
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            despachar({ tipo: 'cena.duplicar', cenaId: cena.id });
                            setMenuDe(null);
                          }}
                        >
                          Duplicar
                        </button>
                        <button type="button" role="menuitem" className="menu__perigo" onClick={() => void excluir(cena)}>
                          Excluir…
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {ehMestre && (
        <button type="button" className="cena__importar" onClick={() => void importarMapa()}>
          <span className="cena__mini cena__mini--vazia">
            <Icone nome="imagem" tamanho={18} />
          </span>
          <span>Importar mapa</span>
        </button>
      )}
    </Secao>
  );
}

const LISTA_CAMADAS: Array<{ id: keyof CamadasVisiveis; nome: string; icone: NomeIcone }> = [
  { id: 'mapa', nome: 'Mapa', icone: 'mapa' },
  { id: 'tokens', nome: 'Tokens', icone: 'pessoa' },
  { id: 'desenhos', nome: 'Desenhos', icone: 'pincel' },
  { id: 'nevoa', nome: 'Névoa', icone: 'nevoa' },
];

function SecaoCamadas({ camadas, aoMudar }: { camadas: CamadasVisiveis; aoMudar(c: CamadasVisiveis): void }) {
  return (
    <Secao titulo="Camadas" recolhivel>
      <ul className="camadas">
        {LISTA_CAMADAS.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`camada${camadas[c.id] ? '' : ' camada--oculta'}`}
              aria-pressed={camadas[c.id]}
              aria-label={`Camada ${c.nome}: ${camadas[c.id] ? 'visível' : 'oculta'} na sua tela`}
              title="Mostra ou esconde a camada apenas na sua tela"
              onClick={() => aoMudar({ ...camadas, [c.id]: !camadas[c.id] })}
            >
              <Icone nome={camadas[c.id] ? 'olho' : 'olhoFechado'} tamanho={17} />
              <Icone nome={c.icone} tamanho={17} />
              <span>{c.nome}</span>
            </button>
          </li>
        ))}
      </ul>
    </Secao>
  );
}

function SecaoIniciativa({ cenaVistaId, selecao, aoSelecionar }: Pick<Props, 'cenaVistaId' | 'selecao' | 'aoSelecionar'>) {
  const { campanha, ehMestre, despachar } = useVisao();
  const confirmar = useConfirmar();
  const combate = campanha.combate;
  const cena = campanha.cenas.find((c) => c.id === cenaVistaId);

  const iniciar = () => {
    if (!cena) return;
    const escolhidos = selecao.length > 0 ? cena.tokens.filter((t) => selecao.includes(t.id)) : cena.tokens;
    despachar({ tipo: 'combate.iniciar', participantes: escolhidos.map((t) => ({ nome: t.nome, tokenId: t.id, fichaId: t.fichaId })) });
  };

  if (!combate) {
    return (
      <Secao titulo="Iniciativa">
        <p className="nota">Nenhum combate em andamento.</p>
        {ehMestre && (
          <Botao pequeno icone="espada" onClick={iniciar} disabled={!cena || cena.tokens.length === 0}>
            {selecao.length > 0 ? `Iniciar com ${selecao.length} selecionado(s)` : 'Iniciar combate com a cena'}
          </Botao>
        )}
      </Secao>
    );
  }

  const ordem = combate.participantes.map((p) => p.id);
  const mover = (indice: number, delta: number) => {
    const nova = [...ordem];
    const destino = indice + delta;
    if (destino < 0 || destino >= nova.length) return;
    [nova[indice], nova[destino]] = [nova[destino], nova[indice]];
    despachar({ tipo: 'combate.ordenar', ordem: nova });
  };
  const emEmpate = new Set(combate.empates.flat());
  const tokensNaCena = new Set(cena?.tokens.map((t) => t.id) ?? []);
  const foraDaIniciativa = cena?.tokens.filter((t) => selecao.includes(t.id) && !combate.participantes.some((p) => p.tokenId === t.id)) ?? [];

  return (
    <Secao
      titulo={`Iniciativa · Rodada ${combate.rodada}`}
      acoes={
        ehMestre && (
          <BotaoIcone
            icone="mais"
            rotulo={foraDaIniciativa.length > 0 ? 'Adicionar tokens selecionados à iniciativa' : 'Selecione tokens no mapa para adicioná-los à iniciativa'}
            tamanho={16}
            disabled={foraDaIniciativa.length === 0}
            onClick={() => foraDaIniciativa.forEach((t) => despachar({ tipo: 'combate.adicionar', nome: t.nome, tokenId: t.id, fichaId: t.fichaId }))}
          />
        )
      }
    >
      {combate.empates.length > 0 && ehMestre && (
        <div className="alerta" role="alert">
          <strong>Empate na iniciativa.</strong> Não há regra aprovada de desempate: ajuste a ordem com as setas e confirme.
          <Botao pequeno variante="primario" onClick={() => despachar({ tipo: 'combate.ordenar', ordem })}>
            Confirmar esta ordem
          </Botao>
        </div>
      )}
      {combate.participantes.length === 0 ? (
        <p className="nota">Sem participantes. Selecione tokens no mapa e use o botão “+”.</p>
      ) : (
        <ol className="iniciativa">
          {combate.participantes.map((p, i) => {
            const daVez = i === combate.turno;
            const selecionado = p.tokenId !== null && selecao.includes(p.tokenId);
            return (
              <li key={p.id} className={`ini${daVez ? ' ini--vez' : ''}${selecionado ? ' ini--selecionado' : ''}`} aria-current={daVez ? 'step' : undefined}>
                <button
                  type="button"
                  className="ini__nome"
                  onClick={() => p.tokenId && tokensNaCena.has(p.tokenId) && aoSelecionar([p.tokenId])}
                  title={p.detalheIniciativa || undefined}
                >
                  <Icone nome="pessoa" tamanho={15} />
                  <span>{p.nome}</span>
                  {emEmpate.has(p.id) && <span className="ini__empate">empate</span>}
                </button>
                {ehMestre ? (
                  <>
                    <span className="ini__ordem">
                      <BotaoIcone icone="setaCima" rotulo={`Subir ${p.nome} na ordem`} tamanho={13} disabled={i === 0} onClick={() => mover(i, -1)} />
                      <BotaoIcone icone="setaBaixo" rotulo={`Descer ${p.nome} na ordem`} tamanho={13} disabled={i === ordem.length - 1} onClick={() => mover(i, 1)} />
                    </span>
                    <CampoNumero
                      className="entrada ini__valor"
                      rotulo={`Iniciativa de ${p.nome}`}
                      valor={p.iniciativa ?? 0}
                      min={-99}
                      max={999}
                      aoMudar={(n) => despachar({ tipo: 'combate.definirIniciativa', participanteId: p.id, valor: Math.round(n) })}
                    />
                    <BotaoIcone icone="fechar" rotulo={`Remover ${p.nome} da iniciativa`} tamanho={13} onClick={() => despachar({ tipo: 'combate.remover', participanteId: p.id })} />
                  </>
                ) : (
                  <span className="ini__valor ini__valor--fixo">{p.iniciativa ?? '—'}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {ehMestre && (
        <div className="linha-botoes">
          <Botao pequeno icone="dado" onClick={() => despachar({ tipo: 'combate.rolarIniciativa', participanteIds: null })} disabled={combate.participantes.length === 0}>
            Rolar d20 + DES
          </Botao>
          <Botao pequeno variante="primario" onClick={() => despachar({ tipo: 'combate.avancar' })} disabled={combate.participantes.length === 0}>
            Próximo turno
          </Botao>
          <BotaoIcone icone="setaEsquerda" rotulo="Voltar um turno" tamanho={15} onClick={() => despachar({ tipo: 'combate.voltar' })} />
          <BotaoIcone
            icone="fechar"
            rotulo="Encerrar combate"
            tamanho={15}
            onClick={async () => {
              if (await confirmar({ titulo: 'Encerrar combate', texto: 'Encerrar o combate apaga a ordem de iniciativa, guardas, controles e resoluções pendentes.', confirmar: 'Encerrar', perigo: true })) {
                despachar({ tipo: 'combate.encerrar' });
              }
            }}
          />
        </div>
      )}
    </Secao>
  );
}
