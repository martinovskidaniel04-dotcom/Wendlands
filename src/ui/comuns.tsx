/**
 * Componentes básicos da interface: botões, diálogo, campos, barras de recurso,
 * retrato, avisos e referência de regra.
 */
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { ChaveRecurso, Id } from '../dominio/esquema';
import { NOME_RECURSO } from '../dominio/regras/ficha';
import { referencia } from '../dominio/regras/referencias';
import { ConfirmarContexto, useArquivoUrl, useEstadoLoja, useLoja, type PedidoConfirmacao } from './contexto';
import { Icone, type NomeIcone } from './icones';

type Variante = 'padrao' | 'primario' | 'fantasma' | 'perigo';

interface PropsBotao extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  icone?: NomeIcone;
  pequeno?: boolean;
}

export function Botao({ variante = 'padrao', icone, pequeno, className, children, type = 'button', ...resto }: PropsBotao) {
  const classes = ['btn', `btn--${variante}`, pequeno ? 'btn--pequeno' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} {...resto}>
      {icone && <Icone nome={icone} tamanho={pequeno ? 15 : 17} />}
      {children}
    </button>
  );
}

interface PropsBotaoIcone extends ButtonHTMLAttributes<HTMLButtonElement> {
  icone: NomeIcone;
  /** Nome acessível e dica de ferramenta. */
  rotulo: string;
  ativo?: boolean;
  tamanho?: number;
}

export function BotaoIcone({ icone, rotulo, ativo, tamanho = 18, className, type = 'button', ...resto }: PropsBotaoIcone) {
  return (
    <button
      type={type}
      className={['btn-icone', ativo ? 'btn-icone--ativo' : '', className ?? ''].filter(Boolean).join(' ')}
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={ativo === undefined ? undefined : ativo}
      {...resto}
    >
      <Icone nome={icone} tamanho={tamanho} />
    </button>
  );
}

export function Dialogo({
  titulo,
  aoFechar,
  children,
  rodape,
  largura = 'media',
}: {
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: 'pequena' | 'media' | 'grande';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialogo dialogo--${largura}`}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) aoFechar();
      }}
    >
      <div className="dialogo__caixa">
        <header className="dialogo__topo">
          <h2 id={idTitulo}>{titulo}</h2>
          <BotaoIcone icone="fechar" rotulo="Fechar" onClick={aoFechar} />
        </header>
        <div className="dialogo__corpo">{children}</div>
        {rodape && <footer className="dialogo__rodape">{rodape}</footer>}
      </div>
    </dialog>
  );
}

/** Provedor do diálogo de confirmação baseado em promessa. */
export function ProvedorConfirmacao({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<(PedidoConfirmacao & { resolver: (ok: boolean) => void }) | null>(null);
  const confirmar = useRef((p: PedidoConfirmacao) => new Promise<boolean>((resolver) => setPedido({ ...p, resolver }))).current;
  const responder = (ok: boolean) => {
    pedido?.resolver(ok);
    setPedido(null);
  };
  return (
    <ConfirmarContexto.Provider value={confirmar}>
      {children}
      {pedido && (
        <Dialogo
          titulo={pedido.titulo}
          aoFechar={() => responder(false)}
          largura="pequena"
          rodape={
            <>
              <Botao variante="fantasma" onClick={() => responder(false)}>
                Cancelar
              </Botao>
              <Botao variante={pedido.perigo ? 'perigo' : 'primario'} onClick={() => responder(true)} autoFocus>
                {pedido.confirmar}
              </Botao>
            </>
          }
        >
          <div className="texto-dialogo">{pedido.texto}</div>
        </Dialogo>
      )}
    </ConfirmarContexto.Provider>
  );
}

export function Campo({ rotulo, dica, erro, children, largo }: { rotulo: string; dica?: ReactNode; erro?: string | null; children: ReactNode; largo?: boolean }) {
  return (
    <label className={`campo${largo ? ' campo--largo' : ''}`}>
      <span className="campo__rotulo">{rotulo}</span>
      {children}
      {dica && !erro && <span className="campo__dica">{dica}</span>}
      {erro && (
        <span className="campo__erro" role="alert">
          {erro}
        </span>
      )}
    </label>
  );
}

/** Campo numérico que só confirma valores válidos ao sair ou ao pressionar Enter. */
export function CampoNumero({
  valor,
  aoMudar,
  min,
  max,
  passo = 1,
  rotulo,
  desabilitado,
  className,
}: {
  valor: number;
  aoMudar: (n: number) => void;
  min?: number;
  max?: number;
  passo?: number;
  rotulo?: string;
  desabilitado?: boolean;
  className?: string;
}) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  const confirmar = () => {
    const n = Number(texto.replace(',', '.'));
    if (texto.trim() === '' || !Number.isFinite(n)) {
      setTexto(String(valor));
      return;
    }
    const limitado = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    setTexto(String(limitado));
    if (limitado !== valor) aoMudar(limitado);
  };
  return (
    <input
      className={className ?? 'entrada entrada--numero'}
      type="number"
      inputMode="decimal"
      value={texto}
      min={min}
      max={max}
      step={passo}
      aria-label={rotulo}
      disabled={desabilitado}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

const ICONE_RECURSO: Record<ChaveRecurso, NomeIcone> = { pv: 'coracao', vig: 'raio', ry: 'cristal' };

/** Barra de recurso: sempre com nome, número e máximo — a cor nunca é a única distinção. */
export function BarraRecurso({ recurso, atual, max, children }: { recurso: ChaveRecurso; atual: number; max: number; children?: ReactNode }) {
  const fracao = max > 0 ? Math.min(1, Math.max(0, atual / max)) : 0;
  return (
    <div className={`recurso recurso--${recurso}`}>
      <Icone nome={ICONE_RECURSO[recurso]} tamanho={20} className="recurso__icone" />
      <div className="recurso__meio">
        <div className="recurso__linha">
          <span className="recurso__nome">{NOME_RECURSO[recurso]}</span>
          <span className="recurso__valor">
            {atual} / {max}
          </span>
        </div>
        <div
          className="recurso__trilho"
          role="progressbar"
          aria-label={`${NOME_RECURSO[recurso]}: ${atual} de ${max}`}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={atual}
        >
          <div className="recurso__nivel" style={{ width: `${fracao * 100}%` }} />
        </div>
      </div>
      {children}
    </div>
  );
}

/** Retrato da ficha/token; silhueta neutra quando não há imagem. */
export function Retrato({ arquivoId, nome, tamanho = 64 }: { arquivoId: Id | null; nome: string; tamanho?: number }) {
  const url = useArquivoUrl(arquivoId);
  return (
    <span className="retrato" style={{ width: tamanho, height: tamanho }}>
      {url ? (
        <img src={url} alt={`Retrato de ${nome}`} />
      ) : (
        <svg viewBox="0 0 64 64" role="img" aria-label="Sem retrato: silhueta neutra">
          <circle cx="32" cy="24" r="12" fill="currentColor" />
          <path d="M9 64c1.500-15 10-22 23-22s21.500 7 23 22H9Z" fill="currentColor" />
        </svg>
      )}
    </span>
  );
}

export function Etiqueta({ tom = 'neutro', children, titulo }: { tom?: 'neutro' | 'latao' | 'verde' | 'vinho' | 'azul' | 'alerta'; children: ReactNode; titulo?: string }) {
  return (
    <span className={`etiqueta etiqueta--${tom}`} title={titulo}>
      {children}
    </span>
  );
}

/** Botão discreto que abre a referência da regra que sustenta uma automação. */
export function RefRegra({ id, rotulo }: { id: string; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const r = referencia(id);
  if (!r) return null;
  return (
    <>
      <button type="button" className="ref-regra" onClick={() => setAberto(true)} aria-label={`Referência da regra: ${r.titulo}`} title={`Regra: ${r.titulo}`}>
        <Icone nome="info" tamanho={14} />
        {rotulo && <span>{rotulo}</span>}
      </button>
      {aberto && (
        <Dialogo titulo={r.titulo} aoFechar={() => setAberto(false)} largura="pequena">
          <div className="regra">
            <p>{r.texto}</p>
            {r.observacao && (
              <p className="regra__obs">
                <strong>Observação: </strong>
                {r.observacao}
              </p>
            )}
            <dl className="regra__fonte">
              <dt>Situação</dt>
              <dd>{r.status === 'aprovado' ? 'Regra aprovada' : r.status === 'pendente' ? 'Pendente' : 'Convenção do aplicativo (não é regra de Wendlands)'}</dd>
              <dt>Fonte</dt>
              <dd>{r.fonte}</dd>
              <dt>Seção</dt>
              <dd>{r.secao}</dd>
            </dl>
          </div>
        </Dialogo>
      )}
    </>
  );
}

export function Avisos() {
  const loja = useLoja();
  const { avisos } = useEstadoLoja();
  return (
    <div className="avisos" aria-live="polite" aria-relevant="additions">
      {avisos.map((a) => (
        <div key={a.id} className={`aviso aviso--${a.tipo}`} role={a.tipo === 'erro' ? 'alert' : 'status'}>
          <Icone nome={a.tipo === 'erro' ? 'alerta' : a.tipo === 'sucesso' ? 'conferir' : 'info'} tamanho={17} />
          <span className="aviso__texto">{a.texto}</span>
          {a.acao && (
            <button
              type="button"
              className="aviso__acao"
              onClick={() => {
                a.acao!.executar();
                loja.dispensarAviso(a.id);
              }}
            >
              {a.acao.rotulo}
            </button>
          )}
          <BotaoIcone icone="fechar" rotulo="Dispensar aviso" tamanho={15} onClick={() => loja.dispensarAviso(a.id)} />
        </div>
      ))}
    </div>
  );
}

/** Seção de painel com título e, opcionalmente, recolhível. */
export function Secao({
  titulo,
  acoes,
  children,
  recolhivel,
  inicialAberta = true,
}: {
  titulo: string;
  acoes?: ReactNode;
  children: ReactNode;
  recolhivel?: boolean;
  inicialAberta?: boolean;
}) {
  const [aberta, setAberta] = useState(inicialAberta);
  const id = useId();
  return (
    <section className="secao">
      <header className="secao__topo">
        {recolhivel ? (
          <button type="button" className="secao__titulo secao__titulo--botao" aria-expanded={aberta} aria-controls={id} onClick={() => setAberta((v) => !v)}>
            <span>{titulo}</span>
            <Icone nome={aberta ? 'setaBaixo' : 'setaDireita'} tamanho={15} />
          </button>
        ) : (
          <h3 className="secao__titulo">{titulo}</h3>
        )}
        {acoes && <div className="secao__acoes">{acoes}</div>}
      </header>
      <div id={id} hidden={recolhivel && !aberta}>
        {children}
      </div>
    </section>
  );
}

export function EstadoVazio({ icone, titulo, children }: { icone: NomeIcone; titulo: string; children?: ReactNode }) {
  return (
    <div className="vazio">
      <Icone nome={icone} tamanho={30} />
      <p className="vazio__titulo">{titulo}</p>
      {children && <div className="vazio__texto">{children}</div>}
    </div>
  );
}

/** Abre o seletor de arquivos do sistema e devolve o arquivo escolhido. */
export function escolherArquivo(aceitar: string): Promise<File | null> {
  return new Promise((resolver) => {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = aceitar;
    entrada.style.display = 'none';
    entrada.onchange = () => {
      resolver(entrada.files?.[0] ?? null);
      entrada.remove();
    };
    entrada.oncancel = () => {
      resolver(null);
      entrada.remove();
    };
    document.body.appendChild(entrada);
    entrada.click();
  });
}

export const ACEITAR_IMAGENS = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

export function horaCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function dataCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + horaCurta(iso);
}
