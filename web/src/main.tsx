import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('The web root element is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <main>
      <h1>Relo</h1>
      <p>Your relocation workspace is ready.</p>
    </main>
  </StrictMode>,
);
