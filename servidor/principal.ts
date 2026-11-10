/**
 * Ponto de entrada do servidor da mesa online.
 *
 *   npm run build        (gera a interface em dist/)
 *   npm run servidor     (sobe HTTP + WebSocket e serve dist/ se existir)
 *
 * Variáveis de ambiente:
 *   WENDLANDS_PORTA         porta de escuta (padrão 8787)
 *   WENDLANDS_ENDERECO      endereço de escuta (padrão 0.0.0.0)
 *   WENDLANDS_DADOS         pasta de dados (padrão ./dados-servidor)
 *   WENDLANDS_TOKEN_ADMIN   token exigido para criar salas; se ausente, um token
 *                           aleatório é gerado e mostrado a cada inicialização
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { novoToken } from './sala';
import { ServidorMesa } from './servidor';

const porta = Number(process.env.WENDLANDS_PORTA ?? 8787);
const endereco = process.env.WENDLANDS_ENDERECO ?? '0.0.0.0';
const pastaDados = resolve(process.env.WENDLANDS_DADOS ?? 'dados-servidor');
const pastaDist = resolve('dist');
const tokenInformado = process.env.WENDLANDS_TOKEN_ADMIN?.trim();
const tokenAdmin = tokenInformado && tokenInformado.length >= 16 ? tokenInformado : novoToken();

if (tokenInformado && tokenInformado.length < 16) {
  console.warn('WENDLANDS_TOKEN_ADMIN tem menos de 16 caracteres e foi ignorado; usando um token gerado.');
}

const servidor = new ServidorMesa({
  pastaDados,
  tokenAdmin,
  pastaEstatica: existsSync(pastaDist) ? pastaDist : null,
  registrar: (linha) => console.log(`[${new Date().toISOString()}] ${linha}`),
});

const portaReal = await servidor.iniciar(porta, endereco);
console.log('');
console.log('WENDLANDS — servidor da mesa online');
console.log(`  Endereço:            http://localhost:${portaReal}`);
console.log(`  Dados:               ${pastaDados}`);
console.log(`  Interface (dist/):   ${existsSync(pastaDist) ? 'servida por este servidor' : 'não encontrada — rode "npm run build" ou use "npm run dev"'}`);
if (!tokenInformado || tokenInformado.length < 16) {
  console.log(`  Token de administração (gerado agora, vale até reiniciar): ${tokenAdmin}`);
  console.log('  Defina WENDLANDS_TOKEN_ADMIN para manter um token fixo.');
} else {
  console.log('  Token de administração: definido por WENDLANDS_TOKEN_ADMIN.');
}
console.log('  O token de administração só serve para criar salas. Não o compartilhe com jogadores.');
console.log('');

let encerrando = false;
async function encerrar(): Promise<void> {
  if (encerrando) return;
  encerrando = true;
  console.log('Encerrando: gravando salas…');
  await servidor.parar();
  process.exit(0);
}
process.on('SIGINT', () => void encerrar());
process.on('SIGTERM', () => void encerrar());
