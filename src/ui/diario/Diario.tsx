/**
 * Diário da campanha: anotações de sessão com visibilidade (só mestre ou
 * liberada aos jogadores) e as decisões de sessão registradas.
 */
import { useState } from 'react';
import type { EntradaDiario } from '../../dominio/esquema';
import { agoraIso, novoId } from '../../dominio/fabrica';
import { Botao, Campo, EstadoVazio, Etiqueta, dataCurta } from '../comuns';
import { useConfirmar, useVisao } from '../contexto';

export function PaginaDiario() {
  const { campanha, ehMestre, despachar } = useVisao();
  const confirmar = useConfirmar();
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const entradas = [...campanha.diario].sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm));
  const aberta = entradas.find((e) => e.id === abertaId) ?? null;

  const nova = () => {
    const agora = agoraIso();
    const entrada: EntradaDiario = { id: novoId('dia'), titulo: 'Nova anotação', texto: '', criadaEm: agora, atualizadaEm: agora, visibilidade: 'mestre' };
    if (despachar({ tipo: 'diario.salvar', entrada }).ok) setAbertaId(entrada.id);
  };
  const salvar = (entrada: EntradaDiario, alteracoes: Partial<EntradaDiario>) => despachar({ tipo: 'diario.salvar', entrada: { ...entrada, ...alteracoes, atualizadaEm: agoraIso() } });

  return (
    <div className="pagina pagina--duas">
      <aside className="lista-lateral" aria-label="Anotações do diário">
        <header className="lista-lateral__topo">
          <h1 className="titulo-pagina">Diário</h1>
          {ehMestre && (
            <Botao pequeno variante="primario" icone="mais" onClick={nova}>
              Nova anotação
            </Botao>
          )}
        </header>
        {entradas.length === 0 ? (
          <p className="nota">{ehMestre ? 'Nenhuma anotação ainda.' : 'O mestre ainda não liberou anotações.'}</p>
        ) : (
          <ul className="lista-entradas">
            {entradas.map((e) => (
              <li key={e.id}>
                <button type="button" className="item-entrada" aria-current={abertaId === e.id ? 'true' : undefined} onClick={() => setAbertaId(e.id)}>
                  <span className="item-entrada__titulo">{e.titulo || 'Sem título'}</span>
                  <span className="item-entrada__meta">
                    {dataCurta(e.atualizadaEm)}
                    {ehMestre && (e.visibilidade === 'jogadores' ? ' · liberada' : ' · só mestre')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <section className="detalhe" aria-label="Anotação aberta">
        {!aberta ? (
          <EstadoVazio icone="historico" titulo="Escolha uma anotação">
            {ehMestre ? 'Use o diário para o resumo das sessões, ganchos e revelações. Cada anotação começa visível só para o mestre.' : 'Aqui aparecem as anotações que o mestre liberou.'}
          </EstadoVazio>
        ) : ehMestre ? (
          <div className="formulario" key={aberta.id}>
            <Campo rotulo="Título" largo>
              <input className="entrada entrada--titulo" defaultValue={aberta.titulo} maxLength={160} onBlur={(e) => e.target.value !== aberta.titulo && salvar(aberta, { titulo: e.target.value })} />
            </Campo>
            <Campo rotulo="Quem pode ler" dica="Anotações “só mestre” nunca são enviadas aos jogadores.">
              <select className="entrada" value={aberta.visibilidade} onChange={(e) => salvar(aberta, { visibilidade: e.target.value as EntradaDiario['visibilidade'] })}>
                <option value="mestre">Somente mestre</option>
                <option value="jogadores">Liberada aos jogadores</option>
              </select>
            </Campo>
            <Campo rotulo="Texto" largo>
              <textarea className="entrada entrada--area entrada--longa" rows={16} maxLength={20000} defaultValue={aberta.texto} onBlur={(e) => e.target.value !== aberta.texto && salvar(aberta, { texto: e.target.value })} />
            </Campo>
            <div className="linha-botoes">
              <span className="nota">Atualizada em {dataCurta(aberta.atualizadaEm)}. O texto é salvo ao sair do campo.</span>
              <Botao
                variante="perigo"
                icone="lixeira"
                onClick={async () => {
                  if (await confirmar({ titulo: 'Excluir anotação', texto: `Excluir “${aberta.titulo}” do diário?`, confirmar: 'Excluir', perigo: true })) {
                    despachar({ tipo: 'diario.excluir', entradaId: aberta.id });
                    setAbertaId(null);
                  }
                }}
              >
                Excluir
              </Botao>
            </div>
          </div>
        ) : (
          <article className="entrada-compendio">
            <h2 className="entrada-compendio__titulo">{aberta.titulo}</h2>
            <p className="nota">{dataCurta(aberta.atualizadaEm)}</p>
            {aberta.texto.split(/\n\s*\n/).map((p, i) => (
              <p key={i} className="texto-pre">
                {p}
              </p>
            ))}
          </article>
        )}
        {ehMestre && campanha.decisoes.length > 0 && (
          <section className="bloco">
            <h3 className="bloco__titulo">Decisões de sessão registradas</h3>
            <p className="nota">Anotações do mestre sobre decisões tomadas na mesa. Não alteram o cânone nem o estado de aprovação das regras.</p>
            <ul className="lista-simples">
              {[...campanha.decisoes].reverse().map((d) => (
                <li key={d.id}>
                  {d.referencia && <Etiqueta>{d.referencia}</Etiqueta>} {d.texto} <span className="nota">({dataCurta(d.em)})</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    </div>
  );
}
