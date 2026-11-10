import type { Desenho } from '../../dominio/esquema';
import type { NomeIcone } from '../icones';

export type Ferramenta = 'selecionar' | 'mao' | 'area' | 'token' | 'medir' | 'desenho' | 'nevoa';

export interface OpcoesFerramenta {
  desenho: {
    forma: 'linha' | 'retangulo' | 'elipse' | 'livre' | 'apagar';
    cor: Desenho['cor'];
    espessura: number;
    visivelJogadores: boolean;
  };
  nevoa: { operacao: 'ocultar' | 'revelar' };
}

export const OPCOES_PADRAO: OpcoesFerramenta = {
  desenho: { forma: 'linha', cor: 'latao', espessura: 4, visivelJogadores: true },
  nevoa: { operacao: 'ocultar' },
};

export interface CamadasVisiveis {
  mapa: boolean;
  tokens: boolean;
  desenhos: boolean;
  nevoa: boolean;
}

export const CAMADAS_PADRAO: CamadasVisiveis = { mapa: true, tokens: true, desenhos: true, nevoa: true };

export interface DefinicaoFerramenta {
  id: Ferramenta;
  rotulo: string;
  icone: NomeIcone;
  atalho: string;
  /** Disponível apenas ao mestre. */
  mestre: boolean;
}

export const FERRAMENTAS: DefinicaoFerramenta[] = [
  { id: 'selecionar', rotulo: 'Selecionar e mover', icone: 'cursor', atalho: 'V', mestre: false },
  { id: 'mao', rotulo: 'Mover o mapa', icone: 'mao', atalho: 'H', mestre: false },
  { id: 'area', rotulo: 'Selecionar em área', icone: 'area', atalho: 'A', mestre: false },
  { id: 'medir', rotulo: 'Medir distância', icone: 'medir', atalho: 'M', mestre: false },
  { id: 'token', rotulo: 'Novo token', icone: 'marcador', atalho: 'T', mestre: true },
  { id: 'desenho', rotulo: 'Desenhar', icone: 'pincel', atalho: 'D', mestre: true },
  { id: 'nevoa', rotulo: 'Névoa', icone: 'nevoa', atalho: 'N', mestre: true },
];
