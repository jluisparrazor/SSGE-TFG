import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AppHeader.css";
import InicioSesion from '../../pages/Login/Login.jsx';
import { apiFetch, clearToken, getToken, getTokenPayload } from "../../lib/api";

function AppHeader() {
  const navigate = useNavigate();
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [menuPrincipalAbierto, setMenuPrincipalAbierto] = useState(false);
  const [mostrarLogin, setMostrarLogin] = useState(false);

  const [usuario, setUsuario] = useState(() => {
    const payload = getTokenPayload();
    if (!payload?.username) return null;

    return {
      id: payload.sub,
      username: payload.username,
      rol: payload.rol,
      activo: true,
    };
  });
  const menuPrincipalRef = useRef(null);
  const menuUsuarioRef = useRef(null);

  useEffect(() => {
    const cargarSesion = async () => {
      const token = getToken();
      if (!token) {
        setUsuario(null);
        return;
      }

      const payload = getTokenPayload();
      if (payload?.username) {
        setUsuario({
          id: payload.sub,
          username: payload.username,
          rol: payload.rol,
          activo: true,
        });
      }

      try {
        const res = await apiFetch('/api/auth/me');
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            clearToken();
            setUsuario(null);
          }
          return;
        }

        const data = await res.json();
        setUsuario(data?.usuario || null);
      } catch (_error) {
        // Fallback
      }
    };

    cargarSesion();
  }, []);

  useEffect(() => {
    const handleDocumentMouseDown = (event) => {
      if (menuPrincipalRef.current && !menuPrincipalRef.current.contains(event.target)) {
        setMenuPrincipalAbierto(false);
      }

      if (menuUsuarioRef.current && !menuUsuarioRef.current.contains(event.target)) {
        setMenuUsuarioAbierto(false);
      }
    };

    const handleDocumentKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuPrincipalAbierto(false);
        setMenuUsuarioAbierto(false);
        setMostrarLogin(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, []);

  const rolLabel = {
    ADMIN: 'Administrador',
    OPERADOR: 'Operador',
    VISUALIZADOR: 'Visualizador',
    INGESTA: 'Servicio de Ingesta',
  }[usuario?.rol] || 'Iniciar Sesión';

  const nombreUsuario = usuario?.username || 'Invitado';
  const avatarTexto = nombreUsuario.slice(0, 2).toUpperCase();
  const puedeGestionarEmbalses = usuario?.rol === 'ADMIN' || usuario?.rol === 'OPERADOR';
  const esAdmin = usuario?.rol === 'ADMIN';

  const cerrarSesion = () => {
    clearToken();
    setUsuario(null);
    setMenuUsuarioAbierto(false);
    navigate('/', { replace: true });
    window.location.reload();
  };

  const handleUserTrigger = () => {
    if (!usuario) {
      setMostrarLogin(true);
      return;
    }
    setMenuUsuarioAbierto((prev) => !prev);
  };

  return (
    <>
      <header className="app-header">
        <nav className="app-nav">
          <div ref={menuPrincipalRef}>
            <button
              type="button"
              className="menu-btn"
              aria-label="Abrir menu"
              aria-haspopup="menu"
              aria-expanded={menuPrincipalAbierto}
              onClick={() => setMenuPrincipalAbierto((prev) => !prev)}
            >
              <span className="menu-icon"></span>
            </button>

            <div className={`main-dropdown ${menuPrincipalAbierto ? 'is-open' : ''}`} role="menu" aria-label="Menu principal">
              <Link to="/" className="main-dropdown-item" onClick={() => setMenuPrincipalAbierto(false)}>Inicio</Link>
              <Link to="/simulacion" className="main-dropdown-item" onClick={() => setMenuPrincipalAbierto(false)}>Simulación</Link>
              {puedeGestionarEmbalses && (
                <Link to="/configuracion-embalse" className="main-dropdown-item" onClick={() => setMenuPrincipalAbierto(false)}>Configuración Embalse</Link>
              )}
              {puedeGestionarEmbalses && (
                <Link to="/reglas-difusas" className="main-dropdown-item" onClick={() => setMenuPrincipalAbierto(false)}>Reglas Difusas</Link>
              )}
              {esAdmin && (
                <Link to="/gestion-usuarios" className="main-dropdown-item" onClick={() => setMenuPrincipalAbierto(false)}>Gestión Usuarios</Link>
              )}
              {esAdmin && (
                <Link to="/auditoria-global" className="main-dropdown-item" onClick={() => setMenuPrincipalAbierto(false)}>Auditoría Global</Link>
              )}
            </div>
          </div>

          <div className="brand">
            <img src="/Logo_blanco.png" alt="Logo SSGE" className="brand-logo" onClick={() => navigate('/')}/>
            <div className="brand-text">
              <h1 className="app-title">SSGE</h1>
              <p className="app-subtitle">Sistema de Simulación y Gestión de Embalses</p>
            </div>
          </div>

          {/* El botón del tema oscuro/claro ha sido eliminado de aquí */}

          <div className="user-menu" ref={menuUsuarioRef}>
            <button
              type="button"
              className="user-block user-trigger"
              aria-label="Abrir menu de usuario"
              aria-haspopup="menu"
              aria-expanded={menuUsuarioAbierto}
              onClick={handleUserTrigger}
            >
              <div className="user-avatar" aria-hidden="true">{avatarTexto}</div>
              <div className="user-info">
                <span className="user-name">{nombreUsuario}</span>
                <span className="user-role">{rolLabel}</span>
              </div>
            </button>

            {menuUsuarioAbierto && (
              <div className="user-dropdown" role="menu" aria-label="Menu de usuario">
                <button type="button" className="user-dropdown-item user-dropdown-item--danger" onClick={cerrarSesion}>
                  Cerrar sesion
                </button>
              </div>
            )}
          </div>
        </nav>
      </header>

      {mostrarLogin && (
        <div className="inicio-sesion-ruta-superposicion">
          <InicioSesion modal={true} onClose={() => setMostrarLogin(false)} />
        </div>
      )}
    </>
  );
}

export default AppHeader;