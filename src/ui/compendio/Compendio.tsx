/**
 * Compêndio: busca por história, locais, facções, materiais, bestiário, técnicas
 * e regras. Cada registro mostra fonte, seção, versão, situação e visibilidade.
 */
import { useMemo, useState } from 'react';
import { buscarNoCompendio, entradasDoCompendio, type EntradaListada } from '../../dominio/compendio/busca';
import { NOME_CATEGORIA, NOME_STATUS } from '../../dominio/compendio/semente';
import type { CategoriaCompendio, EntradaCompendio, StatusCompendio } from '../../dominio/esquema';
import { CATEGORIAS_COMPENDIO, STATUS_COMPENDIO } from '../../dominio/esquema';
import { novoId } from '../../dominio/fabrica';
import { lerPacoteCompendio } from '../../dominio/pacote';
import { Botao, Campo, Dialogo, EstadoVazio, Etiqueta, escolherArquivo } from '../comuns';
import { useConfirmar, useLoja, useVisao } from '../contexto';
import { Icone } from '../icones';

const TOM_STATUS: Record<StatusCompendio, 'neutro' | 'latao' | 'verde' | 'vinho' | 'azul' | 'alerta'> = {
  canone: 'latao',
  crenca: 'azul',
  lenda: 'azul',
  lacuna: 'neutro',
  proposta: 'alerta',
  aprovado: 'verde',
  'nao-aprovado': 'vinho',
  rejeitado: 'vinho',
  pendente: 'alerta',
  contexto: 'neutro',
};

export function PaginaCompendio() {
  const { campanha, ator, ehMestre, despachar } = useVisao();
  const loja = useLoja();
  const confirmar = useConfirmar();
  const [consulta, setConsulta] = useState('');
  const [categoria, setCategoria] = useState<CategoriaCompendio | 'todas'>('todas');
  const [status, setStatus] = useState<StatusCompendio | 'todos'>('todos');
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [editando, setEditando] = useState<EntradaCompendio | null>(null);

  const todas = useMemo(() => entradasDoCompendio(campanha, ator), [campanha, ator]);
  const resultados = useMemo(() => buscarNoCompendio(todas, { consulta, categoria, status }), [todas, consulta, categoria, status]);
  const aberta = todas.find((e) => e.id === abertaId) ?? null;

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
    const r = lerPacoteCompendio(bruto);
    if (!r.ok) {
      loja.avisar('erro', r.erro);
      return;
    }
    if (despachar({ tipo: 'compendio.importar', entradas: r.entradas }).ok) {
      loja.avisar('sucesso', `${r.entradas.length} entrada(s) de “${r.titulo}” importada(s) como visíveis só para o mestre.`);
    }
  };

  const liberarLote = async (ids: string[], liberar: boolean, descricao: string) => {
    if (ids.length === 0) return;
    const ok = await confirmar({
      titulo: liberar ? 'Liberar aos jogadores' : 'Ocultar dos jogadores',
      texto: `${liberar ? 'Liberar' : 'Ocultar'} ${ids.length} entrada(s) — ${descricao}?`,
      confirmar: liberar ? 'Liberar' : 'Ocultar',
    });
    if (ok) despachar({ tipo: 'compendio.liberar', ids, liberar });
  };

  return (
    <div className="pagina pagina--duas">
      <aside className="lista-lateral lista-lateral--larga" aria-label="Busca no compêndio">
        <header className="lista-lateral__topo">
          <h1 className="titulo-pagina">Compêndio</h1>
          {ehMestre && (
            <div className="linha-botoes">
              <Botao
                pequeno
                variante="primario"
                icone="mais"
                onClick={() =>
                  setEditando({ id: novoId('ent'), titulo: '', categoria: 'historia', resumo: '', corpo: [''], fonte: 'Anotação do mestre', secao: '', versao: '', status: 'proposta', visibilidade: 'mestre', aliases: [], aparencia: '', conflitos: [] })
                }
              >
                Nova entrada
              </Botao>
              <Botao pequeno icone="importar" onClick={() => void importar()} title="Importa um pacote de entradas (por exemplo, o pacote do mestre). Entram visíveis só para o mestre.">
                Importar pacote
              </Botao>
            </div>
          )}
        </header>
        <div className="busca">
          <Icone nome="busca" tamanho={16} />
          <input className="entrada" type="search" placeholder="Buscar por nome ou texto" aria-label="Buscar no compêndio" value={consulta} onChange={(e) => setConsulta(e.target.value)} />
        </div>
        <div className="grade-campos">
          <select className="entrada" aria-label="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCompendio | 'todas')}>
            <option value="todas">Todas as categorias</option>
            {CATEGORIAS_COMPENDIO.map((c) => (
              <option key={c} value={c}>
                {NOME_CATEGORIA[c]}
              </option>
            ))}
          </select>
          <select className="entrada" aria-label="Situação" value={status} onChange={(e) => setStatus(e.target.value as StatusCompendio | 'todos')}>
            <option value="todos">Todas as situações</option>
            {STATUS_COMPENDIO.map((s) => (
              <option key={s} value={s}>
                {NOME_STATUS[s]}
              </option>
            ))}
          </select>
        </div>
        <p className="nota" role="status">
          {resultados.length} de {todas.length} entrada(s).
          {ehMestre && ` ${todas.filter((e) => e.visibilidade === 'jogadores').length} liberada(s) aos jogadores.`}
        </p>
        {ehMestre && (
          <div className="linha-botoes">
            <Botao pequeno variante="fantasma" onClick={() => void liberarLote(resultados.filter((e) => e.visibilidade === 'mestre').map((e) => e.id), true, 'os resultados desta busca')}>
              Liberar resultados
            </Botao>
            <Botao pequeno variante="fantasma" onClick={() => void liberarLote(resultados.filter((e) => e.visibilidade === 'jogadores').map((e) => e.id), false, 'os resultados desta busca')}>
              Ocultar resultados
            </Botao>
          </div>
        )}
        {todas.length === 0 ? (
          <EstadoVazio icone="livro" titulo={ehMestre ? 'Compêndio vazio' : 'O mestre ainda não liberou entradas'} />
        ) : resultados.length === 0 ? (
          <p className="nota">Nada encontrado. Tente outro termo ou limpe os filtros.</p>
        ) : (
          <ul className="lista-entradas">
            {resultados.map((e) => (
              <li key={e.id}>
                <button type="button" className="item-entrada" aria-current={abertaId === e.id ? 'true' : undefined} onClick={() => setAbertaId(e.id)}>
                  <span className="item-entrada__titulo">{e.titulo}</span>
                  <span className="item-entrada__meta">
                    {NOME_CATEGORIA[e.categoria]} · {NOME_STATUS[e.status]}
                    {ehMestre && (e.visibilidade === 'jogadores' ? ' · liberada' : ' · só mestre')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <section className="detalhe" aria-label="Entrada aberta">
        {aberta ? (
          <Entrada entrada={aberta} aoEditar={() => setEditando(aberta)} aoFechar={() => setAbertaId(null)} />
        ) : (
          <EstadoVazio icone="livro" titulo="Escolha uma entrada">
            {ehMestre ? 'As entradas embutidas trazem o cenário geral e as regras. Segredos do mestre não vêm com o aplicativo: importe o seu pacote ou crie entradas próprias.' : 'Aqui aparece o que o mestre liberou para a mesa.'}
          </EstadoVazio>
        )}
      </section>
      {editando && <EditorEntrada entrada={editando} aoFechar={() => setEditando(null)} aoSalvar={(id) => setAbertaId(id)} />}
    </div>
  );
}

function Entrada({ entrada: e, aoEditar, aoFechar }: { entrada: EntradaListada; aoEditar(): void; aoFechar(): void }) {
  const { ehMestre, despachar } = useVisao();
  const confirmar = useConfirmar();
  return (
    <article className="entrada-compendio">
      <header>
        <p className="entrada-compendio__categoria">{NOME_CATEGORIA[e.categoria]}</p>
        <h2 className="entrada-compendio__titulo">{e.titulo}</h2>
        <div className="linha-botoes">
          <Etiqueta tom={TOM_STATUS[e.status]} titulo="Situação deste registro nas fontes">
            {NOME_STATUS[e.status]}
          </Etiqueta>
          {e.versao && <Etiqueta>{e.versao}</Etiqueta>}
          {ehMestre && <Etiqueta tom={e.visibilidade === 'jogadores' ? 'verde' : 'neutro'}>{e.visibilidade === 'jogadores' ? 'Liberada aos jogadores' : 'Somente mestre'}</Etiqueta>}
          {!e.embutida && <Etiqueta>Entrada da campanha</Etiqueta>}
        </div>
      </header>
      {e.resumo && <p className="entrada-compendio__resumo">{e.resumo}</p>}
      {e.corpo.filter(Boolean).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <h3 className="bloco__titulo">Aparência</h3>
      <p className={e.aparencia ? '' : 'nota'}>{e.aparencia || 'Não documentada nas fontes. Este campo fica vazio até uma decisão do autor.'}</p>
      {e.conflitos.length > 0 && (
        <>
          <h3 className="bloco__titulo">Divergências registradas</h3>
          <ul className="lista-simples">
            {e.conflitos.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      )}
      <dl className="regra__fonte">
        <dt>Fonte</dt>
        <dd>{e.fonte || '—'}</dd>
        <dt>Seção ou auditoria</dt>
        <dd>{e.secao || '—'}</dd>
        {e.aliases.length > 0 && (
          <>
            <dt>Também buscável por</dt>
            <dd>{e.aliases.join(', ')}</dd>
          </>
        )}
      </dl>
      {ehMestre && (
        <footer className="linha-botoes">
          <Botao icone={e.visibilidade === 'jogadores' ? 'olhoFechado' : 'olho'} onClick={() => despachar({ tipo: 'compendio.liberar', ids: [e.id], liberar: e.visibilidade !== 'jogadores' })}>
            {e.visibilidade === 'jogadores' ? 'Ocultar dos jogadores' : 'Liberar aos jogadores'}
          </Botao>
          {!e.embutida && (
            <>
              <Botao icone="editar" onClick={aoEditar}>
                Editar
              </Botao>
              <Botao
                variante="perigo"
                icone="lixeira"
                onClick={async () => {
                  if (await confirmar({ titulo: 'Excluir entrada', texto: `Excluir “${e.titulo}” do compêndio desta campanha?`, confirmar: 'Excluir', perigo: true })) {
                    despachar({ tipo: 'compendio.excluir', entradaId: e.id });
                    aoFechar();
                  }
                }}
              >
                Excluir
              </Botao>
            </>
          )}
        </footer>
      )}
    </article>
  );
}

function EditorEntrada({ entrada, aoFechar, aoSalvar }: { entrada: EntradaCompendio; aoFechar(): void; aoSalvar(id: string): void }) {
  const { despachar } = useVisao();
  const [e, setE] = useState<EntradaCompendio>({ ...entrada });
  const [corpo, setCorpo] = useState(entrada.corpo.join('\n\n'));
  const [aliases, setAliases] = useState(entrada.aliases.join(', '));
  const salvar = () => {
    const final: EntradaCompendio = {
      ...e,
      titulo: e.titulo.trim(),
      corpo: corpo.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).slice(0, 40),
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean).slice(0, 20),
    };
    if (despachar({ tipo: 'compendio.salvar', entrada: final }).ok) {
      aoSalvar(final.id);
      aoFechar();
    }
  };
  return (
    <Dialogo
      titulo={entrada.titulo ? 'Editar entrada' : 'Nova entrada'}
      aoFechar={aoFechar}
      largura="media"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" disabled={!e.titulo.trim()} onClick={salvar}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="formulario">
        <Campo rotulo="Título" largo>
          <input className="entrada" value={e.titulo} maxLength={160} autoFocus onChange={(ev) => setE({ ...e, titulo: ev.target.value })} />
        </Campo>
        <div className="grade-campos">
          <Campo rotulo="Categoria">
            <select className="entrada" value={e.categoria} onChange={(ev) => setE({ ...e, categoria: ev.target.value as CategoriaCompendio })}>
              {CATEGORIAS_COMPENDIO.map((c) => (
                <option key={c} value={c}>
                  {NOME_CATEGORIA[c]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Situação" dica="Cânone, crença, lenda, proposta, aprovado, rejeitado, pendente…">
            <select className="entrada" value={e.status} onChange={(ev) => setE({ ...e, status: ev.target.value as StatusCompendio })}>
              {STATUS_COMPENDIO.map((s) => (
                <option key={s} value={s}>
                  {NOME_STATUS[s]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Fonte">
            <input className="entrada" value={e.fonte} maxLength={200} onChange={(ev) => setE({ ...e, fonte: ev.target.value })} />
          </Campo>
          <Campo rotulo="Seção ou auditoria">
            <input className="entrada" value={e.secao} maxLength={200} onChange={(ev) => setE({ ...e, secao: ev.target.value })} />
          </Campo>
          <Campo rotulo="Versão">
            <input className="entrada" value={e.versao} maxLength={60} onChange={(ev) => setE({ ...e, versao: ev.target.value })} />
          </Campo>
          <Campo rotulo="Visibilidade">
            <select className="entrada" value={e.visibilidade} onChange={(ev) => setE({ ...e, visibilidade: ev.target.value as EntradaCompendio['visibilidade'] })}>
              <option value="mestre">Somente mestre</option>
              <option value="jogadores">Liberada aos jogadores</option>
            </select>
          </Campo>
        </div>
        <Campo rotulo="Resumo" largo>
          <input className="entrada" value={e.resumo} maxLength={400} onChange={(ev) => setE({ ...e, resumo: ev.target.value })} />
        </Campo>
        <Campo rotulo="Texto (separe parágrafos com uma linha em branco)" largo>
          <textarea className="entrada entrada--area" rows={7} value={corpo} onChange={(ev) => setCorpo(ev.target.value)} />
        </Campo>
        <Campo rotulo="Aparência (deixe vazio se não estiver documentada)" largo>
          <textarea className="entrada entrada--area" rows={2} maxLength={1000} value={e.aparencia} onChange={(ev) => setE({ ...e, aparencia: ev.target.value })} />
        </Campo>
        <Campo rotulo="Outros nomes para a busca (separados por vírgula)" largo>
          <input className="entrada" value={aliases} onChange={(ev) => setAliases(ev.target.value)} />
        </Campo>
      </div>
    </Dialogo>
  );
}
