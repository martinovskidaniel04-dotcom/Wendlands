/**
 * Configuração de cena: mapa, dimensões, grade com calibração explícita em
 * metros por célula, convenção de medição e nota do mestre.
 */
import { useState } from 'react';
import type { Cena, MapaDemoId } from '../../dominio/esquema';
import { MAPAS_DEMO, MODOS_MEDICAO } from '../../dominio/esquema';
import { DIMENSOES_DEMO, METROS_POR_CELULA_PADRAO, NOME_MAPA_DEMO } from '../../dominio/fabrica';
import { ACEITAR_IMAGENS, Botao, Campo, CampoNumero, Dialogo, RefRegra, escolherArquivo } from '../comuns';
import { useConfirmar, useLoja, useVisao } from '../contexto';
import { dimensoesDaImagem } from './PainelEsquerdo';

const NOME_MEDICAO: Record<(typeof MODOS_MEDICAO)[number], string> = {
  euclidiana: 'Linha reta (distância real)',
  'diagonal-1': 'Por células: diagonal conta 1',
  'sem-diagonal': 'Por células: sem diagonais',
};

export function ConfigCena({ cena, aoFechar }: { cena: Cena; aoFechar(): void }) {
  const { despachar } = useVisao();
  const loja = useLoja();
  const confirmar = useConfirmar();
  const [colunas, setColunas] = useState(Math.round(cena.largura / cena.grade.tamanhoCelula));
  const grade = cena.grade;
  const mudarGrade = (g: Partial<Cena['grade']>) => despachar({ tipo: 'cena.grade', cenaId: cena.id, grade: g });

  const trocarImagem = async () => {
    const arquivo = await escolherArquivo(ACEITAR_IMAGENS);
    if (!arquivo) return;
    const d = await dimensoesDaImagem(arquivo);
    if (!d) {
      loja.avisar('erro', 'Não foi possível ler a imagem escolhida.');
      return;
    }
    const meta = await loja.importarImagem(arquivo, arquivo.name, 'mapa');
    if (!meta) return;
    const anterior = cena.mapa.tipo === 'arquivo' ? cena.mapa.arquivoId : null;
    if (despachar({ tipo: 'cena.mapa', cenaId: cena.id, mapa: { tipo: 'arquivo', arquivoId: meta.id }, largura: d.largura, altura: d.altura }).ok && anterior) {
      void loja.removerImagem(anterior);
    }
  };

  const usarDemo = (id: MapaDemoId) => {
    const d = DIMENSOES_DEMO[id];
    despachar({ tipo: 'cena.mapa', cenaId: cena.id, mapa: { tipo: 'demo', demoId: id }, largura: d.largura, altura: d.altura });
  };

  const removerImagem = async () => {
    const anterior = cena.mapa.tipo === 'arquivo' ? cena.mapa.arquivoId : null;
    if (despachar({ tipo: 'cena.mapa', cenaId: cena.id, mapa: { tipo: 'vazio' }, largura: cena.largura, altura: cena.altura }).ok && anterior) {
      void loja.removerImagem(anterior);
    }
  };

  return (
    <Dialogo titulo={`Configurar cena — ${cena.nome}`} aoFechar={aoFechar} largura="media" rodape={<Botao variante="primario" onClick={aoFechar}>Concluir</Botao>}>
      <div className="formulario">
        <fieldset className="grupo">
          <legend>Mapa</legend>
          <p className="nota">
            {cena.mapa.tipo === 'arquivo' && 'Imagem importada.'}
            {cena.mapa.tipo === 'demo' && `Mapa de demonstração “${NOME_MAPA_DEMO[cena.mapa.demoId]}” — geometria não canônica.`}
            {cena.mapa.tipo === 'vazio' && 'Sem imagem: a cena usa um fundo liso com grade.'} Dimensões: {Math.round(cena.largura)} × {Math.round(cena.altura)} unidades.
          </p>
          <div className="linha-botoes">
            <Botao pequeno icone="imagem" onClick={() => void trocarImagem()}>
              {cena.mapa.tipo === 'arquivo' ? 'Trocar imagem…' : 'Importar imagem…'}
            </Botao>
            {cena.mapa.tipo !== 'vazio' && (
              <Botao pequeno variante="fantasma" onClick={() => void removerImagem()}>
                Remover imagem
              </Botao>
            )}
            <select className="entrada" aria-label="Usar mapa de demonstração" value="" onChange={(e) => e.target.value && usarDemo(e.target.value as MapaDemoId)}>
              <option value="">Usar mapa de demonstração…</option>
              {MAPAS_DEMO.map((id) => (
                <option key={id} value={id}>
                  {NOME_MAPA_DEMO[id]}
                </option>
              ))}
            </select>
          </div>
          {cena.mapa.tipo === 'vazio' && (
            <div className="grade-campos">
              <Campo rotulo="Largura (unidades)">
                <CampoNumero valor={cena.largura} min={64} max={20000} aoMudar={(n) => despachar({ tipo: 'cena.mapa', cenaId: cena.id, mapa: cena.mapa, largura: n, altura: cena.altura })} />
              </Campo>
              <Campo rotulo="Altura (unidades)">
                <CampoNumero valor={cena.altura} min={64} max={20000} aoMudar={(n) => despachar({ tipo: 'cena.mapa', cenaId: cena.id, mapa: cena.mapa, largura: cena.largura, altura: n })} />
              </Campo>
            </div>
          )}
        </fieldset>

        <fieldset className="grupo">
          <legend>Grade e escala</legend>
          <div className="grade-campos">
            <Campo rotulo="Metros por célula" dica={`Calibração da escala. Padrão do aplicativo: ${String(METROS_POR_CELULA_PADRAO).replace('.', ',')} m (não é regra de Wendlands).`}>
              <CampoNumero valor={grade.metrosPorCelula} min={0.1} max={1000} passo={0.5} aoMudar={(n) => mudarGrade({ metrosPorCelula: n })} />
            </Campo>
            <Campo rotulo="Tamanho da célula (unidades do mapa)" dica="Quantos pixels do mapa formam o lado de uma célula.">
              <CampoNumero valor={grade.tamanhoCelula} min={8} max={1000} aoMudar={(n) => mudarGrade({ tamanhoCelula: n })} />
            </Campo>
            <Campo rotulo="Deslocamento horizontal da grade">
              <CampoNumero valor={grade.origemX} min={-1000} max={1000} aoMudar={(n) => mudarGrade({ origemX: n })} />
            </Campo>
            <Campo rotulo="Deslocamento vertical da grade">
              <CampoNumero valor={grade.origemY} min={-1000} max={1000} aoMudar={(n) => mudarGrade({ origemY: n })} />
            </Campo>
          </div>
          <div className="calibrar">
            <Campo rotulo="Calibrar pela largura: o mapa tem quantas células de largura?">
              <CampoNumero valor={colunas} min={1} max={2000} aoMudar={(n) => setColunas(Math.max(1, Math.round(n)))} />
            </Campo>
            <Botao pequeno onClick={() => mudarGrade({ tamanhoCelula: Math.min(1000, Math.max(8, Math.round((cena.largura / colunas) * 100) / 100)), origemX: 0 })}>
              Aplicar
            </Botao>
          </div>
          <label className="alternar">
            <input type="checkbox" checked={grade.visivel} onChange={(e) => mudarGrade({ visivel: e.target.checked })} />
            <span>Mostrar a grade</span>
          </label>
          <label className="alternar">
            <input type="checkbox" checked={grade.encaixar} onChange={(e) => mudarGrade({ encaixar: e.target.checked })} />
            <span>Encaixar tokens na grade ao mover (segure Alt para posicionar livremente)</span>
          </label>
          <Campo
            rotulo="Como medir distâncias"
            dica={
              <>
                Medição em metros conforme a calibração acima. As contagens por células são convenções opcionais da mesa. <RefRegra id="convencao-medicao" rotulo="Sobre a medição" />
              </>
            }
          >
            <select className="entrada" value={grade.medicao} onChange={(e) => mudarGrade({ medicao: e.target.value as Cena['grade']['medicao'] })}>
              {MODOS_MEDICAO.map((m) => (
                <option key={m} value={m}>
                  {NOME_MEDICAO[m]}
                </option>
              ))}
            </select>
          </Campo>
          {cena.nevoa.length > 0 && <p className="nota">Ao mudar o tamanho ou o deslocamento da grade, a névoa existente é convertida para as novas células.</p>}
        </fieldset>

        <fieldset className="grupo">
          <legend>Névoa</legend>
          <p className="nota">
            {cena.nevoa.length} célula(s) oculta(s). A névoa é manual: não há iluminação dinâmica nem linha de visão. Tokens sob névoa não são enviados aos jogadores.
          </p>
          <div className="linha-botoes">
            <Botao
              pequeno
              onClick={async () => {
                if (await confirmar({ titulo: 'Ocultar todo o mapa', texto: 'Cobrir todas as células da cena com névoa?', confirmar: 'Ocultar tudo' })) despachar({ tipo: 'nevoa.tudo', cenaId: cena.id, operacao: 'ocultar' });
              }}
            >
              Ocultar tudo
            </Botao>
            <Botao
              pequeno
              disabled={cena.nevoa.length === 0}
              onClick={async () => {
                if (await confirmar({ titulo: 'Revelar todo o mapa', texto: 'Remover toda a névoa desta cena? Tudo o que estava encoberto passa a ser visível aos jogadores.', confirmar: 'Revelar tudo', perigo: true })) {
                  despachar({ tipo: 'nevoa.tudo', cenaId: cena.id, operacao: 'revelar' });
                }
              }}
            >
              Revelar tudo
            </Botao>
          </div>
        </fieldset>

        <Campo rotulo="Nota do mestre (nunca enviada aos jogadores)" largo>
          <textarea className="entrada entrada--area" rows={3} maxLength={5000} defaultValue={cena.notaMestre} onBlur={(e) => e.target.value !== cena.notaMestre && despachar({ tipo: 'cena.atualizar', cenaId: cena.id, notaMestre: e.target.value })} />
        </Campo>
      </div>
    </Dialogo>
  );
}
