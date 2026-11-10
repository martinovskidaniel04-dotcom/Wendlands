/**
 * Casco do aplicativo: barra superior, navegação, visão (mestre ou prévia do
 * jogador), estados de carregamento/erro e avisos persistentes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ator, Cena, Id } from '../dominio/esquema';
import { novoId } from '../dominio/fabrica';
import { filtrarVisao } from '../dominio/visao';
import { DialogoCampanhas } from './campanhas/Campanhas';
import { Avisos, Botao, BotaoIcone, Campo, Dialogo, EstadoVazio, ProvedorConfirmacao } from './comuns';
import { PaginaCompendio } from './compendio/Compendio';
import { VisaoContexto, useEstadoLoja, useLoja, type Visao } from './contexto';
import { PaginaDiario } from './diario/Diario';
import { PaginaFichas } from './fichas/Fichas';
import { GlifoGalleone, Icone } from './icones';
import { gerarMapaJogadores } from './mascara';
import { Mesa } from './mesa/Mesa';
import { DialogoOnline } from './online/Online';

type Aba = 'mesa' | 'fichas' | 'compendio' | 'diario';
const ABAS: Array<[Aba, string]> = [
  ['mesa', 'Mesa'],
  ['fichas', 'Fichas'],
  ['compendio', 'Compêndio'],
  ['diario', 'Diário'],
];

export function App() {
  const loja = useLoja();
  const estado = useEstadoLoja();
  const [aba, setAba] = useState<Aba>('mesa');
  /** null = visão própria; string = prévia do jogador com esse id ('' = jogador sem ficha). */
  const [previaDe, setPreviaDe] = useState<string | null>(null);
  const [menuVisao, setMenuVisao] = useState(false);
  const [dialogo, setDialogo] = useState<'campanhas' | 'online' | 'jogadores' | null>(null);
  const [fichaAberta, setFichaAberta] = useState<{ id: Id | null; secao?: 'inventario' }>({ id: null });

  const mestreReal = estado.ator.papel === 'mestre';
  const previa = mestreReal && previaDe !== null;
  const campanha = estado.campanha;

  const visao = useMemo<Visao | null>(() => {
    if (!campanha) return null;
    if (!previa) {
      return { campanha, ator: estado.ator, mestreReal, previa: false, ehMestre: mestreReal, despachar: (c) => loja.despachar(c) };
    }
    const jogador = campanha.jogadores.find((j) => j.id === previaDe);
    const ator: Ator = { papel: 'jogador', jogadorId: jogador?.id ?? null, nome: jogador?.nome ?? 'Jogador' };
    return {
      campanha: filtrarVisao(campanha, ator, { mascararMapa: false }),
      ator,
      mestreReal,
      previa: true,
      ehMestre: false,
      despachar: () => ({ ok: false, erro: 'A prévia do jogador é somente leitura.' }),
    };
  }, [campanha, estado.ator, mestreReal, previa, previaDe, loja]);

  // Desfazer / refazer pelo teclado (modo local).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      if (e.shiftKey) loja.refazer();
      else loja.desfazer();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [loja]);

  useEffect(() => {
    document.title = campanha ? `${campanha.nome} — WENDLANDS` : 'WENDLANDS — Mesa';
  }, [campanha?.nome]); // eslint-disable-line react-hooks/exhaustive-deps

  if (estado.fase === 'carregando') {
    return (
      <div className="tela-cheia" role="status">
        <GlifoGalleone tamanho={56} />
        <p>Carregando a mesa…</p>
      </div>
    );
  }
  if (estado.fase === 'erro') {
    return (
      <div className="tela-cheia" role="alert">
        <Icone nome="alerta" tamanho={36} />
        <p>Não foi possível iniciar o aplicativo.</p>
        <p className="nota">{estado.erroFatal}</p>
        <Botao onClick={() => window.location.reload()}>Tentar de novo</Botao>
      </div>
    );
  }

  const online = estado.modo === 'online';
  const conexao = estado.conexao;
  const nomeVisao = previa ? `Visão do jogador${campanha?.jogadores.find((j) => j.id === previaDe) ? `: ${campanha.jogadores.find((j) => j.id === previaDe)!.nome}` : ''}` : mestreReal ? 'Visão do mestre' : `Jogador: ${estado.ator.nome}`;

  return (
    <ProvedorConfirmacao>
      <div className="app">
        <a className="pular" href="#conteudo">
          Pular para o conteúdo
        </a>
        <header className="topo">
          <div className="topo__marca">
            <span className="marca">WENDLANDS</span>
            <button
              type="button"
              className="topo__campanha"
              onClick={() => setDialogo(online ? 'online' : 'campanhas')}
              title={online ? 'Mesa online' : 'Campanhas: abrir, criar, importar e exportar'}
            >
              <span>{campanha?.nome ?? (online ? 'Mesa online' : 'Sem campanha')}</span>
              <Icone nome="setaBaixo" tamanho={14} />
            </button>
          </div>
          <nav className="topo__abas" aria-label="Seções">
            {ABAS.map(([id, nome]) => (
              <button key={id} type="button" className="topo__aba" aria-current={aba === id ? 'page' : undefined} onClick={() => setAba(id)}>
                {nome}
              </button>
            ))}
          </nav>
          <div className="topo__acoes">
            {!online && campanha && (
              <>
                <BotaoIcone icone="desfazer" rotulo="Desfazer (Ctrl+Z)" disabled={!estado.podeDesfazer} onClick={() => loja.desfazer()} />
                <BotaoIcone icone="refazer" rotulo="Refazer (Ctrl+Shift+Z)" disabled={!estado.podeRefazer} onClick={() => loja.refazer()} />
                <EstadoSalvamento />
              </>
            )}
            <button
              type="button"
              className={`topo__online topo__online--${conexao?.estado ?? 'local'}`}
              onClick={() => setDialogo('online')}
              title="Mesa online"
              aria-label={online ? `Mesa online: ${conexao?.estado ?? ''}` : 'Mesa online (modo local ativo)'}
            >
              <Icone nome="rede" tamanho={17} />
              <span>{online ? (conexao?.estado === 'conectado' ? 'Online' : conexao?.estado === 'desconectado' ? 'Sem conexão' : 'Conectando…') : 'Local'}</span>
            </button>
            <div className="menu-ancora">
              <button
                type="button"
                className={`topo__visao${previa ? ' topo__visao--previa' : ''}`}
                aria-haspopup="menu"
                aria-expanded={menuVisao}
                disabled={!mestreReal}
                onClick={() => setMenuVisao((v) => !v)}
              >
                <Icone nome={previa || !mestreReal ? 'pessoa' : 'coroa'} tamanho={17} />
                <span>{nomeVisao}</span>
              </button>
              {menuVisao && mestreReal && campanha && (
                <div className="menu menu--direita" role="menu">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={!previa}
                    onClick={() => {
                      setPreviaDe(null);
                      setMenuVisao(false);
                    }}
                  >
                    Visão do mestre
                  </button>
                  <div className="menu__titulo">Prévia do que cada jogador recebe</div>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={previaDe === ''}
                    onClick={() => {
                      setPreviaDe('');
                      setMenuVisao(false);
                    }}
                  >
                    Jogador sem ficha
                  </button>
                  {campanha.jogadores.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={previaDe === j.id}
                      onClick={() => {
                        setPreviaDe(j.id);
                        setMenuVisao(false);
                      }}
                    >
                      {j.nome}
                    </button>
                  ))}
                  {!online && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setDialogo('jogadores');
                        setMenuVisao(false);
                      }}
                    >
                      Gerenciar jogadores…
                    </button>
                  )}
                </div>
              )}
            </div>
            <span className="topo__glifo" title="Glifo de Galleone — proposta gráfica da interface">
              <GlifoGalleone />
            </span>
          </div>
        </header>

        {!estado.armazenamento && (
          <div className="faixa faixa--erro" role="alert">
            <Icone nome="alerta" tamanho={17} />
            Este navegador não oferece armazenamento local: nada do que você fizer será salvo ao fechar a página.
          </div>
        )}
        {estado.salvamento.estado === 'erro' && (
          <div className="faixa faixa--erro" role="alert">
            <Icone nome="alerta" tamanho={17} />
            <span>{estado.salvamento.mensagem}</span>
            <Botao pequeno onClick={() => loja.tentarSalvarNovamente()}>
              Tentar salvar de novo
            </Botao>
            <Botao pequeno onClick={() => setDialogo('campanhas')}>
              Exportar backup
            </Botao>
          </div>
        )}
        {online && conexao && conexao.estado !== 'conectado' && (
          <div className={`faixa ${conexao.estado === 'desconectado' ? 'faixa--erro' : 'faixa--info'}`} role="status">
            <Icone nome="rede" tamanho={17} />
            <span>
              {conexao.estado === 'desconectado'
                ? conexao.erro ?? 'Conexão com a mesa encerrada.'
                : conexao.estado === 'reconectando'
                  ? 'Conexão perdida. Tentando reconectar; o que você fizer agora será enviado quando a conexão voltar.'
                  : 'Conectando à mesa…'}
            </span>
            <Botao pequeno onClick={() => void loja.sairDaMesa()}>
              Sair da mesa
            </Botao>
          </div>
        )}

        <div className="conteudo" id="conteudo">
          {visao ? (
            <VisaoContexto.Provider value={visao}>
              {aba === 'mesa' && (
                <Mesa
                  aoAbrirFicha={(id, secao) => {
                    setFichaAberta({ id, secao });
                    setAba('fichas');
                  }}
                />
              )}
              {aba === 'fichas' && <PaginaFichas aberta={fichaAberta} aoAbrir={(id) => setFichaAberta({ id })} aoGerenciarJogadores={() => setDialogo('jogadores')} />}
              {aba === 'compendio' && <PaginaCompendio />}
              {aba === 'diario' && <PaginaDiario />}
              {online && mestreReal && <SincronizadorMapaJogadores />}
            </VisaoContexto.Provider>
          ) : online ? (
            <EstadoVazio icone="rede" titulo={conexao?.estado === 'desconectado' ? 'Não foi possível entrar na mesa' : 'Conectando à mesa…'}>
              {conexao?.erro}
            </EstadoVazio>
          ) : (
            <EstadoVazio icone="pasta" titulo="Nenhuma campanha aberta">
              <p>Crie uma campanha nova ou importe um backup.</p>
              <Botao variante="primario" onClick={() => setDialogo('campanhas')}>
                Abrir campanhas
              </Botao>
            </EstadoVazio>
          )}
        </div>

        {dialogo === 'campanhas' && <DialogoCampanhas aoFechar={() => setDialogo(null)} />}
        {dialogo === 'online' && <DialogoOnline aoFechar={() => setDialogo(null)} />}
        {dialogo === 'jogadores' && visao && (
          <VisaoContexto.Provider value={visao}>
            <DialogoJogadores aoFechar={() => setDialogo(null)} />
          </VisaoContexto.Provider>
        )}
        <Avisos />
      </div>
    </ProvedorConfirmacao>
  );
}

function EstadoSalvamento() {
  const { salvamento } = useEstadoLoja();
  if (salvamento.estado === 'inativo') return null;
  const texto = salvamento.estado === 'salvo' ? 'Salvo' : salvamento.estado === 'salvando' ? 'Salvando…' : 'Não salvo';
  return (
    <span className={`salvamento salvamento--${salvamento.estado}`} role="status" title="Salvamento automático neste navegador">
      <Icone nome={salvamento.estado === 'erro' ? 'alerta' : 'conferir'} tamanho={14} />
      {texto}
    </span>
  );
}

/** Cadastro de jogadores no modo local (na mesa online eles entram por convite). */
function DialogoJogadores({ aoFechar }: { aoFechar(): void }) {
  const loja = useLoja();
  const estado = useEstadoLoja();
  const [nome, setNome] = useState('');
  const jogadores = estado.campanha?.jogadores ?? [];
  const online = estado.modo === 'online';
  return (
    <Dialogo titulo="Jogadores" aoFechar={aoFechar} largura="pequena">
      <div className="formulario">
        <p className="nota">
          Os jogadores servem para atribuir fichas e tokens e para conferir a prévia do que cada um recebe.
          {online ? ' Na mesa online, crie convites pelo painel “Mesa online”.' : ' No modo local não há contas nem acesso remoto: é só um cadastro.'}
        </p>
        {jogadores.length === 0 ? (
          <p className="nota">Nenhum jogador cadastrado.</p>
        ) : (
          <ul className="lista-linhas">
            {jogadores.map((j) => (
              <li key={j.id}>
                <input className="entrada" aria-label={`Nome de ${j.nome}`} defaultValue={j.nome} maxLength={60} onBlur={(e) => e.target.value.trim() && e.target.value !== j.nome && loja.despachar({ tipo: 'jogador.renomear', jogadorId: j.id, nome: e.target.value.trim() })} />
                {!online && <BotaoIcone icone="lixeira" rotulo={`Remover ${j.nome}`} onClick={() => loja.despachar({ tipo: 'jogador.remover', jogadorId: j.id })} />}
              </li>
            ))}
          </ul>
        )}
        {!online && (
          <form
            className="linha-botoes"
            onSubmit={(e) => {
              e.preventDefault();
              if (!nome.trim()) return;
              loja.despachar({ tipo: 'jogador.adicionar', jogador: { id: novoId('jog'), nome: nome.trim() } });
              setNome('');
            }}
          >
            <Campo rotulo="Novo jogador">
              <input className="entrada" value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <Botao type="submit" icone="mais" disabled={!nome.trim()}>
              Adicionar
            </Botao>
          </form>
        )}
      </div>
    </Dialogo>
  );
}

/**
 * Mesa online (mestre): mantém no servidor uma versão do mapa da cena ativa com
 * as regiões sob névoa apagadas. Só essa versão é entregue aos jogadores.
 */
function SincronizadorMapaJogadores() {
  const loja = useLoja();
  const estado = useEstadoLoja();
  const cena: Cena | undefined = estado.campanha?.cenas.find((c) => c.id === estado.campanha?.cenaAtivaId);
  const emCurso = useRef(false);
  const arquivoId = cena?.mapa.tipo === 'arquivo' ? cena.mapa.arquivoId : null;
  const nevoa = cena?.nevoa;
  const preparado = cena?.mapaJogadores;

  useEffect(() => {
    if (!cena || !arquivoId || !nevoa) return;
    const atualizado = preparado && preparado.celulas.length === nevoa.length && new Set(preparado.celulas).size === new Set([...preparado.celulas, ...nevoa]).size;
    if (atualizado) return;
    const temporizador = setTimeout(async () => {
      if (emCurso.current) return;
      emCurso.current = true;
      try {
        const url = await loja.obterUrl(arquivoId);
        if (!url) return;
        const blob = await gerarMapaJogadores(url, cena);
        if (!blob) return;
        const meta = await loja.importarImagem(blob, 'mapa-para-jogadores.jpg', 'mapa-jogadores');
        if (!meta) return;
        loja.despachar({ tipo: 'cena.mapaJogadores', cenaId: cena.id, arquivoId: meta.id, celulas: cena.nevoa });
        if (preparado) void loja.removerImagem(preparado.arquivoId);
      } finally {
        emCurso.current = false;
      }
    }, 700);
    return () => clearTimeout(temporizador);
  }, [cena?.id, arquivoId, nevoa, preparado, loja]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
