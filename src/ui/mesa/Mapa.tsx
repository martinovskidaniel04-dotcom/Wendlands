/**
 * Mapa tático: SVG em coordenadas de mundo com câmera (pan/zoom), tokens,
 * grade, desenhos, névoa manual e medição. Funciona com mouse, teclado e toque.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as EventoPonteiro } from 'react';
import { tokenPertenceA } from '../../dominio/comandos';
import type { Cena, Desenho, Ficha, Id, Token } from '../../dominio/esquema';
import { novoId } from '../../dominio/fabrica';
import {
  ajustarATela,
  celulaDe,
  celulasNoRetangulo,
  distanciaMetros,
  encaixarNaGrade,
  faixasDeNevoa,
  formatarMetros,
  limitarAoMapa,
  retangulo,
  telaParaMundo,
  tokenSobNevoa,
  zoomEmTorno,
  type Camera,
  type Ponto,
} from '../../dominio/mapa';
import { derivar } from '../../dominio/regras/ficha';
import { BotaoIcone } from '../comuns';
import { useArquivoUrl, useAtual, useVisao } from '../contexto';
import { urlMapaDemo } from './mapasDemo';
import type { CamadasVisiveis, Ferramenta, OpcoesFerramenta } from './tipos';

const COR_TOKEN: Record<Token['cor'], string> = {
  neutro: '#8f897c',
  latao: '#b8995f',
  vinho: '#b3606e',
  azul: '#7c9fbc',
  verde: '#6f9b99',
};
const COR_DESENHO: Record<Desenho['cor'], string> = {
  marfim: '#E7DDCA',
  latao: '#c9ab72',
  verde: '#8fd0cf',
  vinho: '#d47f8c',
  azul: '#8fb4d6',
};

type Gesto =
  | { tipo: 'pan'; inicio: Ponto; camera: Camera; moveu: boolean; limpar: boolean }
  | { tipo: 'arrastar'; ids: Id[]; inicio: Ponto; moveu: boolean }
  | { tipo: 'area'; inicio: Ponto }
  | { tipo: 'medir'; inicio: Ponto; moveu: boolean }
  | { tipo: 'desenho'; pontos: Ponto[] }
  | { tipo: 'nevoa'; inicio: Ponto }
  | { tipo: 'pinca'; distancia: number; zoom: number };

interface Props {
  cena: Cena;
  ferramenta: Ferramenta;
  opcoes: OpcoesFerramenta;
  camadas: CamadasVisiveis;
  selecao: Id[];
  aoSelecionar(ids: Id[]): void;
  aoMudarFerramenta(f: Ferramenta): void;
  /** Modo "tocar para mover": o próximo toque no mapa define o destino dos tokens selecionados. */
  aguardandoDestino: boolean;
  aoConcluirDestino(): void;
  aoPedirExclusao(ids: Id[]): void;
}

export function Mapa({ cena, ferramenta, opcoes, camadas, selecao, aoSelecionar, aoMudarFerramenta, aguardandoDestino, aoConcluirDestino, aoPedirExclusao }: Props) {
  const { campanha, ator, ehMestre, previa, despachar } = useVisao();
  const refCaixa = useRef<HTMLDivElement>(null);
  const refSvg = useRef<SVGSVGElement>(null);
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [arrasto, setArrasto] = useState<{ ids: Id[]; dx: number; dy: number } | null>(null);
  const [caixaTemp, setCaixaTemp] = useState<{ a: Ponto; b: Ponto; uso: 'area' | 'nevoa' | 'forma' } | null>(null);
  const [tracoTemp, setTracoTemp] = useState<Ponto[] | null>(null);
  const [medicao, setMedicao] = useState<{ a: Ponto; b: Ponto } | null>(null);
  const [inicioMedicao, setInicioMedicao] = useState<Ponto | null>(null);
  const gesto = useRef<Gesto | null>(null);
  const ponteiros = useRef(new Map<number, Ponto>());
  const cameraAtual = useAtual(camera);
  const cenaAtual = useAtual(cena);
  const grade = cena.grade;
  const nevoa = useMemo(() => new Set(cena.nevoa), [cena.nevoa]);

  // ── Tamanho da área e enquadramento inicial ──
  useEffect(() => {
    const caixa = refCaixa.current;
    if (!caixa) return;
    const medir = () => setTamanho({ largura: caixa.clientWidth, altura: caixa.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(caixa);
    return () => observador.disconnect();
  }, []);

  const enquadrar = useCallback(() => {
    const caixa = refCaixa.current;
    if (!caixa || caixa.clientWidth === 0) return;
    setCamera(ajustarATela(cenaAtual.current.largura, cenaAtual.current.altura, caixa.clientWidth, caixa.clientHeight, 16));
  }, [cenaAtual]);

  const enquadrada = useRef<string | null>(null);
  useEffect(() => {
    if (tamanho.largura === 0) return;
    const chave = `${cena.id}:${cena.largura}x${cena.altura}`;
    if (enquadrada.current !== chave) {
      enquadrada.current = chave;
      const inteiro = ajustarATela(cena.largura, cena.altura, tamanho.largura, tamanho.altura, 16);
      // Em telas estreitas o mapa inteiro deixaria os tokens pequenos demais para o toque:
      // começa mais perto, centrado, e o botão "ajustar à tela" mostra tudo.
      const zoom = tamanho.largura < 620 ? Math.max(inteiro.zoom, 0.4) : inteiro.zoom;
      setCamera({ zoom, x: cena.largura / 2 - tamanho.largura / (2 * zoom), y: cena.altura / 2 - tamanho.altura / (2 * zoom) });
      setMedicao(null);
      setInicioMedicao(null);
    }
  }, [cena.id, cena.largura, cena.altura, tamanho.largura, tamanho.altura]);

  const pontoTela = (e: { clientX: number; clientY: number }): Ponto => {
    const r = refSvg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pontoMundo = (e: { clientX: number; clientY: number }): Ponto => telaParaMundo(pontoTela(e), cameraAtual.current);

  const aplicarZoom = useCallback(
    (fator: number, ancora?: Ponto) => {
      setCamera((c) => zoomEmTorno(c, ancora ?? { x: tamanho.largura / 2, y: tamanho.altura / 2 }, c.zoom * fator));
    },
    [tamanho.largura, tamanho.altura],
  );

  // Roda do mouse: zoom em torno do cursor (precisa de ouvinte não passivo).
  useEffect(() => {
    const svg = refSvg.current;
    if (!svg) return;
    const aoRolar = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const ancora = { x: e.clientX - r.left, y: e.clientY - r.top };
      const fator = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setCamera((c) => zoomEmTorno(c, ancora, c.zoom * fator));
    };
    svg.addEventListener('wheel', aoRolar, { passive: false });
    return () => svg.removeEventListener('wheel', aoRolar);
  }, []);

  // ── Permissões ──
  const podeMover = useCallback(
    (t: Token) => !previa && (ehMestre || (ator.jogadorId !== null && tokenPertenceA(campanha, t, ator.jogadorId))),
    [previa, ehMestre, ator.jogadorId, campanha],
  );

  const moverTokens = useCallback(
    (ids: Id[], dx: number, dy: number, encaixar: boolean) => {
      const c = cenaAtual.current;
      const movimentos = c.tokens
        .filter((t) => ids.includes(t.id) && podeMover(t))
        .map((t) => {
          let p = { x: t.x + dx, y: t.y + dy };
          if (encaixar && c.grade.encaixar) p = encaixarNaGrade(p, c.grade, t.tamanho);
          p = limitarAoMapa(p, c);
          return { tokenId: t.id, x: p.x, y: p.y };
        })
        .filter((m) => {
          const t = c.tokens.find((x) => x.id === m.tokenId)!;
          return t.x !== m.x || t.y !== m.y;
        });
      if (movimentos.length > 0) despachar({ tipo: 'token.mover', cenaId: c.id, movimentos });
    },
    [cenaAtual, podeMover, despachar],
  );

  // ── Ponteiro ──
  const aoPressionar = (e: EventoPonteiro<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button === 2) return;
    const svg = refSvg.current!;
    svg.setPointerCapture(e.pointerId);
    ponteiros.current.set(e.pointerId, pontoTela(e));

    // Dois dedos: pinça para zoom.
    if (ponteiros.current.size === 2) {
      const [p1, p2] = [...ponteiros.current.values()];
      gesto.current = { tipo: 'pinca', distancia: Math.hypot(p2.x - p1.x, p2.y - p1.y), zoom: cameraAtual.current.zoom };
      setArrasto(null);
      setCaixaTemp(null);
      setTracoTemp(null);
      return;
    }
    if (ponteiros.current.size > 2) return;

    const tela = pontoTela(e);
    const mundo = pontoMundo(e);
    const alvo = (e.target as Element).closest('[data-token]');
    const tokenId = alvo?.getAttribute('data-token') ?? null;
    const meio = e.pointerType === 'mouse' && e.button === 1;

    if (meio || ferramenta === 'mao') {
      gesto.current = { tipo: 'pan', inicio: tela, camera: cameraAtual.current, moveu: false, limpar: false };
      return;
    }

    if (aguardandoDestino) {
      const origem = cena.tokens.find((t) => selecao.includes(t.id));
      if (origem) moverTokens(selecao, mundo.x - origem.x, mundo.y - origem.y, true);
      aoConcluirDestino();
      gesto.current = null;
      return;
    }

    switch (ferramenta) {
      case 'selecionar': {
        if (tokenId) {
          const multiplo = e.shiftKey || e.ctrlKey || e.metaKey;
          let ids = selecao;
          if (multiplo) ids = selecao.includes(tokenId) ? selecao.filter((x) => x !== tokenId) : [...selecao, tokenId];
          else if (!selecao.includes(tokenId)) ids = [tokenId];
          aoSelecionar(ids);
          const moveis = cena.tokens.filter((t) => ids.includes(t.id) && podeMover(t)).map((t) => t.id);
          gesto.current = moveis.includes(tokenId) ? { tipo: 'arrastar', ids: moveis, inicio: mundo, moveu: false } : null;
        } else {
          gesto.current = { tipo: 'pan', inicio: tela, camera: cameraAtual.current, moveu: false, limpar: true };
        }
        return;
      }
      case 'area':
        gesto.current = { tipo: 'area', inicio: mundo };
        setCaixaTemp({ a: mundo, b: mundo, uso: 'area' });
        return;
      case 'medir':
        gesto.current = { tipo: 'medir', inicio: mundo, moveu: false };
        return;
      case 'token': {
        if (!ehMestre) return;
        const p = limitarAoMapa(grade.encaixar ? encaixarNaGrade(mundo, grade, 1) : mundo, cena);
        const id = novoId('tok');
        const r = despachar({
          tipo: 'token.criar',
          cenaId: cena.id,
          token: { id, nome: `Token ${cena.tokens.length + 1}`, x: p.x, y: p.y, tamanho: 1, fichaId: null, retratoArquivoId: null, donoJogadorId: null, oculto: false, cor: 'neutro' },
        });
        if (r.ok) {
          aoSelecionar([id]);
          aoMudarFerramenta('selecionar');
        }
        return;
      }
      case 'desenho': {
        if (!ehMestre) return;
        if (opcoes.desenho.forma === 'apagar') {
          const id = (e.target as Element).closest('[data-desenho]')?.getAttribute('data-desenho');
          if (id) despachar({ tipo: 'desenho.excluir', cenaId: cena.id, desenhoIds: [id] });
          return;
        }
        gesto.current = { tipo: 'desenho', pontos: [mundo] };
        if (opcoes.desenho.forma === 'livre') setTracoTemp([mundo]);
        else setCaixaTemp({ a: mundo, b: mundo, uso: 'forma' });
        return;
      }
      case 'nevoa':
        if (!ehMestre) return;
        gesto.current = { tipo: 'nevoa', inicio: mundo };
        setCaixaTemp({ a: mundo, b: mundo, uso: 'nevoa' });
        return;
    }
  };

  const aoMover = (e: EventoPonteiro<SVGSVGElement>) => {
    if (!ponteiros.current.has(e.pointerId)) return;
    const tela = pontoTela(e);
    ponteiros.current.set(e.pointerId, tela);
    const g = gesto.current;
    if (!g) return;

    if (g.tipo === 'pinca') {
      if (ponteiros.current.size < 2) return;
      const [p1, p2] = [...ponteiros.current.values()];
      const distancia = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const centro = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      setCamera((c) => zoomEmTorno(c, centro, g.zoom * (distancia / Math.max(1, g.distancia))));
      return;
    }
    const mundo = telaParaMundo(tela, cameraAtual.current);
    switch (g.tipo) {
      case 'pan': {
        const dx = tela.x - g.inicio.x;
        const dy = tela.y - g.inicio.y;
        if (!g.moveu && Math.hypot(dx, dy) < 4) return;
        g.moveu = true;
        setCamera({ zoom: g.camera.zoom, x: g.camera.x - dx / g.camera.zoom, y: g.camera.y - dy / g.camera.zoom });
        return;
      }
      case 'arrastar': {
        const dx = mundo.x - g.inicio.x;
        const dy = mundo.y - g.inicio.y;
        if (!g.moveu && Math.hypot(dx, dy) * cameraAtual.current.zoom < 4) return;
        g.moveu = true;
        setArrasto({ ids: g.ids, dx, dy });
        return;
      }
      case 'area':
        setCaixaTemp({ a: g.inicio, b: mundo, uso: 'area' });
        return;
      case 'nevoa':
        setCaixaTemp({ a: g.inicio, b: mundo, uso: 'nevoa' });
        return;
      case 'medir':
        g.moveu = true;
        setInicioMedicao(null);
        setMedicao({ a: g.inicio, b: mundo });
        return;
      case 'desenho':
        if (opcoes.desenho.forma === 'livre') {
          const ultimo = g.pontos[g.pontos.length - 1];
          if (Math.hypot(mundo.x - ultimo.x, mundo.y - ultimo.y) * cameraAtual.current.zoom > 3 && g.pontos.length < 1400) {
            g.pontos.push(mundo);
            setTracoTemp([...g.pontos]);
          }
        } else setCaixaTemp({ a: g.pontos[0], b: mundo, uso: 'forma' });
        return;
    }
  };

  const aoSoltar = (e: EventoPonteiro<SVGSVGElement>) => {
    if (!ponteiros.current.has(e.pointerId)) return;
    ponteiros.current.delete(e.pointerId);
    const g = gesto.current;
    if (!g) return;
    if (g.tipo === 'pinca') {
      if (ponteiros.current.size < 2) gesto.current = null;
      return;
    }
    gesto.current = null;
    const mundo = pontoMundo(e);
    switch (g.tipo) {
      case 'pan':
        if (!g.moveu && g.limpar && selecao.length > 0) aoSelecionar([]);
        return;
      case 'arrastar':
        setArrasto(null);
        if (g.moveu) moverTokens(g.ids, mundo.x - g.inicio.x, mundo.y - g.inicio.y, !e.altKey);
        return;
      case 'area': {
        setCaixaTemp(null);
        const r = retangulo(g.inicio, mundo);
        const dentro = cena.tokens.filter((t) => t.x >= r.x && t.x <= r.x + r.largura && t.y >= r.y && t.y <= r.y + r.altura).map((t) => t.id);
        aoSelecionar(e.shiftKey ? [...new Set([...selecao, ...dentro])] : dentro);
        return;
      }
      case 'nevoa': {
        setCaixaTemp(null);
        const celulas = celulasNoRetangulo(g.inicio, mundo, cena);
        if (celulas.length > 0) despachar({ tipo: 'nevoa.alterar', cenaId: cena.id, operacao: opcoes.nevoa.operacao, celulas });
        return;
      }
      case 'medir':
        // Sem arrastar: medição em dois toques (início, depois fim).
        if (!g.moveu) {
          if (inicioMedicao) {
            setMedicao({ a: inicioMedicao, b: mundo });
            setInicioMedicao(null);
          } else {
            setMedicao(null);
            setInicioMedicao(mundo);
          }
        }
        return;
      case 'desenho': {
        setCaixaTemp(null);
        setTracoTemp(null);
        const forma = opcoes.desenho.forma;
        if (forma === 'apagar') return;
        const pontos = forma === 'livre' ? g.pontos : [g.pontos[0], mundo];
        const extensao = Math.hypot(pontos[pontos.length - 1].x - pontos[0].x, pontos[pontos.length - 1].y - pontos[0].y);
        if (pontos.length < 2 || (forma !== 'livre' && extensao * cameraAtual.current.zoom < 4)) return;
        despachar({
          tipo: 'desenho.criar',
          cenaId: cena.id,
          desenho: {
            id: novoId('des'),
            tipo: forma,
            pontos: pontos.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10] as [number, number]),
            cor: opcoes.desenho.cor,
            espessura: opcoes.desenho.espessura,
            visivelJogadores: opcoes.desenho.visivelJogadores,
          },
        });
        return;
      }
    }
  };

  const aoCancelar = (e: EventoPonteiro<SVGSVGElement>) => {
    ponteiros.current.delete(e.pointerId);
    gesto.current = null;
    setArrasto(null);
    setCaixaTemp(null);
    setTracoTemp(null);
  };

  // ── Teclado ──
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    const alvo = e.target as Element;
    if (alvo.closest('input, textarea, select, button')) return;
    const tokenId = alvo.closest('[data-token]')?.getAttribute('data-token') ?? null;
    const setas: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key in setas) {
      e.preventDefault();
      const [sx, sy] = setas[e.key];
      const ids = tokenId ? (selecao.includes(tokenId) ? selecao : [tokenId]) : selecao;
      if (ids.length > 0 && cena.tokens.some((t) => ids.includes(t.id) && podeMover(t))) {
        const passo = grade.tamanhoCelula * (e.shiftKey ? 5 : 1);
        moverTokens(ids, sx * passo, sy * passo, !e.altKey);
      } else {
        const passo = 80 / camera.zoom;
        setCamera((c) => ({ ...c, x: c.x + sx * passo, y: c.y + sy * passo }));
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && tokenId) {
      e.preventDefault();
      if (e.shiftKey) aoSelecionar(selecao.includes(tokenId) ? selecao.filter((x) => x !== tokenId) : [...selecao, tokenId]);
      else aoSelecionar([tokenId]);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selecao.length > 0 && ehMestre) {
      e.preventDefault();
      aoPedirExclusao(selecao);
      return;
    }
    if (e.key === 'Escape') {
      setMedicao(null);
      setInicioMedicao(null);
      if (aguardandoDestino) aoConcluirDestino();
      else if (selecao.length > 0) aoSelecionar([]);
      return;
    }
    if (e.key === '+' || e.key === '=') aplicarZoom(1.25);
    else if (e.key === '-' || e.key === '_') aplicarZoom(0.8);
    else if (e.key === '0') enquadrar();
  };

  // ── Elementos derivados ──
  const caminhoGrade = useMemo(() => {
    if (!grade.visivel) return '';
    const t = grade.tamanhoCelula;
    let d = '';
    const x0 = ((grade.origemX % t) + t) % t;
    const y0 = ((grade.origemY % t) + t) % t;
    for (let x = x0; x <= cena.largura + 0.01; x += t) d += `M${x} 0V${cena.altura}`;
    for (let y = y0; y <= cena.altura + 0.01; y += t) d += `M0 ${y}H${cena.largura}`;
    return d;
  }, [grade.visivel, grade.tamanhoCelula, grade.origemX, grade.origemY, cena.largura, cena.altura]);

  const faixas = useMemo(() => faixasDeNevoa(cena.nevoa), [cena.nevoa]);
  const fichas = useMemo(() => new Map(campanha.fichas.map((f) => [f.id, f])), [campanha.fichas]);
  const visaoDeMestre = ehMestre && !previa;

  const transformacao = `translate(${-camera.x * camera.zoom} ${-camera.y * camera.zoom}) scale(${camera.zoom})`;
  const tracoFino = 1 / camera.zoom;
  const cursor =
    ferramenta === 'mao' ? 'grab' : ferramenta === 'selecionar' ? 'default' : aguardandoDestino || ferramenta === 'token' ? 'copy' : 'crosshair';

  const distanciaArrasto = (() => {
    if (!arrasto) return null;
    const t = cena.tokens.find((x) => x.id === arrasto.ids[0]);
    if (!t) return null;
    let destino = { x: t.x + arrasto.dx, y: t.y + arrasto.dy };
    if (grade.encaixar) destino = encaixarNaGrade(destino, grade, t.tamanho);
    return { de: { x: t.x, y: t.y }, para: destino, metros: distanciaMetros({ x: t.x, y: t.y }, destino, grade) };
  })();

  const dica =
    aguardandoDestino
      ? 'Toque no mapa para escolher o destino. Esc cancela.'
      : ferramenta === 'medir'
        ? inicioMedicao
          ? 'Medição: escolha o ponto final.'
          : 'Medir: arraste, ou toque no início e depois no fim.'
        : ferramenta === 'nevoa'
          ? `Névoa: arraste um retângulo para ${opcoes.nevoa.operacao === 'ocultar' ? 'ocultar' : 'revelar'} a região.`
          : ferramenta === 'token'
            ? 'Novo token: toque no mapa para posicionar.'
            : ferramenta === 'desenho'
              ? opcoes.desenho.forma === 'apagar'
                ? 'Apagar: toque em um desenho.'
                : 'Desenho: arraste no mapa.'
              : ferramenta === 'area'
                ? 'Seleção em área: arraste um retângulo.'
                : '';

  return (
    <div
      className="mapa"
      ref={refCaixa}
      onKeyDown={aoTeclar}
      tabIndex={0}
      role="application"
      aria-label={`Mapa tático da cena ${cena.nome}. Use Tab para percorrer os tokens, setas para mover o token em foco ou a vista, mais e menos para zoom.`}
    >
      <svg
        ref={refSvg}
        className="mapa__svg"
        style={{ cursor }}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoCancelar}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="hachura-nevoa" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform={`rotate(45) scale(${1 / camera.zoom})`}>
            <rect width="10" height="10" fill="#0b0d10" fillOpacity=".62" />
            <rect width="2.500" height="10" fill="#b7c0ca" fillOpacity=".3" />
          </pattern>
          <pattern id="textura-nevoa" width="160" height="160" patternUnits="userSpaceOnUse">
            <rect width="160" height="160" fill="#1b1e23" />
            <circle cx="40" cy="50" r="60" fill="#22262c" fillOpacity=".7" />
            <circle cx="130" cy="120" r="50" fill="#171a1e" fillOpacity=".8" />
            <circle cx="120" cy="20" r="34" fill="#20242a" fillOpacity=".6" />
          </pattern>
        </defs>
        <g transform={transformacao}>
          <rect x={0} y={0} width={cena.largura} height={cena.altura} fill="#1c1f23" />
          {camadas.mapa && <FundoDoMapa cena={cena} />}
          {caminhoGrade && <path d={caminhoGrade} fill="none" stroke="#E7DDCA" strokeOpacity={0.13} strokeWidth={tracoFino} pointerEvents="none" />}
          {camadas.desenhos &&
            cena.desenhos.map((d) => (
              <FormaDesenho key={d.id} desenho={d} apagavel={ferramenta === 'desenho' && opcoes.desenho.forma === 'apagar'} mestre={visaoDeMestre} zoom={camera.zoom} />
            ))}
          {camadas.tokens &&
            cena.tokens.map((t) => {
              const emArrasto = arrasto?.ids.includes(t.id) ?? false;
              return (
                <TokenVisual
                  key={t.id}
                  token={t}
                  ficha={t.fichaId ? fichas.get(t.fichaId) ?? null : null}
                  raio={(t.tamanho * grade.tamanhoCelula) / 2}
                  selecionado={selecao.includes(t.id)}
                  deslocamento={emArrasto ? arrasto : null}
                  encoberto={visaoDeMestre && tokenSobNevoa(t, cena, nevoa)}
                  mestre={visaoDeMestre}
                  zoom={camera.zoom}
                  celula={celulaDe(t, grade)}
                />
              );
            })}
          {camadas.nevoa && faixas.length > 0 && (
            <g pointerEvents="none" shapeRendering="crispEdges">
              {faixas.map((f) => (
                <rect
                  key={`${f.cx},${f.cy}`}
                  x={grade.origemX + f.cx * grade.tamanhoCelula}
                  y={grade.origemY + f.cy * grade.tamanhoCelula}
                  width={f.largura * grade.tamanhoCelula}
                  height={grade.tamanhoCelula}
                  fill={visaoDeMestre ? 'url(#hachura-nevoa)' : 'url(#textura-nevoa)'}
                />
              ))}
            </g>
          )}
          {distanciaArrasto && <LinhaMedida a={distanciaArrasto.de} b={distanciaArrasto.para} texto={formatarMetros(distanciaArrasto.metros)} zoom={camera.zoom} />}
          {medicao && <LinhaMedida a={medicao.a} b={medicao.b} texto={formatarMetros(distanciaMetros(medicao.a, medicao.b, grade))} zoom={camera.zoom} />}
          {inicioMedicao && <circle cx={inicioMedicao.x} cy={inicioMedicao.y} r={5 / camera.zoom} fill="#8fd0cf" pointerEvents="none" />}
          {caixaTemp && <CaixaTemporaria caixa={caixaTemp} opcoes={opcoes} zoom={camera.zoom} />}
          {tracoTemp && (
            <polyline
              points={tracoTemp.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={COR_DESENHO[opcoes.desenho.cor]}
              strokeWidth={opcoes.desenho.espessura}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      <div className="mapa__titulo">
        <span className="mapa__nome">{cena.nome}</span>
        {cena.demo && <span className="mapa__demo">Mapa de demonstração · geometria não canônica</span>}
      </div>
      {dica && (
        <div className="mapa__dica" role="status">
          {dica}
        </div>
      )}
      <div className="mapa__zoom" role="group" aria-label="Zoom do mapa">
        <BotaoIcone icone="menos" rotulo="Diminuir zoom" onClick={() => aplicarZoom(0.8)} />
        <output className="mapa__zoom-valor" aria-label="Zoom atual">
          {Math.round(camera.zoom * 100)}%
        </output>
        <BotaoIcone icone="mais" rotulo="Aumentar zoom" onClick={() => aplicarZoom(1.25)} />
        <BotaoIcone icone="ajustar" rotulo="Ajustar o mapa à tela" onClick={enquadrar} />
      </div>
    </div>
  );
}

const FundoDoMapa = memo(function FundoDoMapa({ cena }: { cena: Cena }) {
  const arquivoId = cena.mapa.tipo === 'arquivo' ? cena.mapa.arquivoId : null;
  const urlArquivo = useArquivoUrl(arquivoId);
  const url = cena.mapa.tipo === 'demo' ? urlMapaDemo(cena.mapa.demoId) : urlArquivo;
  if (cena.mapa.tipo === 'vazio') {
    return (
      <text x={cena.largura / 2} y={cena.altura / 2} textAnchor="middle" fill="#8b8578" fontSize={Math.max(18, cena.largura / 50)} pointerEvents="none">
        Sem imagem de mapa
      </text>
    );
  }
  if (!url) {
    return (
      <text x={cena.largura / 2} y={cena.altura / 2} textAnchor="middle" fill="#8b8578" fontSize={Math.max(18, cena.largura / 50)} pointerEvents="none">
        Carregando o mapa…
      </text>
    );
  }
  return <image href={url} x={0} y={0} width={cena.largura} height={cena.altura} preserveAspectRatio="none" pointerEvents="none" />;
});

function FormaDesenho({ desenho: d, apagavel, mestre, zoom }: { desenho: Desenho; apagavel: boolean; mestre: boolean; zoom: number }) {
  const comuns = {
    'data-desenho': d.id,
    fill: 'none',
    stroke: COR_DESENHO[d.cor],
    strokeWidth: d.espessura,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeDasharray: mestre && !d.visivelJogadores ? `${8 / zoom} ${6 / zoom}` : undefined,
    opacity: mestre && !d.visivelJogadores ? 0.75 : 0.95,
    pointerEvents: apagavel ? ('stroke' as const) : ('none' as const),
    style: apagavel ? { cursor: 'pointer' } : undefined,
  };
  const [a, b] = [d.pontos[0], d.pontos[d.pontos.length - 1]];
  if (d.tipo === 'retangulo') {
    return <rect {...comuns} x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} />;
  }
  if (d.tipo === 'elipse') {
    return <ellipse {...comuns} cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} rx={Math.abs(b[0] - a[0]) / 2} ry={Math.abs(b[1] - a[1]) / 2} />;
  }
  return <polyline {...comuns} points={d.pontos.map((p) => `${p[0]},${p[1]}`).join(' ')} />;
}

function CaixaTemporaria({ caixa, opcoes, zoom }: { caixa: { a: Ponto; b: Ponto; uso: 'area' | 'nevoa' | 'forma' }; opcoes: OpcoesFerramenta; zoom: number }) {
  const r = retangulo(caixa.a, caixa.b);
  if (caixa.uso === 'forma') {
    const cor = COR_DESENHO[opcoes.desenho.cor];
    const base = { fill: 'none', stroke: cor, strokeWidth: opcoes.desenho.espessura, pointerEvents: 'none' as const, strokeLinecap: 'round' as const };
    if (opcoes.desenho.forma === 'retangulo') return <rect {...base} x={r.x} y={r.y} width={r.largura} height={r.altura} />;
    if (opcoes.desenho.forma === 'elipse') return <ellipse {...base} cx={r.x + r.largura / 2} cy={r.y + r.altura / 2} rx={r.largura / 2} ry={r.altura / 2} />;
    return <line {...base} x1={caixa.a.x} y1={caixa.a.y} x2={caixa.b.x} y2={caixa.b.y} />;
  }
  const cor = caixa.uso === 'area' ? '#8fd0cf' : opcoes.nevoa.operacao === 'ocultar' ? '#c9ab72' : '#E7DDCA';
  return (
    <rect
      x={r.x}
      y={r.y}
      width={r.largura}
      height={r.altura}
      fill={cor}
      fillOpacity={0.12}
      stroke={cor}
      strokeWidth={1.5 / zoom}
      strokeDasharray={`${6 / zoom} ${4 / zoom}`}
      pointerEvents="none"
    />
  );
}

function LinhaMedida({ a, b, texto, zoom }: { a: Ponto; b: Ponto; texto: string; zoom: number }) {
  const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const fonte = 14 / zoom;
  const largura = (texto.length * 8.5 + 16) / zoom;
  const altura = 24 / zoom;
  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0d1114" strokeWidth={5 / zoom} strokeLinecap="round" opacity={0.55} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#9fe0de" strokeWidth={2.2 / zoom} strokeLinecap="round" />
      <circle cx={a.x} cy={a.y} r={4.5 / zoom} fill="#9fe0de" stroke="#0d1114" strokeWidth={1 / zoom} />
      <circle cx={b.x} cy={b.y} r={4.5 / zoom} fill="#9fe0de" stroke="#0d1114" strokeWidth={1 / zoom} />
      <rect x={meio.x - largura / 2} y={meio.y - altura - 8 / zoom} width={largura} height={altura} rx={4 / zoom} fill="#12161a" fillOpacity={0.92} stroke="#668E8D" strokeWidth={1 / zoom} />
      <text x={meio.x} y={meio.y - altura / 2 - 8 / zoom} textAnchor="middle" dominantBaseline="central" fill="#d8f3f2" fontSize={fonte} fontWeight={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {texto}
      </text>
    </g>
  );
}

interface PropsToken {
  token: Token;
  ficha: Ficha | null;
  raio: number;
  selecionado: boolean;
  deslocamento: { dx: number; dy: number } | null;
  encoberto: boolean;
  mestre: boolean;
  zoom: number;
  celula: [number, number];
}

const TokenVisual = memo(function TokenVisual({ token: t, ficha, raio, selecionado, deslocamento, encoberto, mestre, zoom, celula }: PropsToken) {
  const url = useArquivoUrl(t.retratoArquivoId ?? ficha?.retratoArquivoId ?? null);
  const x = t.x + (deslocamento?.dx ?? 0);
  const y = t.y + (deslocamento?.dy ?? 0);
  const cor = COR_TOKEN[t.cor];
  const borda = Math.max(2.5, raio * 0.1);
  const interno = raio - borda * 1.6;
  const escondido = t.oculto || encoberto;
  const mostrarNome = raio * 2 * zoom >= 22;
  let descricao = `Token ${t.nome}, coluna ${celula[0] + 1}, linha ${celula[1] + 1}`;
  if (ficha && !ficha.visaoParcial) {
    const d = derivar(ficha);
    descricao += `, PV ${ficha.pvAtual} de ${d.pvMax.total}`;
  }
  if (mestre && t.oculto) descricao += ', oculto para jogadores';
  else if (mestre && encoberto) descricao += ', sob névoa';
  if (selecionado) descricao += ', selecionado';
  const idRecorte = `recorte-${t.id}`;
  return (
    <g
      className={`token${selecionado ? ' token--selecionado' : ''}`}
      data-token={t.id}
      transform={`translate(${x} ${y})`}
      tabIndex={0}
      role="button"
      aria-label={descricao}
      aria-pressed={selecionado}
      opacity={mestre && escondido ? 0.62 : deslocamento ? 0.85 : 1}
    >
      {/* Área de toque mínima, para tokens pequenos na tela. */}
      <circle r={Math.max(raio, 20 / zoom)} fill="transparent" pointerEvents="all" />
      {selecionado && (
        <>
          <circle r={raio + 5 / zoom + borda * 0.4} fill="none" stroke="#9fe0de" strokeOpacity={0.35} strokeWidth={6 / zoom} />
          <circle r={raio + 2 / zoom} fill="none" stroke="#9fe0de" strokeWidth={2.4 / zoom} />
        </>
      )}
      <circle r={raio} fill="#101215" fillOpacity={0.5} transform={`translate(${raio * 0.06} ${raio * 0.1})`} />
      <circle r={raio - borda / 2} fill="#191c20" stroke={cor} strokeWidth={borda} />
      <circle r={interno} fill="#262a30" stroke="#0e1012" strokeWidth={Math.max(1, borda * 0.3)} />
      {url ? (
        <>
          <clipPath id={idRecorte}>
            <circle r={interno} />
          </clipPath>
          <image href={url} x={-interno} y={-interno} width={interno * 2} height={interno * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${idRecorte})`} />
        </>
      ) : (
        <g fill="#0f1114" transform={`scale(${interno / 32})`}>
          <circle cx={0} cy={-9} r={10} />
          <path d="M-19 25c1.500-13 8.500-19 19-19s17.500 6 19 19Z" />
        </g>
      )}
      {mestre && escondido && (
        <g transform={`translate(${raio * 0.72} ${-raio * 0.72})`}>
          <circle r={Math.max(7 / zoom, raio * 0.26)} fill="#15181c" stroke="#c9ab72" strokeWidth={1.2 / zoom} />
          <path
            d="M-4 0c1.300-2 2.600-3 4-3s2.700 1 4 3c-1.300 2-2.600 3-4 3s-2.700-1-4-3ZM-4.500 4l9-8"
            fill="none"
            stroke="#c9ab72"
            strokeWidth={1}
            strokeLinecap="round"
            transform={`scale(${Math.max(7 / zoom, raio * 0.26) / 7})`}
          />
        </g>
      )}
      {mostrarNome && (
        <text
          y={raio + 14 / zoom}
          textAnchor="middle"
          fontSize={12 / zoom}
          fontWeight={600}
          fill="#E7DDCA"
          stroke="#0d0f12"
          strokeWidth={3.2 / zoom}
          paintOrder="stroke"
          pointerEvents="none"
        >
          {t.nome}
        </text>
      )}
    </g>
  );
});
