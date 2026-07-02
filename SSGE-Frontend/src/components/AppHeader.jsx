import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import "./styles/AppHeader.css";
import { apiFetch, clearToken, getToken, getTokenPayload } from "../lib/api";

const THEME_STORAGE_KEY = 'ssge-theme';

function AppHeader() {
  const navigate = useNavigate();
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [menuPrincipalAbierto, setMenuPrincipalAbierto] = useState(false);
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
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    } catch (_error) {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (_error) {
      // Ignorar errores de almacenamiento local.
    }
  }, [theme]);

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
        // Si falla /me por red o despliegue parcial, mantenemos sesion con el token local.
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
  }[usuario?.rol] || 'Sin sesion';

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
      navigate('/login');
      return;
    }

    setMenuUsuarioAbierto((prev) => !prev);
  };

  return (
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
            <Link
              to="/"
              className="main-dropdown-item"
              onClick={() => setMenuPrincipalAbierto(false)}
            >
              Inicio
            </Link>
            {puedeGestionarEmbalses && (
              <Link
                to="/configuracion-embalse"
                className="main-dropdown-item"
                onClick={() => setMenuPrincipalAbierto(false)}
              >
                Configuración Embalse
              </Link>
            )}
            {esAdmin && (
              <Link
                to="/gestion-usuarios"
                className="main-dropdown-item"
                onClick={() => setMenuPrincipalAbierto(false)}
              >
                Gestión Usuarios
              </Link>
            )}
            <Link
              to="/Simulacion"
              className="main-dropdown-item"
              onClick={() => setMenuPrincipalAbierto(false)}
            >
              Simulación
            </Link>
            <Link
              to="/"
              className="main-dropdown-item"
              onClick={() => setMenuPrincipalAbierto(false)}
            >
              Ejemplo
            </Link>
          </div>
        </div>

        <div className="brand">
          <img src="/Logo_blanco.png" alt="Logo SSGE" className="brand-logo" />
          <div className="brand-text">
            <h1 className="app-title">SSGE</h1>
            <p className="app-subtitle">Sistema de Simulación y Gestión de Embalses</p>
          </div>
        </div>

        <button
          type="button"
          className="theme-toggle-btn"
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span className="theme-toggle-text">{theme === 'dark' ? 'Claro' : 'Oscuro'}</span>
        </button>

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
              <button type="button" className="user-dropdown-item" onClick={() => { window.location.href = '/perfil'; }}>
                Mi perfil
              </button>
              <button type="button" className="user-dropdown-item" onClick={() => { window.location.href = '/ajustes'; }}>
                Ajustes
              </button>
              <button type="button" className="user-dropdown-item user-dropdown-item--danger" onClick={cerrarSesion}>
                Cerrar sesion
              </button>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

export default AppHeader;