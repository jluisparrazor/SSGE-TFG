import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./styles/AppHeader.css";

function AppHeader() {
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [menuPrincipalAbierto, setMenuPrincipalAbierto] = useState(false);

  return (
    <header className="app-header">
      <nav className="app-nav">
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
            to="/aniadir-embalse"
            className="main-dropdown-item"
            onClick={() => setMenuPrincipalAbierto(false)}
          >
            Añadir embalse
          </Link>
          <Link
            to="/"
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
          <Link
            to="/"
            className="main-dropdown-item"
            onClick={() => setMenuPrincipalAbierto(false)}
          >
            Ejemplo
          </Link>
        </div>

        <div className="brand">
          <h1 className="app-title">SSGE</h1>
          <p className="app-subtitle">Sistema de Simulación y Gestión de Embalses</p>
        </div>

        <div className="user-menu">
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