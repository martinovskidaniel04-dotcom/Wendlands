/**
 * Criação de ficha: guiada pelas regras aprovadas (8 pontos, teto +4, sorteio
 * transparente de origem e de reserva) ou manual pelo mestre.
 */
import { useMemo, useState } from 'react';
import { criarFonteCripto } from '../../dominio/dados';
import type { Atributos, ChaveAtributo, Ficha, Id, Origem } from '../../dominio/esquema';
import { ATRIBUTOS, ESTILOS, ORIGENS } from '../../dominio/esquema';
import { CREDITOS_INICIAIS, equipamentoInicial, novaFicha } from '../../dominio/fabrica';
import { NOME_ORIGEM, PONTOS_CRIACAO, SIGLA_ATRIBUTO, TETO_CRIACAO, pvMaximoCalculado, validarCriacao, vigMaximaCalculada } from '../../dominio/regras/ficha';
import { descreverSorteio, escolherSubgrupo, sortearFaixa, sortearRy, sortearSubgrupo, type PrimeiraEtapa, type SegundaEtapa } from '../../dominio/regras/origem';
import { Botao, BotaoIcone, Campo, CampoNumero, Dialogo, RefRegra } from '../comuns';
import { useVisao } from '../contexto';

const NOME_ESTILO: Record<(typeof ESTILOS)[number], string> = { '': 'Nenhum', gartio: 'Gartio', 'corpo-armado': 'Corpo Armado', letalitas: 'Letalitas' };

export function CriarFicha({ aoFechar, aoCriar }: { aoFechar(): void; aoCriar(id: Id): void }) {
  const { despachar } = useVisao();
  const fonte = useMemo(() => criarFonteCripto(), []);
  const [manual, setManual] = useState(false);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<Ficha['tipo']>('pj');
  const [origem, setOrigem] = useState<Origem>('normal');
  const [faccao, setFaccao] = useState('');
  const [primeira, setPrimeira] = useState<PrimeiraEtapa | null>(null);
  const [segunda, setSegunda] = useState<SegundaEtapa | null>(null);
  const [atributos, setAtributos] = useState<Atributos>({ fis: 2, des: 2, men: 2, yan: 2 });
  const [ry, setRy] = useState<{ valor: number; detalhe: string } | null>(null);
  const [estilo, setEstilo] = useState<Ficha['estiloMarcial']>('');
  const [comEquipamento, setComEquipamento] = useState(true);
  const [nivel, setNivel] = useState(1);

  const base: Atributos = origem === 'esquecido' ? { ...atributos, yan: 0 } : atributos;
  const soma = ATRIBUTOS.reduce((s, a) => s + base[a], 0);
  const erros = validarCriacao(origem, base);
  const precisaRy = origem !== 'esquecido';
  const pronto = nome.trim().length > 0 && (manual || erros.length === 0) && (!precisaRy || ry !== null || manual);

  const definirOrigem = (o: Origem, f = '') => {
    setOrigem(o);
    setFaccao(f);
    setRy(null);
    if (o === 'esquecido') setAtributos((a) => ({ ...a, yan: 0 }));
  };

  const sortearD20 = () => {
    const p = sortearFaixa(fonte);
    setPrimeira(p);
    setSegunda(null);
    if (p.faixa === 'normal') definirOrigem('normal');
  };
  const concluirSegunda = (s: SegundaEtapa | null) => {
    if (!s) return;
    setSegunda(s);
    definirOrigem(s.origem, s.faccao);
  };

  const criar = () => {
    const ficha = novaFicha({
      nome: nome.trim(),
      tipo,
      origem,
      faccao,
      nivel,
      atributosBase: base,
      estiloMarcial: estilo,
      ryBase: precisaRy ? ry?.valor ?? 0 : 0,
      ryDetalhe: precisaRy ? ry?.detalhe ?? '' : '',
      equipamento: comEquipamento ? equipamentoInicial() : [],
      creditos: comEquipamento ? CREDITOS_INICIAIS : 0,
      compartilhamento: tipo === 'pj' ? 'resumo' : 'oculta',
      registroOrigem: primeira && segunda ? descreverSorteio(primeira, segunda) : manual ? 'Ficha criada manualmente pelo mestre.' : 'Origem escolhida diretamente na criação.',
    });
    if (despachar({ tipo: 'ficha.criar', ficha }).ok) aoCriar(ficha.id);
  };

  return (
    <Dialogo
      titulo="Nova ficha"
      aoFechar={aoFechar}
      largura="media"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" disabled={!pronto} onClick={criar}>
            Criar ficha
          </Botao>
        </>
      }
    >
      <div className="formulario">
        <label className="alternar">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          <span>Criação manual pelo mestre (não exige a distribuição de 8 pontos)</span>
        </label>
        <div className="grade-campos">
          <Campo rotulo="Nome">
            <input className="entrada" value={nome} maxLength={80} autoFocus onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <Campo rotulo="Tipo">
            <select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value as Ficha['tipo'])}>
              <option value="pj">Personagem de jogador</option>
              <option value="pnj">Personagem do mestre</option>
            </select>
          </Campo>
        </div>

        <fieldset className="grupo">
          <legend>
            Origem <RefRegra id="origem" />
          </legend>
          <div className="grade-campos">
            <Campo rotulo="Origem">
              <select
                className="entrada"
                value={origem}
                onChange={(e) => {
                  setPrimeira(null);
                  setSegunda(null);
                  definirOrigem(e.target.value as Origem);
                }}
              >
                {ORIGENS.map((o) => (
                  <option key={o} value={o}>
                    {NOME_ORIGEM[o]}
                  </option>
                ))}
              </select>
            </Campo>
            {origem === 'normal' && (
              <Campo rotulo="Facção">
                <select className="entrada" value={faccao} onChange={(e) => setFaccao(e.target.value)}>
                  <option value="">Sem facção</option>
                  <option value="Sangue de Darion">Sangue de Darion</option>
                </select>
              </Campo>
            )}
          </div>
          <div className="sorteio">
            <Botao pequeno icone="dado" onClick={sortearD20}>
              Sortear origem (d20)
            </Botao>
            {primeira && (
              <p className="nota" role="status">
                d20 = <strong>{primeira.d20}</strong>: {primeira.faixa === 'normal' ? '1–14, Normal.' : '15–20, Luzionne ou Esquecido.'}
              </p>
            )}
            {primeira && !segunda && (
              <div className="sorteio__segunda">
                <p className="nota">
                  Segunda etapa — as fontes trazem dois enunciados ainda não conciliados: sorteio equitativo (registro de auditorias) ou escolha (prompt antigo). Decida como a mesa procede; o método usado fica registrado na ficha.
                </p>
                <div className="linha-botoes">
                  <Botao pequeno icone="dado" onClick={() => concluirSegunda(sortearSubgrupo(primeira.faixa, fonte))}>
                    Sortear (equitativo)
                  </Botao>
                  {primeira.faixa === 'normal' ? (
                    <>
                      <Botao pequeno variante="fantasma" onClick={() => concluirSegunda(escolherSubgrupo('normal', 'normal', ''))}>
                        Escolher: sem facção
                      </Botao>
                      <Botao pequeno variante="fantasma" onClick={() => concluirSegunda(escolherSubgrupo('normal', 'normal', 'Sangue de Darion'))}>
                        Escolher: Sangue de Darion
                      </Botao>
                    </>
                  ) : (
                    <>
                      <Botao pequeno variante="fantasma" onClick={() => concluirSegunda(escolherSubgrupo('luzionne-ou-esquecido', 'luzionne', ''))}>
                        Escolher: Luzionne
                      </Botao>
                      <Botao pequeno variante="fantasma" onClick={() => concluirSegunda(escolherSubgrupo('luzionne-ou-esquecido', 'esquecido', ''))}>
                        Escolher: Esquecido
                      </Botao>
                    </>
                  )}
                </div>
              </div>
            )}
            {primeira && segunda && (
              <p className="nota" role="status">
                {descreverSorteio(primeira, segunda)}
              </p>
            )}
          </div>
        </fieldset>

        <fieldset className="grupo">
          <legend>
            Atributos <RefRegra id="criacao-atributos" />
          </legend>
          <p className="nota">
            Distribua {PONTOS_CRIACAO} pontos; máximo +{TETO_CRIACAO} por atributo. Usados: <strong>{soma}</strong> de {PONTOS_CRIACAO}.
            {origem === 'esquecido' && ' Esquecidos mantêm YAN 0.'}
          </p>
          <div className="distribuir">
            {ATRIBUTOS.map((a: ChaveAtributo) => {
              const travado = a === 'yan' && origem === 'esquecido';
              const valor = base[a];
              return (
                <div key={a} className="distribuir__item">
                  <span className="atributo__sigla">{SIGLA_ATRIBUTO[a]}</span>
                  <BotaoIcone icone="menos" rotulo={`Diminuir ${SIGLA_ATRIBUTO[a]}`} tamanho={14} disabled={travado || valor <= (manual ? -5 : 0)} onClick={() => setAtributos({ ...base, [a]: valor - 1 })} />
                  <output className="distribuir__valor" aria-label={`${SIGLA_ATRIBUTO[a]}: ${valor}`}>
                    {valor > 0 ? `+${valor}` : valor}
                  </output>
                  <BotaoIcone
                    icone="mais"
                    rotulo={`Aumentar ${SIGLA_ATRIBUTO[a]}`}
                    tamanho={14}
                    disabled={travado || (!manual && (valor >= TETO_CRIACAO || soma >= PONTOS_CRIACAO)) || valor >= 10}
                    onClick={() => setAtributos({ ...base, [a]: valor + 1 })}
                  />
                </div>
              );
            })}
          </div>
          {erros.length > 0 && (
            <p className={manual ? 'nota' : 'campo__erro'} role="status">
              {manual ? 'Fora da regra de criação (permitido na criação manual): ' : ''}
              {erros.join(' ')}
            </p>
          )}
          <p className="nota">
            Com estes valores: PV {pvMaximoCalculado(origem, base.fis, nivel)}, VIG {vigMaximaCalculada(base.fis)}. <RefRegra id="pv-vig" />
          </p>
        </fieldset>

        {precisaRy && (
          <fieldset className="grupo">
            <legend>
              Reserva de Yant <RefRegra id="ry" />
            </legend>
            <div className="linha-botoes linha-botoes--centro">
              <Botao pequeno icone="dado" onClick={() => setRy(sortearRy(origem, fonte))}>
                Sortear ({origem === 'normal' ? '8 + 1d6' : 'dobro de 8 + 1d6'})
              </Botao>
              <label className="campo-linha">
                <span>ou definir:</span>
                <CampoNumero className="entrada entrada--mini" rotulo="Reserva de Yant definida manualmente" valor={ry?.valor ?? 0} min={0} max={999} aoMudar={(n) => setRy({ valor: Math.round(n), detalhe: 'Valor definido manualmente pelo mestre.' })} />
              </label>
            </div>
            <p className="nota" role="status">
              {ry ? `Reserva: ${ry.valor}. ${ry.detalhe} A reserva é fixa e não aumenta com o nível.` : 'A reserva é inata e fixa: sorteie ou defina antes de criar.'}
            </p>
          </fieldset>
        )}

        <div className="grade-campos">
          <Campo rotulo="Estilo marcial principal" dica="Sem bônus mecânico.">
            <select className="entrada" value={estilo} onChange={(e) => setEstilo(e.target.value as Ficha['estiloMarcial'])}>
              {ESTILOS.map((c) => (
                <option key={c} value={c}>
                  {NOME_ESTILO[c]}
                </option>
              ))}
            </select>
          </Campo>
          {manual && (
            <Campo rotulo="Nível">
              <CampoNumero valor={nivel} min={1} max={20} aoMudar={(n) => setNivel(Math.round(n))} />
            </Campo>
          )}
        </div>
        <label className="alternar">
          <input type="checkbox" checked={comEquipamento} onChange={(e) => setComEquipamento(e.target.checked)} />
          <span>
            Incluir o equipamento inicial (150 Cr, arma básica, armadura leve, rações, água, lanterna, primeiros socorros) <RefRegra id="equipamento-inicial" />
          </span>
        </label>
      </div>
    </Dialogo>
  );
}
