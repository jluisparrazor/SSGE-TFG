import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import "./styles/index.css";
import App from './App.jsx'
import AniadirEmbalse from './AniadirEmbalse.jsx';
import Simulacion from './Simulacion.jsx';
import ConfiguracionEmbalse from './ConfiguracionEmbalse.jsx';
import InicioSesion from './Login.jsx';
import GestionUsuarios from './GestionUsuarios.jsx';
import { getToken, isRoleAllowed } from './lib/api.js';

function RequireAuth({ children, allowedRoles = [] }) {
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!isRoleAllowed(allowedRoles)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function RedirectIfAuth({ children }) {
  const token = getToken();
  if (token) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function LoginOverlayRoute() {
  const token = getToken();

  if (token) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="inicio-sesion-ruta-contenedor">
      <App />
      <div className="inicio-sesion-ruta-superposicion">
        <InicioSesion modal />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<LoginOverlayRoute />}
        />
        <Route
          path="/"
          element={<App />}
        />
        <Route
          path="/aniadir-embalse"
          element={(
            <RequireAuth allowedRoles={['ADMIN', 'OPERADOR']}>
              <AniadirEmbalse />
            </RequireAuth>
          )}
        />
        <Route
          path="/simulacion"
          element={<Simulacion />}
        />
        <Route
          path="/configuracion-embalse"
          element={(
            <RequireAuth allowedRoles={['ADMIN', 'OPERADOR']}>
              <ConfiguracionEmbalse />
            </RequireAuth>
          )}
        />
        <Route
          path="/gestion-usuarios"
          element={(
            <RequireAuth allowedRoles={['ADMIN']}>
              <GestionUsuarios />
            </RequireAuth>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
