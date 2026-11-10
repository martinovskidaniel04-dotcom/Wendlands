/**
 * Mesa online: abrir uma sala a partir da campanha local (mestre), criar e
 * revogar convites, entrar com um convite e sair.
 *
 * A mesa online só existe quando há um servidor da mesa em execução
 * (npm run servidor). Sem ele, este painel explica o que falta — não simula nada.
 */
import { useEffect, useState } from 'react';
import { montarLinkDeEntrada, type RespostaListaConvites } from '../../online/protocolo';
import { Botao, BotaoIcone, Campo, Dialogo, Etiqueta } from '../comuns';
import { useConfirmar, useEstadoLoja, useLoja } from '../contexto';

function baseDoLink(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export function DialogoOnline({ aoFechar }: { aoFechar(): void }) {
  const estado = useEstadoLoja();
  return (
    <Dialogo titulo="Mesa online" aoFechar={aoFechar} largura="media">
      {estado.modo === 'online' ? estado.ator.papel === 'mestre' ? <PainelMestre aoFechar={aoFechar} /> : <PainelJogador aoFechar={aoFechar} /> : <PainelLocal aoFechar={aoFechar} />}
    </Dialogo>
  );
}

function PainelLocal({ aoFechar }: { aoFechar(): void }) {
  const loja = useLoja();
  const estado = useEstadoLoja();
  const [servidor, setServidor] = useState(window.location.origin);
  const [tokenAdmin, setTokenAdmin] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [sala, setSala] = useState('');
  const [token, setToken] = useState('');

  const abrir = async () => {
    setOcupado(true);
    setErro(null);
    const r = await loja.abrirMesaOnline(servidor, tokenAdmin);
    setOcupado(false);
    if (r.ok) loja.avisar('sucesso', 'Mesa online aberta. Crie convites para os jogadores neste painel.');
    else setErro(r.erro);
  };

  return (
    <div className="formulario">
      <p className="nota">
        Você está no <strong>modo local</strong>: tudo fica neste navegador e a “visão do jogador” é apenas uma prévia. Para jogar à distância é preciso um <strong>servidor da mesa</strong> em execução — ele acompanha este projeto (<code>npm run servidor</code>), roda na máquina
        do mestre ou em um servidor seu, e não usa serviços pagos. Sem servidor não há sala online.
      </p>
      <fieldset className="grupo">
        <legend>Abrir uma sala com a campanha “{estado.campanha?.nome ?? '—'}”</legend>
        <Campo rotulo="Endereço do servidor da mesa" dica="Ex.: http://192.168.0.10:8787. Se você abriu esta página pelo próprio servidor, o endereço já está certo.">
          <input className="entrada" value={servidor} onChange={(e) => setServidor(e.target.value)} spellCheck={false} />
        </Campo>
        <Campo rotulo="Token de administração do servidor" dica="Mostrado no terminal quando o servidor inicia (ou definido em WENDLANDS_TOKEN_ADMIN). Serve só para criar salas.">
          <input className="entrada" type="password" autoComplete="off" value={tokenAdmin} onChange={(e) => setTokenAdmin(e.target.value)} />
        </Campo>
        {erro && (
          <p className="campo__erro" role="alert">
            {erro}
          </p>
        )}
        <Botao variante="primario" icone="rede" disabled={!estado.campanha || !tokenAdmin.trim() || ocupado} onClick={() => void abrir()}>
          {ocupado ? 'Abrindo…' : 'Abrir mesa online'}
        </Botao>
        <p className="nota">A campanha e as imagens são enviadas ao servidor, que passa a ser a autoridade sobre dados, permissões e rolagens. Uma cópia continua sendo salva neste navegador.</p>
      </fieldset>
      <fieldset className="grupo">
        <legend>Entrar em uma sala existente</legend>
        <p className="nota">Normalmente basta abrir o link de convite enviado pelo mestre. Se preferir, informe os dados manualmente.</p>
        <div className="grade-campos">
          <Campo rotulo="Código da sala">
            <input className="entrada" value={sala} onChange={(e) => setSala(e.target.value.trim())} spellCheck={false} />
          </Campo>
          <Campo rotulo="Convite (token)">
            <input className="entrada" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value.trim())} />
          </Campo>
        </div>
        <Botao
          disabled={!sala || token.length < 20}
          onClick={() => {
            loja.entrarNaMesa(servidor, sala, token);
            aoFechar();
          }}
        >
          Entrar
        </Botao>
      </fieldset>
    </div>
  );
}

function PainelJogador({ aoFechar }: { aoFechar(): void }) {
  const loja = useLoja();
  const estado = useEstadoLoja();
  return (
    <div className="formulario">
      <p>
        Você está na mesa como <strong>{estado.ator.nome}</strong> (jogador). <Etiqueta tom={estado.conexao?.estado === 'conectado' ? 'verde' : 'alerta'}>{estado.conexao?.estado}</Etiqueta>
      </p>
      <p className="nota">Você recebe apenas o que o mestre liberou: a cena ativa, os tokens visíveis, a sua ficha e as rolagens públicas. As rolagens são feitas pelo servidor.</p>
      <Botao
        variante="perigo"
        onClick={() => {
          void loja.sairDaMesa();
          aoFechar();
        }}
      >
        Sair da mesa
      </Botao>
    </div>
  );
}

function PainelMestre({ aoFechar }: { aoFechar(): void }) {
  const loja = useLoja();
  const estado = useEstadoLoja();
  const confirmar = useConfirmar();
  const cliente = loja.clienteOnline;
  const sessao = loja.sessaoOnline;
  const [convites, setConvites] = useState<RespostaListaConvites['jogadores']>([]);
  const [nome, setNome] = useState('');
  const [novo, setNovo] = useState<{ nome: string; link: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const semAcesso = (estado.campanha?.jogadores ?? []).filter((j) => !convites.some((c) => c.jogadorId === j.id));

  const atualizar = () => {
    cliente
      ?.listarConvites()
      .then((r) => setConvites(r.jogadores))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Não foi possível listar os convites.'));
  };
  useEffect(atualizar, [estado.campanha?.jogadores.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const mostrar = (r: { nome: string; token: string }) => {
    if (!sessao) return;
    const proprio = sessao.servidor === window.location.origin;
    setNovo({ nome: r.nome, link: montarLinkDeEntrada(baseDoLink(), sessao.salaId, r.token, proprio ? undefined : sessao.servidor) });
  };
  const convidar = async () => {
    if (!cliente || !nome.trim()) return;
    setErro(null);
    try {
      mostrar(await cliente.criarConvite(nome.trim()));
      setNome('');
      atualizar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar o convite.');
    }
  };

  return (
    <div className="formulario">
      <p>
        Sala <code>{sessao?.salaId}</code> em <code>{sessao?.servidor}</code> <Etiqueta tom={estado.conexao?.estado === 'conectado' ? 'verde' : 'alerta'}>{estado.conexao?.estado}</Etiqueta>
      </p>
      <p className="nota">O servidor é a autoridade: valida cada comando, rola os dados e envia a cada jogador só a visão dele. Tokens ocultos ou sob névoa, notas privadas e o mapa original não são enviados.</p>

      <fieldset className="grupo">
        <legend>Convites</legend>
        {convites.length === 0 ? (
          <p className="nota">Nenhum jogador com acesso ainda.</p>
        ) : (
          <ul className="lista-linhas">
            {convites.map((c) => (
              <li key={c.jogadorId}>
                <span>
                  <strong>{c.nome}</strong> <Etiqueta tom={c.conectado ? 'verde' : 'neutro'}>{c.conectado ? 'conectado' : 'ausente'}</Etiqueta>
                </span>
                <span className="linha-botoes">
                  <Botao
                    pequeno
                    variante="fantasma"
                    title="Gera um link novo e invalida o anterior"
                    onClick={async () => {
                      try {
                        mostrar(await cliente!.renovarConvite(c.jogadorId));
                        atualizar();
                      } catch (e) {
                        setErro(e instanceof Error ? e.message : 'Falha ao renovar.');
                      }
                    }}
                  >
                    Novo link
                  </Botao>
                  <BotaoIcone
                    icone="fechar"
                    rotulo={`Revogar o acesso de ${c.nome}`}
                    tamanho={15}
                    onClick={async () => {
                      if (await confirmar({ titulo: 'Revogar acesso', texto: `${c.nome} será desconectado e o link deixará de funcionar. A ficha e os tokens continuam na campanha.`, confirmar: 'Revogar', perigo: true })) {
                        await cliente?.revogarConvite(c.jogadorId).catch(() => undefined);
                        atualizar();
                      }
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        {semAcesso.length > 0 && (
          <div className="linha-botoes linha-botoes--centro">
            <span className="nota">Jogadores do cadastro sem acesso:</span>
            {semAcesso.map((j) => (
              <Botao
                key={j.id}
                pequeno
                variante="fantasma"
                onClick={async () => {
                  try {
                    mostrar(await cliente!.renovarConvite(j.id));
                    atualizar();
                  } catch (e) {
                    setErro(e instanceof Error ? e.message : 'Falha ao criar o link.');
                  }
                }}
              >
                Gerar link para {j.nome}
              </Botao>
            ))}
          </div>
        )}
        <form
          className="linha-botoes linha-botoes--base"
          onSubmit={(e) => {
            e.preventDefault();
            void convidar();
          }}
        >
          <Campo rotulo="Convidar jogador">
            <input className="entrada" value={nome} maxLength={60} placeholder="Nome do jogador" onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <Botao type="submit" icone="mais" disabled={!nome.trim()}>
            Criar convite
          </Botao>
        </form>
        {novo && (
          <div className="convite" role="status">
            <p>
              Link de <strong>{novo.nome}</strong> — mostrado só agora. Envie apenas a essa pessoa: quem tiver o link entra como ela.
            </p>
            <div className="linha-botoes">
              <input className="entrada" readOnly aria-label={`Link de convite de ${novo.nome}`} value={novo.link} onFocus={(e) => e.target.select()} />
              <Botao
                pequeno
                icone="copiar"
                onClick={async () => {
                  loja.avisar((await copiar(novo.link)) ? 'sucesso' : 'erro', (await copiar(novo.link)) ? 'Link copiado.' : 'Não foi possível copiar: selecione o texto e copie manualmente.');
                }}
              >
                Copiar
              </Botao>
            </div>
            <p className="nota">Depois de criado, atribua a ficha e os tokens desse jogador na aba Fichas (campo “Jogador dono da ficha”).</p>
          </div>
        )}
        {erro && (
          <p className="campo__erro" role="alert">
            {erro}
          </p>
        )}
      </fieldset>

      <fieldset className="grupo">
        <legend>Encerrar</legend>
        <div className="linha-botoes">
          <Botao
            onClick={() => {
              void loja.sairDaMesa();
              aoFechar();
            }}
            title="A sala continua no servidor. Para voltar como mestre, guarde o link do mestre."
          >
            Sair (manter a sala)
          </Botao>
          <Botao
            variante="fantasma"
            icone="copiar"
            onClick={async () => {
              if (!sessao) return;
              const proprio = sessao.servidor === window.location.origin;
              const ok = await copiar(montarLinkDeEntrada(baseDoLink(), sessao.salaId, sessao.token, proprio ? undefined : sessao.servidor));
              loja.avisar(ok ? 'sucesso' : 'erro', ok ? 'Link do mestre copiado. Guarde-o em segredo: ele dá controle total da sala.' : 'Não foi possível copiar o link.');
            }}
          >
            Copiar link do mestre
          </Botao>
          <Botao
            variante="perigo"
            onClick={async () => {
              if (await confirmar({ titulo: 'Encerrar a sala', texto: 'A sala será apagada do servidor e todos serão desconectados. A campanha continua salva neste navegador, no estado atual.', confirmar: 'Encerrar a sala', perigo: true })) {
                await loja.encerrarMesaOnline();
                aoFechar();
              }
            }}
          >
            Encerrar a sala
          </Botao>
        </div>
      </fieldset>
    </div>
  );
}
