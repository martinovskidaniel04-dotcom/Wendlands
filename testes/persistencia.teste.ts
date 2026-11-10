import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { campanhaDemo, campanhaVazia, novaFicha } from '../src/dominio/fabrica';
import { VERSAO_ESQUEMA } from '../src/dominio/esquema';
import {
  comoCopia, exportarFicha, exportarSomenteDados, lerFicha, lerPacote, lerPacoteCompendio, lerSomenteDados, montarPacote, validarCampanha,
} from '../src/dominio/pacote';
import { Armazenamento } from '../src/persistencia/armazenamento';
import { exec } from './apoio';

let seq = 0;
const banco = () => Armazenamento.abrir(`teste-${++seq}`);
const bytes = (texto: string) => strToU8(texto);

/** Campanha de demonstração com um mapa importado e um retrato. */
function comImagens() {
  let c = campanhaDemo('Mesa com imagens');
  c = exec(c, { tipo: 'arquivo.registrar', meta: { id: 'arq_mapa', nome: 'beco.png', tipo: 'image/png', tamanho: 9, uso: 'mapa' } });
  c = exec(c, { tipo: 'arquivo.registrar', meta: { id: 'arq_retrato', nome: 'rosto.jpg', tipo: 'image/jpeg', tamanho: 7, uso: 'retrato' } });
  c = exec(c, { tipo: 'cena.mapa', cenaId: c.cenas[1].id, mapa: { tipo: 'arquivo', arquivoId: 'arq_mapa' }, largura: 800, altura: 600 });
  c = exec(c, { tipo: 'ficha.atualizar', fichaId: c.fichas[0].id, alteracoes: { retratoArquivoId: 'arq_retrato' } });
  c = exec(c, { tipo: 'token.mover', cenaId: c.cenas[0].id, movimentos: [{ tokenId: c.cenas[0].tokens[0].id, x: 333, y: 444 }] });
  c = exec(c, { tipo: 'token.atualizar', cenaId: c.cenas[0].id, tokenId: c.cenas[0].tokens[2].id, alteracoes: { oculto: true } });
  const arquivos = new Map([['arq_mapa', bytes('MAPA-PNG!')], ['arq_retrato', bytes('RETRATO')]]);
  return { c, arquivos };
}

describe('armazenamento local', () => {
  it('critério A: campanha, ficha, mapa e token voltam iguais depois de recarregar', async () => {
    const { c, arquivos } = comImagens();
    const nome = `teste-${++seq}`;
    let bd = await Armazenamento.abrir(nome);
    await bd.salvarCampanha(c);
    for (const meta of c.arquivos) await bd.salvarArquivo(c.id, meta, arquivos.get(meta.id)!.slice().buffer);
    bd.fechar();
    // "Recarregar": nova conexão com o mesmo banco.
    bd = await Armazenamento.abrir(nome);
    const lista = await bd.listarCampanhas();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: c.id, nome: 'Mesa com imagens', cenas: 3, fichas: 3 });
    const r = await bd.carregarCampanha(c.id);
    if (!r.ok) throw new Error(r.erro);
    expect(r.campanha).toEqual(c);
    const mapa = await bd.lerArquivo(c.id, 'arq_mapa');
    expect(new TextDecoder().decode(mapa!.dados)).toBe('MAPA-PNG!');
    expect(mapa!.tipo).toBe('image/png');
    bd.fechar();
  });

  it('excluir é reversível; apagar definitivamente remove os arquivos da campanha', async () => {
    const { c, arquivos } = comImagens();
    const bd = await banco();
    await bd.gravarCampanhaComArquivos(c, c.arquivos.map((meta) => ({ meta, dados: arquivos.get(meta.id)!.slice().buffer })), false);
    await bd.marcarExcluida(c.id, '2026-11-01T00:00:00.000Z');
    expect(await bd.listarCampanhas()).toHaveLength(0);
    expect(await bd.listarCampanhas(true)).toHaveLength(1);
    await bd.marcarExcluida(c.id, null);
    expect(await bd.listarCampanhas()).toHaveLength(1);
    await bd.marcarExcluida(c.id, '2026-11-01T00:00:00.000Z');
    expect(await bd.limparExcluidas(new Date('2026-11-03T00:00:00.000Z'))).toBe(0);
    expect(await bd.limparExcluidas(new Date('2026-11-10T00:00:00.000Z'))).toBe(1);
    expect(await bd.idsDeArquivos(c.id)).toEqual([]);
    expect(await bd.listarCampanhas(true)).toHaveLength(0);
  });

  it('importação não sobrescreve em silêncio uma campanha existente', async () => {
    const { c } = comImagens();
    const bd = await banco();
    await bd.salvarCampanha(c);
    const outra = { ...c, nome: 'Versão importada' };
    await expect(bd.gravarCampanhaComArquivos(outra, [], false)).rejects.toThrow(/Nada foi alterado/);
    const r = await bd.carregarCampanha(c.id);
    expect(r.ok && r.campanha.nome).toBe('Mesa com imagens');
    await bd.gravarCampanhaComArquivos(outra, [], true);
    const s = await bd.carregarCampanha(c.id);
    expect(s.ok && s.campanha.nome).toBe('Versão importada');
  });

  it('arquivos são separados por campanha', async () => {
    const bd = await banco();
    const meta = { id: 'arq_1', nome: 'a.png', tipo: 'image/png', tamanho: 1, uso: 'mapa' as const };
    await bd.salvarArquivo('camp_a', meta, bytes('A').slice().buffer);
    await bd.salvarArquivo('camp_b', meta, bytes('B').slice().buffer);
    expect(new TextDecoder().decode((await bd.lerArquivo('camp_a', 'arq_1'))!.dados)).toBe('A');
    expect(new TextDecoder().decode((await bd.lerArquivo('camp_b', 'arq_1'))!.dados)).toBe('B');
    await bd.copiarArquivos('camp_a', 'camp_c');
    expect(await bd.idsDeArquivos('camp_c')).toEqual(['arq_1']);
  });
});

describe('pacotes de exportação e importação', () => {
  it('critério G: backup completo recupera fichas, mapas, imagens, posições e visibilidades', () => {
    const { c, arquivos } = comImagens();
    const pacote = montarPacote(c, arquivos, '2026-11-10T12:00:00.000Z');
    expect(pacote.manifesto.completo).toBe(true);
    expect(pacote.ausentes).toHaveLength(0);
    const lido = lerPacote(pacote.bytes);
    if (!lido.ok) throw new Error(lido.erro);
    expect(lido.campanha).toEqual(c);
    expect(lido.campanha.cenas[0].tokens[0]).toMatchObject({ x: 333, y: 444 });
    expect(lido.campanha.cenas[0].tokens[2].oculto).toBe(true);
    expect(lido.campanha.cenas[0].nevoa).toEqual(c.cenas[0].nevoa);
    expect(lido.arquivos.map((a) => [a.meta.id, new TextDecoder().decode(a.dados)]).sort()).toEqual([['arq_mapa', 'MAPA-PNG!'], ['arq_retrato', 'RETRATO']]);
    expect(lido.avisos).toEqual([]);
  });

  it('pacote sem todas as imagens é marcado como incompleto e avisa na importação', () => {
    const { c, arquivos } = comImagens();
    arquivos.delete('arq_mapa');
    const pacote = montarPacote(c, arquivos, '2026-11-10T12:00:00.000Z');
    expect(pacote.manifesto.completo).toBe(false);
    expect(pacote.ausentes.map((a) => a.id)).toEqual(['arq_mapa']);
    const lido = lerPacote(pacote.bytes);
    if (!lido.ok) throw new Error(lido.erro);
    expect(lido.avisos.join(' ')).toMatch(/incompleto/);
    expect(lido.campanha.cenas[1].mapa).toEqual({ tipo: 'vazio' });
    expect(lido.campanha.arquivos.map((a) => a.id)).toEqual(['arq_retrato']);
  });

  it('JSON sem imagens declara que não é backup completo', () => {
    const { c } = comImagens();
    const dados = exportarSomenteDados(c, '2026-11-10T12:00:00.000Z');
    expect(dados.aviso).toMatch(/NÃO contém mapas nem retratos/);
    const lido = lerSomenteDados(JSON.parse(JSON.stringify(dados)));
    if (!lido.ok) throw new Error(lido.erro);
    expect(lido.avisos[0]).toMatch(/somente de dados/);
    expect(lido.campanha.arquivos).toEqual([]);
    expect(lido.campanha.fichas[0].retratoArquivoId).toBeNull();
    expect(lido.campanha.fichas).toHaveLength(3);
  });

  it('rejeita arquivos que não são pacotes, manifestos inválidos e versões mais novas', () => {
    expect(lerPacote(bytes('isto não é um zip')).ok).toBe(false);
    expect(lerPacote(zipSync({ 'outro.txt': bytes('x') })).ok).toBe(false);
    const c = campanhaVazia('Futura');
    const manifesto = { formato: 'wendlands-campanha', versaoPacote: 1, versaoEsquema: 99, aplicativo: '9', exportadoEm: 'x', campanha: { id: c.id, nome: c.nome }, completo: true, arquivos: [] };
    const futuro = lerPacote(zipSync({ 'manifesto.json': bytes(JSON.stringify(manifesto)), 'campanha.json': bytes(JSON.stringify({ ...c, versaoEsquema: 99 })) }));
    expect(futuro.ok).toBe(false);
    expect(!futuro.ok && futuro.erro).toMatch(/versão mais nova/);
    expect(validarCampanha({ ...c, versaoEsquema: undefined }).ok).toBe(false);
    expect(validarCampanha({ ...c, fichas: [{ id: 'x' }] }).ok).toBe(false);
    expect(validarCampanha({ ...c, cenas: 'nada' }).ok).toBe(false);
    expect(validarCampanha(null).ok).toBe(false);
    expect(validarCampanha(c)).toMatchObject({ ok: true });
    expect(c.versaoEsquema).toBe(VERSAO_ESQUEMA);
  });

  it('conserta referências soltas e avisa', () => {
    const c = campanhaDemo('Solta');
    const quebrada = JSON.parse(JSON.stringify(c));
    quebrada.cenas[0].tokens[0].fichaId = 'ficha_que_nao_existe';
    quebrada.cenaAtivaId = 'cena_que_nao_existe';
    const v = validarCampanha(quebrada);
    if (!v.ok) throw new Error(v.erro);
    expect(v.campanha.cenas[0].tokens[0].fichaId).toBeNull();
    expect(v.campanha.cenaAtivaId).toBe(c.cenas[0].id);
    expect(v.avisos.join(' ')).toMatch(/2 referência/);
  });

  it('importar como cópia nunca reutiliza o identificador nem o nome de uma campanha existente', () => {
    const c = campanhaDemo('Mesa');
    const copia = comoCopia(c, 'camp_nova', '2026-11-10T12:00:00.000Z', ['Mesa', 'Mesa (2)']);
    expect(copia.id).toBe('camp_nova');
    expect(copia.nome).toBe('Mesa (3)');
    expect(c.id).not.toBe('camp_nova');
  });

  it('ficha: exporta sem notas do mestre e importa com identificadores novos', () => {
    const f = novaFicha({ nome: 'Viajante', origem: 'normal', atributosBase: { fis: 2, des: 2, men: 2, yan: 2 }, ryBase: 12, notasMestre: 'segredo', donoJogadorId: 'jog_1' });
    const exportada = JSON.parse(JSON.stringify(exportarFicha(f)));
    expect(JSON.stringify(exportada)).not.toContain('segredo');
    let n = 0;
    const lida = lerFicha(exportada, () => `n${++n}`);
    if (!lida.ok) throw new Error(lida.erro);
    expect(lida.ficha.id).not.toBe(f.id);
    expect(lida.ficha).toMatchObject({ nome: 'Viajante', ryBase: 12, donoJogadorId: null });
    expect(lerFicha({ formato: 'wendlands-ficha', versao: 1, ficha: { nome: 'x' } }, () => 'a').ok).toBe(false);
    expect(lerFicha({ formato: 'outra-coisa' }, () => 'a').ok).toBe(false);
  });

  it('pacote de compêndio entra sempre como "somente mestre"', () => {
    const entrada = { id: 'e1', titulo: 'Segredo', categoria: 'personagem', resumo: '', corpo: ['x'], fonte: 'Autor', secao: 'Dossiê', versao: '', status: 'canone', visibilidade: 'jogadores', aliases: [], aparencia: '', conflitos: [] };
    const lido = lerPacoteCompendio({ formato: 'wendlands-compendio', versao: 1, entradas: [entrada] });
    if (!lido.ok) throw new Error(lido.erro);
    expect(lido.entradas[0].visibilidade).toBe('mestre');
    expect(lerPacoteCompendio({ formato: 'wendlands-compendio', versao: 1, entradas: [] }).ok).toBe(false);
  });
});
