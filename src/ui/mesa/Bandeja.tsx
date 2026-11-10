/**
 * Bandeja inferior: dados (d4–d100, expressões limitadas) e histórico.
 */
import { useState, type RefObject } from 'react';
import { LADOS_PERMITIDOS, analisarExpressao, descreverRolagem } from '../../dominio/dados';
import { Botao, BotaoIcone, horaCurta } from '../comuns';
import { useConfirmar, useVisao } from '../contexto';
import { Icone, type NomeIcone } from '../icones';

/** Clicar num dado: soma mais um do mesmo tipo, ou começa uma expressão nova. */
function comDado(expressao: string, lados: number): string {
  const a = analisarExpressao(expressao);
  if (a.ok && a.expressao.termos[0]?.tipo === 'dado' && a.expressao.termos[0].lados === lados && a.expressao.termos[0].sinal === 1) {
    const termos = a.expressao.termos.map((t, i) => (i === 0 && t.tipo === 'dado' ? { ...t, quantidade: Math.min(50, t.quantidade + 1) } : t));
    return termos
      .map((t, i) => `${i === 0 ? '' : t.sinal === -1 ? ' - ' : ' + '}${t.tipo === 'dado' ? `${t.quantidade}d${t.lados}` : t.valor}`)
      .join('');
  }
  return `1d${lados}`;
}

/** Ajusta o modificador constante no fim da expressão. */
function comModificador(expressao: string, delta: number): string {
  const a = analisarExpressao(expressao);
  if (!a.ok) return expressao;
  const dados = a.expressao.termos.filter((t) => t.tipo === 'dado');
  const constante = a.expressao.termos.filter((t) => t.tipo === 'constante').reduce((s, t) => s + t.sinal * (t.tipo === 'constante' ? t.valor : 0), 0) + delta;
  const base = dados.map((t, i) => `${i === 0 ? (t.sinal === -1 ? '-' : '') : t.sinal === -1 ? ' - ' : ' + '}${t.tipo === 'dado' ? `${t.quantidade}d${t.lados}` : ''}`).join('');
  if (constante === 0) return base || '0';
  return `${base}${base ? (constante < 0 ? ' - ' : ' + ') : constante < 0 ? '-' : ''}${Math.abs(constante)}`;
}

export function Bandeja({ recolhida, aoAlternar, refExpressao }: { recolhida: boolean; aoAlternar(): void; refExpressao: RefObject<HTMLInputElement | null> }) {
  const { campanha, ehMestre, previa, despachar } = useVisao();
  const confirmar = useConfirmar();
  const [expressao, setExpressao] = useState('1d20');
  const [rotulo, setRotulo] = useState('');
  const [privada, setPrivada] = useState(false);
  const analise = analisarExpressao(expressao);
  const historico = [...campanha.historico].reverse();

  const rolar = () => {
    if (!analise.ok || previa) return;
    despachar({ tipo: 'dados.rolar', expressao, rotulo, visibilidade: privada ? 'mestre' : 'publica' });
  };

  if (recolhida) {
    const ultima = historico[0];
    return (
      <div className="bandeja bandeja--recolhida">
        <BotaoIcone icone="setaCima" rotulo="Mostrar dados e histórico" onClick={aoAlternar} />
        <span className="bandeja__titulo">Dados e histórico</span>
        {ultima && (
          <span className="bandeja__ultima">
            {ultima.rotulo}
            {ultima.resultado ? ` · ${descreverRolagem(ultima.resultado)}` : ''}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bandeja">
      <section className="dados" aria-label="Dados">
        <header className="bandeja__topo">
          <h3 className="secao__titulo">Dados</h3>
          <BotaoIcone icone="setaBaixo" rotulo="Recolher dados e histórico" tamanho={15} onClick={aoAlternar} />
        </header>
        <div className="dados__lista" role="group" aria-label="Adicionar dado à rolagem">
          {LADOS_PERMITIDOS.map((lados) => (
            <button key={lados} type="button" className="dado" onClick={() => setExpressao((e) => comDado(e, lados))} aria-label={`Adicionar d${lados}`} title={`Adicionar d${lados}`}>
              <Icone nome={`d${lados}` as NomeIcone} tamanho={30} />
              <span>d{lados}</span>
            </button>
          ))}
        </div>
        <form
          className="dados__form"
          onSubmit={(e) => {
            e.preventDefault();
            rolar();
          }}
        >
          <div className="dados__expressao">
            <BotaoIcone icone="menos" rotulo="Diminuir modificador" tamanho={15} onClick={() => setExpressao((e) => comModificador(e, -1))} />
            <input
              ref={refExpressao}
              className="entrada"
              aria-label="Expressão de dados"
              aria-invalid={!analise.ok}
              aria-describedby="erro-expressao"
              value={expressao}
              maxLength={60}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setExpressao(e.target.value)}
            />
            <BotaoIcone icone="mais" rotulo="Aumentar modificador" tamanho={15} onClick={() => setExpressao((e) => comModificador(e, 1))} />
          </div>
          <input className="entrada dados__rotulo" aria-label="Descrição da rolagem (opcional)" placeholder="Descrição (opcional)" maxLength={120} value={rotulo} onChange={(e) => setRotulo(e.target.value)} />
          <label className="alternar" title="Rolagem privada: só o mestre e quem rolou veem o resultado">
            <input type="checkbox" checked={privada} onChange={(e) => setPrivada(e.target.checked)} />
            <Icone nome="cadeado" tamanho={15} />
            <span>{ehMestre ? 'Só o mestre' : 'Privada ao mestre'}</span>
          </label>
          <Botao type="submit" variante="primario" icone="dado" disabled={!analise.ok || previa} className="dados__rolar">
            Rolar {analise.ok ? analise.expressao.texto : ''}
          </Botao>
          <p id="erro-expressao" className="dados__erro" role="alert">
            {analise.ok ? '' : analise.erro}
          </p>
        </form>
      </section>

      <section className="historico" aria-label="Histórico">
        <header className="bandeja__topo">
          <h3 className="secao__titulo">Histórico</h3>
          {ehMestre && historico.length > 0 && (
            <BotaoIcone
              icone="lixeira"
              rotulo="Limpar histórico"
              tamanho={15}
              onClick={async () => {
                if (await confirmar({ titulo: 'Limpar histórico', texto: 'Apagar todas as rolagens e eventos do histórico desta campanha?', confirmar: 'Limpar', perigo: true })) {
                  despachar({ tipo: 'historico.limpar' });
                }
              }}
            />
          )}
        </header>
        {historico.length === 0 ? (
          <p className="nota">Nenhuma rolagem ainda.</p>
        ) : (
          <ol className="historico__lista" aria-live="polite">
            {historico.slice(0, 80).map((h) => (
              <li key={h.id} className={`hist hist--${h.tipo}`}>
                <span className={`hist__ponto hist__ponto--${h.autor.papel}`} aria-hidden="true" />
                <span className="hist__texto">
                  {h.visibilidade === 'mestre' && (
                    <span className="hist__privada" title="Visível apenas para o mestre e para quem rolou">
                      <Icone nome="cadeado" tamanho={12} /> privada ·{' '}
                    </span>
                  )}
                  <span className="hist__autor">{h.autor.nome}</span> · {h.rotulo}
                  {h.resultado && (
                    <>
                      {' · '}
                      <span className="hist__conta">{descreverRolagem(h.resultado).replace(/= -?\d+$/, '= ')}</span>
                      <strong className="hist__total">{h.resultado.total}</strong>
                    </>
                  )}
                </span>
                <time className="hist__hora" dateTime={h.em}>
                  {horaCurta(h.em)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
