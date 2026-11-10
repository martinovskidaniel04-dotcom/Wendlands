import '@fontsource-variable/inter';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import './estilos/base.css';
import './estilos/app.css';
import './estilos/paginas.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { LojaContexto } from './ui/contexto';
import { Loja } from './ui/loja';

const loja = new Loja();
void loja.iniciar();

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <LojaContexto.Provider value={loja}>
      <App />
    </LojaContexto.Provider>
  </StrictMode>,
);
