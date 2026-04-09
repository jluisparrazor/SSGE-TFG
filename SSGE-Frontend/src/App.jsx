import { useState } from 'react'
import { Thermometer, CloudRain, Waves, TriangleAlert, ArrowRightFromLine, CheckCircle} from 'lucide-react';
import {LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Line} from 'recharts';

import EmbalseInfografia from './components/EmbalseInfografia'
import './App.css'


function App() {

  // Esto bloque habrá que cambiarlo más adelante, cuando se integre con el backend. Por ahora sirve para mostrar datos de ejemplo en la infografía y en los sensores.
  
  const theme = {
    bg: '#0b1120', panel: '#1e293b', border: '#334155', text: '#f8fafc', accent: '#06b6d4', muted: '#94a3b8'
  };

  const datoActualMock = {
    nivel: 950.4,
    porcentaje: 85.2,
    volumenActualHm3: 21.6,
    cotaMaximaM: 960,
    cotaMinimaM: 900,
    caudalEntrada: 12.3,
    caudalSalida: 8.1,
    temperatura: 17.2,
    precipitacion: 0.0
  };

  const embalseSeleccionadoMock = {
    nombre: 'Embalse Demo',
    compuertas: []
  };

  const datoActualSeguro = datoActualMock;
  const embalseSeguro = embalseSeleccionadoMock;

  const datosHistoricos = [
    { timestamp: new Date('2026-04-09T00:00:00').getTime(), nivel: 949.8 },
    { timestamp: new Date('2026-04-09T04:00:00').getTime(), nivel: 950.1 },
    { timestamp: new Date('2026-04-09T08:00:00').getTime(), nivel: 950.0 },
    { timestamp: new Date('2026-04-09T12:00:00').getTime(), nivel: 950.4 },
    { timestamp: new Date('2026-04-09T16:00:00').getTime(), nivel: 950.6 },
    { timestamp: new Date('2026-04-09T20:00:00').getTime(), nivel: 950.3 }
  ];

  const dominioNivelHistorico = [
    Math.min(...datosHistoricos.map((item) => item.nivel)) - 0.5,
    Math.max(...datosHistoricos.map((item) => item.nivel)) + 0.5
  ];

  const alertasMock = [
    {
      id: 1,
      tipo: 'warning',
      hora: '14:30',
      titulo: 'Prealerta de lluvias',
      descripcion: 'Acción automática: aumentando caudal de salida a 10 m³/s para crear resguardo.'
    },
    {
      id: 2,
      tipo: 'success',
      hora: '12:15',
      titulo: 'Nivel estabilizado',
      descripcion: 'El nivel del embalse se mantiene dentro del rango objetivo.'
    },
    {
      id: 3,
      tipo: 'warning',
      hora: '10:40',
      titulo: 'Caudal de entrada alto',
      descripcion: 'Se detectó un aumento rápido del caudal de entrada a 15 m³/s en la última hora.'
    },
    {
      id: 4,
      tipo: 'success',
      hora: '09:05',
      titulo: 'Sistema en normalidad',
      descripcion: 'Todos los sensores reportan valores correctos.'
    }
  ];

  const ultimasAlertas = alertasMock.slice(-4);

  // Fin del bloque de datos de ejemplo.

  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);

  const toggleMenuUsuario = () => {
    setMenuUsuarioAbierto((prev) => !prev);
  };

  return (
    <div className="App">
      <header className="app-header">
        <nav className="app-nav">
          <button className="menu-btn" aria-label="Abrir menu">
            <span className="menu-icon"></span>
          </button>

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
              onClick={toggleMenuUsuario}
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

      <main>
        <div className='main-superior'>
          <h2 className='main-h2'>Panel General</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Embalse</span>
            {/* Aquí se podría colocar un selector de embalse para cambiar el panel general */}
          </div>
        </div>

        <div className="app-dashboard-grid">

          {/* 1. Infografía */}
          <EmbalseInfografia
            datoActual={datoActualSeguro}
            theme={theme}
            embalseNombre={embalseSeguro.nombre}
            compuertas={embalseSeguro.compuertas}
          />

          {/* 2. Nivel Actual del Agua */}
          <div className="nivel-agua-card">
            <h3 className="nivel-agua-title">Nivel Actual del Agua</h3>
            <div className="nivel-agua-content">
              <div>
                <p className="nivel-agua-label">Porcentaje:</p>
                <p className="nivel-agua-value">
                 {datoActualSeguro.porcentaje} <span className="nivel-agua-unit">%</span>
                </p>
              </div>
              <div>
                <p className="nivel-agua-label">Volumen:</p>
                <p className="nivel-agua-value">
                  {datoActualSeguro.volumenActualHm3} <span className="nivel-agua-unit">hm³</span>
                </p>
              </div>
            </div>
          </div>

          {/* 3. Sensores */}
          <div className="sensores-card">
            <h3 className="sensores-title">Sensores en Tiempo Real</h3>
            <ul className="sensores-list">
              <li className="sensor-item">
                <span className="sensor-label">
                  <Thermometer size={25} className="sensor-icon" />
                  Temperatura
                </span>
                <span className="sensor-value">{datoActualSeguro.temperatura} °C</span>
              </li>

              <li className="sensor-item">
                <span className="sensor-label">
                  <CloudRain size={25} className="sensor-icon" />
                  Precipitación
                </span>
                <span className="sensor-value">{datoActualSeguro.precipitacion} l/m²</span>
              </li>

              <li className="sensor-item">
                <span className="sensor-label">
                  <Waves size={25} className="sensor-icon" />
                  Caudal Entrada
                </span>
                <span className="sensor-value">{datoActualSeguro.caudalEntrada} m³/s</span>
              </li>

              <li className="sensor-item">
                <span className="sensor-label">
                  <ArrowRightFromLine size={25} className="sensor-icon" />
                  Caudal Salida
                </span>
                <span className="sensor-value">{datoActualSeguro.caudalSalida} m³/s</span>
              </li>
            </ul>
          </div>

          {/* 4. Historico de Evolución */}
          <div className="historico-card">
            <div className="historico-header">
              <h3 className="historico-title">Nivel Agua Historico</h3>
            </div>

            <div className="historico-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={datosHistoricos}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    stroke={theme.muted}
                    tickCount={6}
                    minTickGap={24}
                    interval="preserveStartEnd"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => {
                      const fecha = new Date(value)
                      return fecha.toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    }}
                  />
                  <YAxis
                    domain={dominioNivelHistorico}
                    stroke={theme.muted}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => value.toFixed(1)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: theme.panel,
                      borderColor: theme.border
                    }}
                    labelFormatter={(value) => new Date(value).toLocaleString('es-ES')}
                    formatter={(value) => [`${Number(value).toFixed(2)} msnm`, 'Nivel']}
                  />
                  <Line
                    type="monotone"
                    dataKey="nivel"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={{ r: 4, fill: theme.panel, stroke: '#38bdf8' }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. Alertas/Decisiones */}
          <div className="alertas-card">
            <h3 className="alertas-title">Últimas Alertas/Decisiones</h3>
            <div className="alertas-content">
              {ultimasAlertas.map((alerta) => (
                <div className="alerta-item" key={alerta.id}>
                  <div className="alerta-header">
                    {alerta.tipo === 'warning' ? (
                      <TriangleAlert size={20} className="alerta-icon alerta-icon--warning" />
                    ) : (
                      <CheckCircle size={20} className="alerta-icon alerta-icon--success" />
                    )}
                    <span className="alerta-time">{alerta.hora}</span>
                    <span className="alerta-resumen">{alerta.titulo}</span>
                  </div>
                  <p className="alerta-text">{alerta.descripcion}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>

      <footer>
        <div className="footer-izquierda">
          <p className="footer-arriba">Última actualización de datos:</p>
          <p className="footer-abajo">GestEmb v1.0.0-beta</p>
        </div>
        <div className="footer-derecha">
          <p className="footer-arriba">Trabajo de Fin de Grado - Ingeniería Informática</p>
          <p className="footer-abajo">Desarrollado por José Luis Parra Azor</p>
        </div>
      </footer>
    </div>
  )
}

export default App
