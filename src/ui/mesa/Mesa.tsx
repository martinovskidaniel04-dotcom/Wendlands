/**
 * Mesa tática: ferramentas à esquerda, cenas/camadas/iniciativa, mapa central,
 * inspetor à direita e dados/histórico embaixo. Em telas pequenas os painéis
 * viram gavetas e o mapa ocupa a vista principal.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { Desenho, Id } from '../../dominio/esquema';
import { CORES_DESENHO } from '../../dominio/esquema';
import { Botao, BotaoIcone, EstadoVazio } from '../comuns';
import { useConfirmar, useLarguraJanela, useLoja, usePreferencia, useVisao } from '../contexto';
import { Bandeja } from './Bandeja';
import { PainelCombate } from './Combate';
import { ConfigCena } from './ConfigCena';
import { Inspetor } from './Inspetor';
import { Mapa } from './Mapa';
import { PainelEsquerdo } from './PainelEsquerdo';
import { CAMADAS_PADRAO, FERRAMENTAS, OPCOES_PADRAO, type CamadasVisiveis, type Ferramenta, type OpcoesFerramenta } from './tipos';

const NOME_COR_DESENHO: Record<Desenho['cor'], string> = { marfim: 'Marfim', latao: 'Latão', verde: 'Verde-azulado', vinho: 'Vinho', azul: 'Azul' };
const FORMAS: Array<[OpcoesFerramenta['desenho']['forma'], string]> = [
  ['linha', 'Linha'],
  ['retangulo', 'Retângulo'],
  ['elipse', 'Elipse'],
  ['livre', 'Traço livre'],
  ['apagar', 'Apagar'],
];

export function Mesa({ aoAbrirFicha }: { aoAbrirFicha(fichaId: Id, secao?: 'inventario'): void }) {
  const { campanha, ehMestre, previa, despachar } = useVisao();
  const loja = useLoja();
  const confirmar = useConfirmar();
  const movel = useLarguraJanela() < 900;

  const [ferramenta, setFerramenta] = useState<Ferramenta>('selecionar');
  const [opcoes, setOpcoes] = useState<OpcoesFerramenta>(OPCOES_PADRAO);
  const [camadas, setCamadas] = usePreferencia<CamadasVisiveis>('camadas', CAMADAS_PADRAO);
  const [selecao, setSelecao] = useState<Id[]>([]);
  const [cenaEscolhida, setCenaEscolhida] = useState<Id | null>(null);
  const [aba, setAba] = useState<'personagem' | 'combate'>('personagem');
  const [aguardandoDestino, setAguardandoDestino] = useState(false);
  const [configurando, setConfigurando] = useState<Id | null>(null);
  const [esqAberto, setEsqAberto] = usePreferencia('painelEsquerdo', true);
  const [dirAberto, setDirAberto] = usePreferencia('painelDireito', true);
  const [bandejaAberta, setBandejaAberta] = usePreferencia('bandeja', true);
  const [larguraEsq, setLarguraEsq] = usePreferencia('larguraEsquerda', 236);
  const [larguraDir, setLarguraDir] = usePreferencia('larguraDireita', 312);
  const [gaveta, setGaveta] = useState<'esq' | 'dir' | 'dados' | null>(null);
  const refExpressao = useRef<HTMLInputElement>(null);

  // O mestre pode preparar uma cena diferente da ativa; jogadores (e a prévia) veem sempre a ativa.
  const cenaVistaId =
    ehMestre && !previa && cenaEscolhida && campanha.cenas.some((c) => c.id === cenaEscolhida) ? cenaEscolhida : campanha.cenaAtivaId ?? campanha.cenas[0]?.id ?? null;
  const cena = campanha.cenas.find((c) => c.id === cenaVistaId) ?? null;
  const cenaConfig = campanha.cenas.find((c) => c.id === configurando) ?? null;

  // A seleção só guarda tokens que ainda existem na cena vista.
  const selecaoValida = cena ? selecao.filter((id) => cena.tokens.some((t) => t.id === id)) : [];
  useEffect(() => {
    if (selecaoValida.length !== selecao.length) setSelecao(selecaoValida);
  }, [selecaoValida.length, selecao.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ferramentas de mestre não ficam ativas para quem não é mestre.
  const ferramentaAtiva = FERRAMENTAS.find((f) => f.id === ferramenta && (!f.mestre || ehMestre)) ? ferramenta : 'selecionar';

  useEffect(() => {
    const aoTeclar = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      const f = FERRAMENTAS.find((x) => x.atalho.toLowerCase() === e.key.toLowerCase());
      if (f && (!f.mestre || ehMestre)) setFerramenta(f.id);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ehMestre]);

  const pedirExclusao = useCallback(
    async (ids: Id[]) => {
      if (!cena || ids.length === 0) return;
      const nomes = cena.tokens.filter((t) => ids.includes(t.id)).map((t) => t.nome);
      const local = loja.obter().modo === 'local';
      const ok = await confirmar({
        titulo: ids.length === 1 ? 'Excluir token' : `Excluir ${ids.length} tokens`,
        texto: `Excluir ${nomes.join(', ')} desta cena? As fichas vinculadas são mantidas.${local ? '' : ' Na mesa online esta ação não pode ser desfeita.'}`,
        confirmar: 'Excluir',
        perigo: true,
      });
      if (!ok) return;
      if (despachar({ tipo: 'token.excluir', cenaId: cena.id, tokenIds: ids }).ok) {
        setSelecao([]);
        if (local) loja.avisar('info', `${ids.length} token(s) excluído(s).`, { rotulo: 'Desfazer', executar: () => loja.desfazer() });
      }
    },
    [cena, confirmar, despachar, loja],
  );

  const rolagemLivre = () => {
    if (movel) setGaveta('dados');
    else setBandejaAberta(true);
    setTimeout(() => refExpressao.current?.focus(), 60);
  };

  const estilo = { '--larg-esq': `${larguraEsq}px`, '--larg-dir': `${larguraDir}px` } as CSSProperties;
  const mostrarEsq = !movel && esqAberto;
  const mostrarDir = !movel && dirAberto;

  const painelEsquerdo = (
    <PainelEsquerdo
      cenaVistaId={cenaVistaId}
      aoVerCena={(id) => {
        setCenaEscolhida(id);
        setSelecao([]);
        if (movel) setGaveta(null);
      }}
      aoConfigurarCena={setConfigurando}
      camadas={camadas}
      aoMudarCamadas={setCamadas}
      selecao={selecaoValida}
      aoSelecionar={setSelecao}
    />
  );

  const pendencias = ehMestre ? campanha.pendencias.length : 0;
  const painelDireito = (
    <>
      <div className="abas" role="tablist" aria-label="Painel do personagem">
        <button type="button" role="tab" aria-selected={aba === 'personagem'} className="aba" onClick={() => setAba('personagem')}>
          Personagem
        </button>
        <button type="button" role="tab" aria-selected={aba === 'combate'} className="aba" onClick={() => setAba('combate')}>
          Combate
          {pendencias > 0 && (
            <span className="aba__conta" aria-label={`${pendencias} resolução(ões) aguardando confirmação`}>
              {pendencias}
            </span>
          )}
        </button>
      </div>
      <div className="mesa__dir-corpo" role="tabpanel">
        {aba === 'personagem' ? (
          <Inspetor
            cena={cena}
            selecao={selecaoValida}
            aoAbrirFicha={aoAbrirFicha}
            aoRolagemLivre={rolagemLivre}
            aguardandoDestino={aguardandoDestino}
            aoPedirDestino={() => {
              setAguardandoDestino((v) => !v);
              if (movel) setGaveta(null);
            }}
            aoPedirExclusao={(ids) => void pedirExclusao(ids)}
            aoVerCombate={() => setAba('combate')}
          />
        ) : (
          <PainelCombate />
        )}
      </div>
    </>
  );

  return (
    <div className={`mesa${mostrarEsq ? '' : ' mesa--sem-esq'}${mostrarDir ? '' : ' mesa--sem-dir'}${movel ? ' mesa--movel' : ''}`} style={estilo}>
      <nav className="ferramentas" aria-label="Ferramentas do mapa">
        {FERRAMENTAS.filter((f) => !f.mestre || ehMestre).map((f) => (
          <BotaoIcone
            key={f.id}
            icone={f.icone}
            rotulo={`${f.rotulo} (${f.atalho})`}
            ativo={ferramentaAtiva === f.id}
            tamanho={21}
            disabled={previa && f.mestre}
            onClick={() => {
              setFerramenta(f.id);
              setAguardandoDestino(false);
            }}
          />
        ))}
        <span className="ferramentas__divisor" aria-hidden="true" />
        <BotaoIcone
          icone="camadas"
          rotulo="Cenas, camadas e iniciativa"
          tamanho={21}
          ativo={movel ? gaveta === 'esq' : esqAberto}
          onClick={() => (movel ? setGaveta(gaveta === 'esq' ? null : 'esq') : setEsqAberto(!esqAberto))}
        />
        <BotaoIcone
          icone="pessoa"
          rotulo="Personagem e combate"
          tamanho={21}
          ativo={movel ? gaveta === 'dir' : dirAberto}
          onClick={() => (movel ? setGaveta(gaveta === 'dir' ? null : 'dir') : setDirAberto(!dirAberto))}
        />
        <BotaoIcone
          icone="dado"
          rotulo="Dados e histórico"
          tamanho={21}
          ativo={movel ? gaveta === 'dados' : bandejaAberta}
          onClick={() => (movel ? setGaveta(gaveta === 'dados' ? null : 'dados') : setBandejaAberta(!bandejaAberta))}
        />
        {ehMestre && cena && <BotaoIcone icone="engrenagem" rotulo="Configurar a cena (grade, escala, mapa)" tamanho={21} onClick={() => setConfigurando(cena.id)} />}
      </nav>

      {mostrarEsq && (
        <>
          <aside className="mesa__esq" aria-label="Cenas, camadas e iniciativa">
            {painelEsquerdo}
          </aside>
          <Separador rotulo="Largura do painel de cenas" valor={larguraEsq} min={190} max={420} aoMudar={setLarguraEsq} direcao={1} classe="separador--esq" />
        </>
      )}

      <main className="mesa__centro">
        {cena ? (
          <Mapa
            cena={cena}
            ferramenta={ferramentaAtiva}
            opcoes={opcoes}
            camadas={camadas}
            selecao={selecaoValida}
            aoSelecionar={(ids) => {
              setSelecao(ids);
              if (ids.length > 0) setAba('personagem');
            }}
            aoMudarFerramenta={setFerramenta}
            aguardandoDestino={aguardandoDestino}
            aoConcluirDestino={() => setAguardandoDestino(false)}
            aoPedirExclusao={(ids) => void pedirExclusao(ids)}
          />
        ) : (
          <EstadoVazio icone="mapa" titulo={ehMestre ? 'Esta campanha ainda não tem cenas' : 'Aguardando o mestre abrir uma cena'}>
            {ehMestre && 'Abra o painel de cenas para criar uma cena vazia, usar um mapa de demonstração ou importar uma imagem.'}
          </EstadoVazio>
        )}
        {cena && ehMestre && !previa && ferramentaAtiva === 'desenho' && (
          <div className="opcoes-ferramenta" role="toolbar" aria-label="Opções de desenho">
            <div className="segmentos" role="group" aria-label="Forma">
              {FORMAS.map(([forma, nome]) => (
                <button key={forma} type="button" className="segmento" aria-pressed={opcoes.desenho.forma === forma} onClick={() => setOpcoes({ ...opcoes, desenho: { ...opcoes.desenho, forma } })}>
                  {nome}
                </button>
              ))}
            </div>
            <select className="entrada entrada--mini" aria-label="Cor do desenho" value={opcoes.desenho.cor} onChange={(e) => setOpcoes({ ...opcoes, desenho: { ...opcoes.desenho, cor: e.target.value as Desenho['cor'] } })}>
              {CORES_DESENHO.map((c) => (
                <option key={c} value={c}>
                  {NOME_COR_DESENHO[c]}
                </option>
              ))}
            </select>
            <select className="entrada entrada--mini" aria-label="Espessura do traço" value={opcoes.desenho.espessura} onChange={(e) => setOpcoes({ ...opcoes, desenho: { ...opcoes.desenho, espessura: Number(e.target.value) } })}>
              <option value={2}>Fino</option>
              <option value={4}>Médio</option>
              <option value={8}>Grosso</option>
            </select>
            <label className="alternar">
              <input type="checkbox" checked={opcoes.desenho.visivelJogadores} onChange={(e) => setOpcoes({ ...opcoes, desenho: { ...opcoes.desenho, visivelJogadores: e.target.checked } })} />
              <span>Visível aos jogadores</span>
            </label>
            <Botao
              pequeno
              variante="fantasma"
              disabled={cena.desenhos.length === 0}
              onClick={async () => {
                if (await confirmar({ titulo: 'Limpar desenhos', texto: `Apagar os ${cena.desenhos.length} desenho(s) desta cena?`, confirmar: 'Limpar', perigo: true })) despachar({ tipo: 'desenho.limpar', cenaId: cena.id });
              }}
            >
              Limpar tudo
            </Botao>
          </div>
        )}
        {cena && ehMestre && !previa && ferramentaAtiva === 'nevoa' && (
          <div className="opcoes-ferramenta" role="toolbar" aria-label="Opções de névoa">
            <div className="segmentos" role="group" aria-label="Operação">
              <button type="button" className="segmento" aria-pressed={opcoes.nevoa.operacao === 'ocultar'} onClick={() => setOpcoes({ ...opcoes, nevoa: { operacao: 'ocultar' } })}>
                Ocultar região
              </button>
              <button type="button" className="segmento" aria-pressed={opcoes.nevoa.operacao === 'revelar'} onClick={() => setOpcoes({ ...opcoes, nevoa: { operacao: 'revelar' } })}>
                Revelar região
              </button>
            </div>
            <Botao pequeno variante="fantasma" onClick={() => setConfigurando(cena.id)}>
              Ocultar ou revelar tudo…
            </Botao>
            <span className="nota">Névoa manual: sem iluminação dinâmica nem linha de visão.</span>
          </div>
        )}
        {previa && (
          <div className="faixa-previa" role="status">
            Prévia do jogador: você vê o que seria enviado a ele. Somente leitura.
          </div>
        )}
      </main>

      {mostrarDir && (
        <>
          <Separador rotulo="Largura do painel do personagem" valor={larguraDir} min={260} max={480} aoMudar={setLarguraDir} direcao={-1} classe="separador--dir" />
          <aside className="mesa__dir" aria-label="Personagem e combate">
            {painelDireito}
          </aside>
        </>
      )}

      {!movel && (
        <footer className="mesa__bandeja">
          <Bandeja recolhida={!bandejaAberta} aoAlternar={() => setBandejaAberta(!bandejaAberta)} refExpressao={refExpressao} />
        </footer>
      )}

      {movel && gaveta && (
        <div className={`gaveta gaveta--${gaveta}`} role="dialog" aria-label={gaveta === 'esq' ? 'Cenas, camadas e iniciativa' : gaveta === 'dir' ? 'Personagem e combate' : 'Dados e histórico'}>
          <header className="gaveta__topo">
            <span>{gaveta === 'esq' ? 'Cenas e iniciativa' : gaveta === 'dir' ? 'Personagem e combate' : 'Dados e histórico'}</span>
            <BotaoIcone icone="fechar" rotulo="Fechar painel" onClick={() => setGaveta(null)} />
          </header>
          <div className="gaveta__corpo">
            {gaveta === 'esq' && painelEsquerdo}
            {gaveta === 'dir' && painelDireito}
            {gaveta === 'dados' && <Bandeja recolhida={false} aoAlternar={() => setGaveta(null)} refExpressao={refExpressao} />}
          </div>
        </div>
      )}

      {cenaConfig && ehMestre && <ConfigCena cena={cenaConfig} aoFechar={() => setConfigurando(null)} />}
    </div>
  );
}

/** Divisor arrastável entre painéis (também ajustável pelo teclado). */
function Separador({ rotulo, valor, min, max, aoMudar, direcao, classe }: { rotulo: string; valor: number; min: number; max: number; aoMudar(v: number): void; direcao: 1 | -1; classe: string }) {
  const inicio = useRef<{ x: number; valor: number } | null>(null);
  const limitar = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  const aoPressionar = (e: PointerEvent<HTMLDivElement>) => {
    inicio.current = { x: e.clientX, valor };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const aoMover = (e: PointerEvent<HTMLDivElement>) => {
    if (inicio.current) aoMudar(limitar(inicio.current.valor + (e.clientX - inicio.current.x) * direcao));
  };
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') aoMudar(limitar(valor - 16 * direcao));
    else if (e.key === 'ArrowRight') aoMudar(limitar(valor + 16 * direcao));
    else return;
    e.preventDefault();
  };
  return (
    <div
      className={`separador ${classe}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={rotulo}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={valor}
      tabIndex={0}
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={() => (inicio.current = null)}
      onPointerCancel={() => (inicio.current = null)}
      onKeyDown={aoTeclar}
    />
  );
}
