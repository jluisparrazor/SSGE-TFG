import React from "react";
import "./AppFooter.css";

function AppFooter({ lastUpdate = "" }) {
  return (
    <footer>
      <div className="footer-izquierda">
        <p className="footer-arriba">Última actualización de datos: {lastUpdate}</p>
        <p className="footer-abajo">GestEmb v1.0.0-beta</p>
      </div>

      <div className="footer-centro">
        <span className="footer-logo-text">SSGE</span>
        <img src="/Logo_blanco.png" alt="Logo SSGE" className="footer-logo" />
      </div>

      <div className="footer-derecha">
        <p className="footer-arriba">Trabajo de Fin de Grado - Ingeniería Informática</p>
        <p className="footer-abajo">Desarrollado por José Luis Parra Azor</p>
      </div>
    </footer>
  );
}

export default AppFooter;