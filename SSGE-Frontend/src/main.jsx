import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import "./styles/index.css";
import App from './App.jsx'
import AniadirEmbalse from './AniadirEmbalse.jsx';
import Simulacion from './Simulacion.jsx';
import ConfiguracionEmbalse from './ConfiguracionEmbalse.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/aniadir-embalse" element={<AniadirEmbalse />} />
        <Route path="/simulacion" element={<Simulacion />} />
        <Route path="/configuracion-embalse" element={<ConfiguracionEmbalse />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
