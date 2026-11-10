/**
 * Conjunto de ícones vetoriais (traço fino, 24×24). Sempre decorativos: o nome
 * acessível vem do controle que os usa.
 */
import type { ReactNode } from 'react';

const DESENHOS = {
  cursor: <path d="M6 3.5v15l4.2-3.6 2.6 5.6 2.2-1-2.6-5.5H18L6 3.5Z" />,
  mao: <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-.5V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6a1.5 1.5 0 0 1 3 0v8.5c0 3.6-2.4 6-6 6-2.6 0-4.2-1.200-5.400-3.200L4 14.200c-.6-1 .6-2.200 1.700-1.400L8 14.500" />,
  area: <path d="M4 4h3M10.500 4h3M17 4h3v3M20 10.500v3M20 17v3h-3M13.500 20h-3M7 20H4v-3M4 13.500v-3M4 7V4" />,
  marcador: (
    <>
      <path d="M12 21s6.500-5.800 6.500-11a6.500 6.500 0 0 0-13 0c0 5.200 6.500 11 6.500 11Z" />
      <circle cx="12" cy="10" r="2.300" />
    </>
  ),
  medir: (
    <>
      <circle cx="5.500" cy="18.500" r="2" />
      <circle cx="18.500" cy="5.500" r="2" />
      <path d="m7 17 10-10" />
    </>
  ),
  pincel: <path d="M4 20c2.500 0 4-1 4-3.200 0-1 .8-1.800 1.800-1.800s1.800.8 1.800 1.800M11 14.500 19.500 5a1.600 1.600 0 0 1 2.300 2.300L13 16" />,
  nevoa: <path d="M7 17.500h10a3.800 3.800 0 0 0 .6-7.550A5.500 5.500 0 0 0 7 8.800 4.400 4.400 0 0 0 7 17.500ZM5 20.500h9M17 20.500h2" />,
  dado: (
    <>
      <path d="m12 3 8 4.500v9L12 21l-8-4.500v-9L12 3Z" />
      <path d="m4 7.500 8 4.500 8-4.500M12 12v9" />
    </>
  ),
  camadas: <path d="m12 4 9 4.500-9 4.500-9-4.500L12 4Zm-9 8.500 9 4.500 9-4.500M3 16.500 12 21l9-4.500" />,
  historico: (
    <>
      <path d="M5 5h14v10.500H10L6 19v-3.500H5V5Z" />
      <path d="M8.500 9h7M8.500 12h4.500" />
    </>
  ),
  livro: <path d="M12 6.500C10.500 5.200 8.200 4.800 4 5v13c4.200-.2 6.500.2 8 1.500m0-13c1.500-1.300 3.800-1.700 8-1.500v13c-4.200-.2-6.500.2-8 1.500m0-13v13" />,
  engrenagem: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.500M12 18.500V21M3 12h2.500M18.500 12H21M5.600 5.600l1.800 1.800M16.600 16.600l1.800 1.800M5.600 18.400l1.800-1.800M16.600 7.400l1.800-1.800" />
    </>
  ),
  olho: (
    <>
      <path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12Z" />
      <circle cx="12" cy="12" r="2.800" />
    </>
  ),
  olhoFechado: <path d="M4 4l16 16M9.900 5.800A8.500 8.500 0 0 1 12 5.500c6 0 9.500 6.500 9.500 6.500a17 17 0 0 1-3.300 4M14.800 14.900A4 4 0 0 1 9.100 9.200M6.300 7.700A16.500 16.500 0 0 0 2.500 12s3.500 6.500 9.500 6.500c1.200 0 2.300-.2 3.300-.6" />,
  mapa: <path d="m3.500 6.500 5.500-2 6 2 5.500-2v13l-5.500 2-6-2-5.500 2v-13ZM9 4.500v13M15 6.500v13" />,
  pessoa: (
    <>
      <circle cx="12" cy="8.500" r="3.500" />
      <path d="M5 20c.6-3.700 3.300-5.500 7-5.500s6.400 1.800 7 5.500" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  fechar: <path d="m6 6 12 12M18 6 6 18" />,
  setaBaixo: <path d="m6 9.500 6 6 6-6" />,
  setaCima: <path d="m6 14.500 6-6 6 6" />,
  setaDireita: <path d="m9.500 6 6 6-6 6" />,
  setaEsquerda: <path d="m14.500 6-6 6 6 6" />,
  editar: <path d="m4 20 1-4.500L16.500 4a2.100 2.100 0 0 1 3 3L8 18.500 4 20Zm10.500-14 3 3" />,
  coroa: <path d="M4 18h16M4.500 15.500 3 7.500l5 3.500 4-6 4 6 5-3.500-1.500 8h-15Z" />,
  coracao: <path d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.300a4.300 4.300 0 0 1 7.500 2.500C19.500 15.400 12 20 12 20Z" />,
  raio: <path d="M13.500 3 5.500 13.500h5.500L10 21l8.500-11H13l.5-7Z" />,
  cristal: <path d="m12 3 5 6.500-5 11.500-5-11.500L12 3Zm-5 6.500h10M12 3v18" />,
  ficha: (
    <>
      <path d="M6.500 3.500h8l3.500 3.500v13.500h-11.500v-17Z" />
      <path d="M14.500 3.500V7H18M9.500 11h5.500M9.500 14h5.500M9.500 17h3" />
    </>
  ),
  mochila: <path d="M8 8V6.500a4 4 0 0 1 8 0V8m-9.500 0h11a1.500 1.500 0 0 1 1.500 1.500v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9A1.500 1.500 0 0 1 6.500 8ZM9 13.500h6v3H9v-3Z" />,
  lixeira: <path d="M5 7h14M9.500 7V4.500h5V7M7 7l.8 12.500h8.400L17 7M10 10.500v5.500M14 10.500v5.500" />,
  duplicar: (
    <>
      <path d="M8.500 8.500h11v11h-11v-11Z" />
      <path d="M5 15.500h-.5v-11h11V5" />
    </>
  ),
  exportar: <path d="M12 15.500V4m0 0L7.500 8.500M12 4l4.500 4.500M5 14.500v5h14v-5" />,
  importar: <path d="M12 4v11.500m0 0-4.500-4.500m4.500 4.500 4.500-4.500M5 14.500v5h14v-5" />,
  desfazer: <path d="M8 6 4 10l4 4M4 10h10a5 5 0 0 1 0 10h-3" />,
  refazer: <path d="m16 6 4 4-4 4M20 10H10a5 5 0 0 0 0 10h3" />,
  ajustar: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  busca: (
    <>
      <circle cx="10.500" cy="10.500" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.500" />
      <path d="M12 11v5.500M12 7.500v.5" />
    </>
  ),
  alerta: <path d="M12 4 2.500 20h19L12 4Zm0 6v5M12 17.500v.5" />,
  conferir: <path d="m5 12.500 4.500 4.500L19 7" />,
  espada: <path d="M19.500 4.500 9 15m10.500-10.500h-4m4 0v4M6.500 12.500l5 5M5 19l3.500-3.500M4.500 16.500l3 3" />,
  luta: (
    <>
      <circle cx="8" cy="6" r="2" />
      <circle cx="16.500" cy="8" r="2" />
      <path d="M8 9.500v5l-2.500 5M8 14.500l3.500 5M8 10.500l5 2 3.500-1.500M16.500 11.500v4l2 4M16.500 15.500l-2.500 4" />
    </>
  ),
  rede: (
    <>
      <circle cx="12" cy="12" r="8.500" />
      <path d="M3.500 12h17M12 3.500c2.500 2.600 3.500 5.400 3.500 8.500s-1 5.900-3.500 8.500c-2.500-2.600-3.500-5.400-3.500-8.500s1-5.900 3.500-8.500Z" />
    </>
  ),
  cadeado: <path d="M7.500 10.500V8a4.500 4.500 0 0 1 9 0v2.500m-10.500 0h12v9H6v-9Z" />,
  pasta: <path d="M3.500 6.500h6l2 2.500h9v10h-17v-12.500Z" />,
  imagem: (
    <>
      <path d="M4 5h16v14H4V5Z" />
      <path d="m4 16 4.500-4.500 4 4 2.500-2.500L20 18" />
      <circle cx="15" cy="9" r="1.500" />
    </>
  ),
  alvo: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  copiar: (
    <>
      <path d="M9 9h10.500v11.500H9V9Z" />
      <path d="M15 9V4.500H4.500V15H9" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.500" />
      <path d="M12 7v5.500l3.500 2" />
    </>
  ),
  d4: (
    <>
      <path d="M12 3.500 21 19.500H3L12 3.500Z" />
      <path d="M12 3.500v10.500M3 19.500 12 14l9 5.500" />
    </>
  ),
  d6: (
    <>
      <path d="m12 3 8 4.500v9L12 21l-8-4.500v-9L12 3Z" />
      <path d="m4 7.500 8 4.500 8-4.500M12 12v9" />
    </>
  ),
  d8: (
    <>
      <path d="m12 2.500 8.500 9.500-8.500 9.500L3.500 12 12 2.500Z" />
      <path d="M3.500 12h17M12 2.500 8.500 12 12 21.500 15.500 12 12 2.500Z" />
    </>
  ),
  d10: (
    <>
      <path d="m12 2.500 9 7.500-9 11.500L3 10l9-7.500Z" />
      <path d="m3 10 6 2.500 3-10 3 10 6-2.500M9 12.500l3 9 3-9H9Z" />
    </>
  ),
  d12: (
    <>
      <path d="m12 2.500 6 2 3.500 5.500-1 6.500-5 4.500h-7l-5-4.500-1-6.500L6 4.500l6-2Z" />
      <path d="m12 7.500 4.500 3.300-1.700 5.200H9.200l-1.700-5.200L12 7.500ZM12 2.500v5M21.500 10l-5 .800M15.500 21l-.7-5M8.500 21l.7-5M2.500 10l5 .800" />
    </>
  ),
  d20: (
    <>
      <path d="m12 2.500 8.500 4.800v9.400L12 21.500l-8.500-4.800V7.300L12 2.500Z" />
      <path d="m12 7 5 8.500H7L12 7Zm0-4.500V7M3.500 7.300 12 7l8.500.3M7 15.500l-3.500 1.200M17 15.500l3.500 1.200M7 15.500l5 6 5-6" />
    </>
  ),
  d100: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 3 4.500 6.500L12 21 7.500 9.500 12 3ZM3.300 10l4.200-.5 9 0 4.200.5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type NomeIcone = keyof typeof DESENHOS;

export function Icone({ nome, tamanho = 18, className }: { nome: NomeIcone; tamanho?: number; className?: string }) {
  return (
    <svg
      className={className ? `icone ${className}` : 'icone'}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {DESENHOS[nome]}
    </svg>
  );
}

/** Glifo de Galleone: proposta gráfica da interface, não aparência canônica do astro. */
export function GlifoGalleone({ tamanho = 34 }: { tamanho?: number }) {
  return (
    <svg className="glifo" width={tamanho} height={tamanho} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="8.500" />
      <path d="M24 12.500a8.500 8.500 0 1 0 0 15 6.500 6.500 0 0 1 0-15Z" fill="currentColor" stroke="none" opacity=".75" />
      <path d="M20 2v6M20 32v6M2 20h6M32 20h6M7.300 7.300l3.200 3.200M29.500 29.500l3.200 3.200M7.300 32.700l3.200-3.200M29.500 10.500l3.200-3.200" opacity=".7" />
    </svg>
  );
}
