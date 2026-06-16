import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import "./styles/AppHeader.css";

const THEME_STORAGE_KEY = 'ssge-theme';

function AppHeader() {
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [menuPrincipalAbierto, setMenuPrincipalAbierto] = useState(false);
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
            <Link
              to="/configuracion-embalse"
              className="main-dropdown-item"
              onClick={() => setMenuPrincipalAbierto(false)}
            >
              Configuración Embalse
            </Link>
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
          <h1 className="app-title">SSGE</h1>
          <p className="app-subtitle">Sistema de Simulación y Gestión de Embalses</p>
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
            onClick={() => setMenuUsuarioAbierto((prev) => !prev)}
          >
            <div className="user-avatar" aria-hidden="true">JL</div>
            <div className="user-info">
              <span className="user-name">Jose Luis</span>
              <span className="user-role">Operador</span>
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
              <button type="button" className="user-dropdown-item user-dropdown-item--danger">
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