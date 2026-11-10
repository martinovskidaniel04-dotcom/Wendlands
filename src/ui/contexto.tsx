/**
 * Contextos e ganchos compartilhados pela interface.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Comando } from '../dominio/comandos';
import type { Ator, Campanha, Id } from '../dominio/esquema';
import type { EstadoLoja, Loja } from './loja';

export const LojaContexto = createContext<Loja | null>(null);

export function useLoja(): Loja {
  const loja = useContext(LojaContexto);
  if (!loja) throw new Error('Loja indisponível.');
  return loja;
}

export function useEstadoLoja(): EstadoLoja {
  const loja = useLoja();
  return useSyncExternalStore(loja.assinar, loja.obter);
}

/**
 * Visão em uso pela tela: a campanha já filtrada para quem está olhando
 * (o próprio papel ou a prévia de jogador escolhida pelo mestre).
 */
export interface Visao {
  campanha: Campanha;
  ator: Ator;
  /** true quando quem usa o aplicativo é o mestre (mesmo vendo a prévia do jogador). */
  mestreReal: boolean;
  /** Prévia do jogador ativa: tudo fica somente leitura. */
  previa: boolean;
  /** Mestre agindo como mestre: pode usar as ferramentas de mestre. */
  ehMestre: boolean;
  despachar(comando: Comando): { ok: boolean; erro: string | null };
}

export const VisaoContexto = createContext<Visao | null>(null);

export function useVisao(): Visao {
  const v = useContext(VisaoContexto);
  if (!v) throw new Error('Visão indisponível.');
  return v;
}

/** URL de exibição de uma imagem da campanha (ou null enquanto carrega / se não existir). */
export function useArquivoUrl(arquivoId: Id | null | undefined): string | null {
  const loja = useLoja();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    setUrl(null);
    if (arquivoId) {
      void loja.obterUrl(arquivoId).then((u) => {
        if (ativo) setUrl(u);
      });
    }
    return () => {
      ativo = false;
    };
  }, [arquivoId, loja]);
  return url;
}

/** Estado guardado no localStorage (preferências de interface). */
export function usePreferencia<T>(chave: string, inicial: T): [T, (valor: T | ((anterior: T) => T)) => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      const bruto = localStorage.getItem(`wendlands.${chave}`);
      return bruto === null ? inicial : (JSON.parse(bruto) as T);
    } catch {
      return inicial;
    }
  });
  const definir = useCallback(
    (novo: T | ((anterior: T) => T)) => {
      setValor((anterior) => {
        const proximo = typeof novo === 'function' ? (novo as (a: T) => T)(anterior) : novo;
        try {
          localStorage.setItem(`wendlands.${chave}`, JSON.stringify(proximo));
        } catch {
          /* preferência não persistida */
        }
        return proximo;
      });
    },
    [chave],
  );
  return [valor, definir];
}

export function useLarguraJanela(): number {
  const [largura, setLargura] = useState(() => window.innerWidth);
  useEffect(() => {
    const ajustar = () => setLargura(window.innerWidth);
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);
  return largura;
}

// ───────────── Confirmação ─────────────

export interface PedidoConfirmacao {
  titulo: string;
  texto: ReactNode;
  confirmar: string;
  perigo?: boolean;
}

export const ConfirmarContexto = createContext<(pedido: PedidoConfirmacao) => Promise<boolean>>(() => Promise.resolve(false));

export function useConfirmar() {
  return useContext(ConfirmarContexto);
}

/** Mantém a referência mais recente de um valor sem refazer efeitos. */
export function useAtual<T>(valor: T) {
  const ref = useRef(valor);
  ref.current = valor;
  return ref;
}
