/**
 * Campanhas: criar, abrir, renomear, duplicar, excluir (reversível), exportar
 * (backup completo × somente dados) e importar (cópia × substituição).
 */
import { useEffect, useState } from 'react';
import { LIMITES_ARQUIVO } from '../../dominio/pacote';
import { estimarArmazenamento, formatarBytes } from '../../persistencia/armazenamento';
import { Botao, BotaoIcone, Campo, Dialogo, Etiqueta, dataCurta, escolherArquivo } from '../comuns';
import { useConfirmar, useEstadoLoja, useLoja } from '../contexto';
import { baixarBlob, type PreviaImportacao } from '../loja';

export function DialogoCampanhas({ aoFechar }: { aoFechar(): void }) {
  const loja = useLoja();
  const estado = useEstadoLoja();
  const confirmar = useConfirmar();
  const [nome, setNome] = useState('');
  const [modelo, setModelo] = useState<'vazia' | 'demo'>('vazia');
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [uso, setUso] = useState<{ usado: number; cota: number } | null>(null);
  const online = estado.modo === 'online';

  useEffect(() => {
    void estimarArmazenamento().then(setUso);
  }, [estado.campanhas]);

  const exportarBackup = async () => {
    setOcupado(true);
    try {
      const r = await loja.exportarBackup();
      if (!r) return;
      baixarBlob(r.blob, r.nome);
      if (r.ausentes.length > 0) {
        loja.avisar('erro', `Backup INCOMPLETO: ${r.ausentes.length} imagem(ns) não puderam ser lidas (${r.ausentes.map((a) => a.nome).join(', ')}). O arquivo foi marcado como incompleto.`, undefined, 0);
      } else loja.avisar('sucesso', 'Backup completo exportado: dados e todas as imagens da campanha.');
    } finally {
      setOcupado(false);
    }
  };

  const escolherImportacao = async () => {
    const arquivo = await escolherArquivo('.zip,.json,application/zip,application/json');
    if (!arquivo) return;
    setOcupado(true);
    try {
      const r = await loja.analisarImportacao(arquivo);
      if (!r.ok) loja.avisar('erro', r.erro);
      else setPrevia(r.previa);
    } finally {
      setOcupado(false);
    }
  };

  const concluir = async (modo: 'copia' | 'substituir') => {
    if (!previa) return;
    if (modo === 'substituir') {
      const ok = await confirmar({
        titulo: 'Substituir campanha existente',
        texto: (
          <>
            A campanha <strong>{previa.existente?.nome}</strong> deste navegador (atualizada em {dataCurta(previa.existente?.atualizadaEm ?? '')}) será trocada pelo conteúdo do arquivo, incluindo as imagens. Não é possível desfazer. Se tiver dúvida, importe como cópia.
          </>
        ),
        confirmar: 'Substituir',
        perigo: true,
      });
      if (!ok) return;
    }
    setOcupado(true);
    try {
      if (await loja.concluirImportacao(previa, modo)) {
        setPrevia(null);
        aoFechar();
      }
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialogo titulo="Campanhas" aoFechar={aoFechar} largura="grande">
      <div className="formulario">
        {online && <p className="nota nota--alerta">Você está numa mesa online. Para gerenciar campanhas locais, saia da mesa primeiro.</p>}
        {!estado.armazenamento && <p className="nota nota--alerta">Sem armazenamento local neste navegador: campanhas não são salvas.</p>}

        {!online && (
          <section className="bloco">
            <h3 className="bloco__titulo">Neste navegador</h3>
            {estado.campanhas.length === 0 ? (
              <p className="nota">Nenhuma campanha salva.</p>
            ) : (
              <ul className="campanhas">
                {estado.campanhas.map((c) => {
                  const aberta = c.id === estado.campanha?.id;
                  return (
                    <li key={c.id} className={`campanha${aberta ? ' campanha--aberta' : ''}`}>
                      {renomeando?.id === c.id ? (
                        <form
                          className="campanha__nome"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void loja.renomearCampanha(c.id, renomeando.nome);
                            setRenomeando(null);
                          }}
                        >
                          <input className="entrada" aria-label="Nome da campanha" autoFocus maxLength={80} value={renomeando.nome} onChange={(e) => setRenomeando({ id: c.id, nome: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setRenomeando(null)} />
                          <Botao pequeno type="submit" variante="primario">
                            Salvar
                          </Botao>
                        </form>
                      ) : (
                        <div className="campanha__nome">
                          <strong>{c.nome}</strong>
                          {aberta && <Etiqueta tom="verde">aberta</Etiqueta>}
                          <span className="nota">
                            {c.cenas} cena(s) · {c.fichas} ficha(s) · {dataCurta(c.atualizadaEm)}
                          </span>
                        </div>
                      )}
                      <div className="linha-botoes">
                        {!aberta && (
                          <Botao
                            pequeno
                            variante="primario"
                            onClick={() => {
                              void loja.abrirCampanha(c.id);
                              aoFechar();
                            }}
                          >
                            Abrir
                          </Botao>
                        )}
                        <BotaoIcone icone="editar" rotulo={`Renomear ${c.nome}`} tamanho={16} onClick={() => setRenomeando({ id: c.id, nome: c.nome })} />
                        <BotaoIcone icone="duplicar" rotulo={`Duplicar ${c.nome}`} tamanho={16} onClick={() => void loja.duplicarCampanha(c.id)} />
                        <BotaoIcone
                          icone="lixeira"
                          rotulo={`Excluir ${c.nome}`}
                          tamanho={16}
                          onClick={async () => {
                            if (await confirmar({ titulo: 'Excluir campanha', texto: `Excluir “${c.nome}”? Ela sai da lista agora, pode ser restaurada pelo aviso “Desfazer” e é apagada de vez, com as imagens, depois de 7 dias.`, confirmar: 'Excluir', perigo: true })) {
                              void loja.excluirCampanha(c.id);
                            }
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <form
              className="linha-botoes linha-botoes--base"
              onSubmit={(e) => {
                e.preventDefault();
                void loja.criarCampanha(nome, modelo).then(aoFechar);
              }}
            >
              <Campo rotulo="Nova campanha">
                <input className="entrada" value={nome} maxLength={80} placeholder="Nome da campanha" onChange={(e) => setNome(e.target.value)} />
              </Campo>
              <Campo rotulo="Começar com">
                <select className="entrada" value={modelo} onChange={(e) => setModelo(e.target.value as 'vazia' | 'demo')}>
                  <option value="vazia">Campanha vazia</option>
                  <option value="demo">Conteúdo de demonstração (fictício)</option>
                </select>
              </Campo>
              <Botao type="submit" variante="primario" icone="mais" disabled={!estado.armazenamento && false}>
                Criar
              </Botao>
            </form>
          </section>
        )}

        <section className="bloco">
          <h3 className="bloco__titulo">Exportar “{estado.campanha?.nome ?? '—'}”</h3>
          <div className="opcoes-exportar">
            <div>
              <Botao icone="exportar" variante="primario" disabled={!estado.campanha || ocupado} onClick={() => void exportarBackup()}>
                Backup completo (.zip)
              </Botao>
              <p className="nota">Dados da campanha e todas as imagens (mapas e retratos). É o arquivo certo para guardar ou mudar de computador.</p>
            </div>
            <div>
              <Botao
                icone="exportar"
                disabled={!estado.campanha || ocupado}
                onClick={() => {
                  const r = loja.exportarDados();
                  if (r) {
                    baixarBlob(r.blob, r.nome);
                    loja.avisar('info', 'Exportado somente os dados. Este arquivo não contém mapas nem retratos: não é um backup completo.');
                  }
                }}
              >
                Somente dados (.json)
              </Botao>
              <p className="nota">Fichas, cenas, tokens e textos, sem imagens. Não é um backup completo: mapas importados e retratos ficam de fora.</p>
            </div>
          </div>
        </section>

        {!online && (
          <section className="bloco">
            <h3 className="bloco__titulo">Importar</h3>
            <p className="nota">Aceita o backup completo (.zip) ou o arquivo somente de dados (.json). O conteúdo é validado antes de qualquer gravação.</p>
            <Botao icone="importar" disabled={ocupado || !estado.armazenamento} onClick={() => void escolherImportacao()}>
              Escolher arquivo…
            </Botao>
            {previa && (
              <div className="previa-importacao" role="region" aria-label="Arquivo a importar">
                <p>
                  <strong>{previa.campanha.nome}</strong> — {previa.campanha.cenas.length} cena(s), {previa.campanha.fichas.length} ficha(s), {previa.arquivos.length} imagem(ns).{' '}
                  {previa.formato === 'pacote' ? 'Pacote completo.' : 'Somente dados (sem imagens).'}
                </p>
                {previa.avisos.length > 0 && (
                  <ul className="lista-simples">
                    {previa.avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                )}
                {previa.existente && (
                  <p className="nota nota--alerta">
                    Já existe aqui uma campanha com o mesmo identificador: “{previa.existente.nome}”{previa.existente.excluidaEm ? ' (excluída, ainda na lixeira)' : ''}. Importar como cópia não mexe nela; substituir troca o conteúdo dela pelo do arquivo.
                  </p>
                )}
                <div className="linha-botoes">
                  <Botao variante="primario" disabled={ocupado} onClick={() => void concluir('copia')}>
                    Importar como cópia
                  </Botao>
                  {previa.existente && (
                    <Botao variante="perigo" disabled={ocupado} onClick={() => void concluir('substituir')}>
                      Substituir a existente…
                    </Botao>
                  )}
                  <Botao variante="fantasma" onClick={() => setPrevia(null)}>
                    Cancelar
                  </Botao>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="bloco">
          <h3 className="bloco__titulo">Armazenamento</h3>
          <p className="nota">
            {uso ? `Em uso neste site: ${formatarBytes(uso.usado)} de cerca de ${formatarBytes(uso.cota)} oferecidos pelo navegador.` : 'O navegador não informa o espaço disponível.'} As campanhas ficam somente neste navegador e neste dispositivo — limpar os dados do site apaga tudo, por isso exporte backups. Limites por imagem: mapas até{' '}
            {formatarBytes(LIMITES_ARQUIVO.mapa)}, retratos até {formatarBytes(LIMITES_ARQUIVO.retrato)}. Se o espaço acabar, o aplicativo avisa e mantém o que já estava salvo.
          </p>
        </section>
      </div>
    </Dialogo>
  );
}
