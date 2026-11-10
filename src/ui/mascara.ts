/**
 * Gera a versão do mapa destinada aos jogadores: a mesma imagem com as células
 * sob névoa apagadas. Assim o arquivo original nunca precisa sair do mestre.
 */
import type { Cena } from '../dominio/esquema';
import { lerChave } from '../dominio/mapa';

const LADO_MAXIMO = 4096;

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error('imagem ilegível'));
    img.src = url;
  });
}

export async function gerarMapaJogadores(url: string, cena: Cena): Promise<Blob | null> {
  try {
    const img = await carregarImagem(url);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
    const tela = document.createElement('canvas');
    tela.width = Math.max(1, Math.round(img.naturalWidth * escala));
    tela.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = tela.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, tela.width, tela.height);
    // A imagem é exibida esticada sobre largura × altura da cena.
    const sx = tela.width / cena.largura;
    const sy = tela.height / cena.altura;
    const t = cena.grade.tamanhoCelula;
    ctx.fillStyle = '#15181c';
    for (const chave of cena.nevoa) {
      const [cx, cy] = lerChave(chave);
      const x = Math.floor((cena.grade.origemX + cx * t) * sx);
      const y = Math.floor((cena.grade.origemY + cy * t) * sy);
      ctx.fillRect(x, y, Math.ceil(t * sx) + 1, Math.ceil(t * sy) + 1);
    }
    return await new Promise((ok) => tela.toBlob((b) => ok(b), 'image/jpeg', 0.86));
  } catch {
    return null;
  }
}
