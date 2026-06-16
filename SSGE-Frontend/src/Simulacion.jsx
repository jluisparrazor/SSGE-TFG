import React, { useState, useEffect } from 'react';
import AppHeader from './components/AppHeader.jsx';
import AppFooter from './components/AppFooter.jsx';
import './styles/Simulacion.css';
import { Dam, Eye, Gauge, Thermometer, Wind } from 'lucide-react';

export default function Simulacion() {
  const [duracion, setDuracion] = useState(60); // minutos
  const [nivelInicial, setNivelInicial] = useState(50); // % relativo
  const [lluviaPrevista, setLluviaPrevista] = useState(100); // mm

  const [cargandoEmbalses, setCargandoEmbalses] = useState(true);
  const [embalses, setEmbalses] = useState([]);
  const [errorEmbalses, setErrorEmbalses] = useState('');

  const [compuertas, setCompuertas] = useState([]);
  const [sensoresEditables, setSensoresEditables] = useState([]);
  const [umbralGuardado, setUmbralGuardado] = useState(false);

  const [embalseSeleccionadoId, setEmbalseSeleccionadoId] = useState(() => {
    try {
      return localStorage.getItem('embalseSeleccionadoId') || '';
    }
    catch (error) {
      console.error('Error accediendo a localStorage:', error);
      return '';
    }
  });

  const embalseSeleccionado = embalses.find((e) => String(e.id) === String(embalseSeleccionadoId));

  const toggleCompuerta = (id) => {
    setCompuertas(prev => prev.map(c => c.id === id ? { ...c, estadoAperturaPorcentaje: c.estadoAperturaPorcentaje > 0 ? 0 : 100 } : c));
  };

  const handleCambioCaudal = (id, value) => {
    setCompuertas(prev => prev.map(c => c.id === id ? { ...c, caudalSalidaActual: Number(value) } : c));
  };

  const handleCambioSensor = (id, value) => {
    setSensoresEditables((prev) => prev.map((sensor) => (
      sensor.id === id ? { ...sensor, valorActual: value } : sensor
    )));
  };

  const getSensorIcon = (tipo) => {
    const tipoNormalizado = String(tipo || '').toLowerCase();

    if (tipoNormalizado.includes('oxígeno') || tipoNormalizado.includes('oxigeno')) return <Wind size={18} className="sensor-icon-svg" />;
    if (tipoNormalizado.includes('temperatura')) return <Thermometer size={18} className="sensor-icon-svg" />;
    if (tipoNormalizado.includes('turbidez')) return <Eye size={18} className="sensor-icon-svg" />;
    return <Gauge size={18} className="sensor-icon-svg" />;
  };

  const enviarDatosCompuerta = async (compuerta) => {
    // ejemplo: adaptalo a tu endpoint real o lógica socket
    try {
      await fetch('http://localhost:3000/api/compuertas/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embalseId: embalseSeleccionadoId,
          compuertaId: compuerta.id,
          apertura: compuerta.estadoAperturaPorcentaje,
          caudal: compuerta.caudalSalidaActual
        })
      });
      alert('Datos enviados (mock)');
    } catch (err) {
      console.error(err);
      alert('Error enviando datos');
    }
  };

  const enviarDatosSensor = async (sensor) => {
    try {
      alert(`Dato del sensor ${sensor.tipo} preparado: ${sensor.valorActual}`);
    } catch (err) {
      console.error(err);
      alert('Error enviando dato del sensor');
    }
  };

  // Carga los embalses al montar el componente y cada 30 segundos
  useEffect(() => {
    const cargarEmbalses = async () => {
      try {
        setCargandoEmbalses(true);
        setErrorEmbalses('');

        const res = await fetch('http://localhost:3000/api/embalses');
        if (!res.ok) throw new Error(`No se pudieron cargar los embalses: ${res.statusText}`);

        const datos = await res.json();
        const listaEmbalses = Array.isArray(datos) ? datos : [];
        setEmbalses(listaEmbalses);
        
        setEmbalseSeleccionadoId((prevId) => {
          if (listaEmbalses.length === 0) return '';
          const existeSeleccionActual = prevId && listaEmbalses.some((e) => String(e.id) === String(prevId));
          if (existeSeleccionActual) return prevId;

          try {
            const guardado = localStorage.getItem('embalseSeleccionadoId');
            const existeGuardado = guardado && listaEmbalses.some((e) => String(e.id) === String(guardado));
            if (existeGuardado) return String(guardado);
          } catch (_error) {
            console.warn('No se pudo acceder a localStorage para recuperar el embalse seleccionado:', _error);
          }

          return String(listaEmbalses[0].id);
        });
      } catch (error) {
        console.error('Error cargando embalses:', error);
        setErrorEmbalses('No se pudieron cargar los embalses. Inténtalo de nuevo más tarde.');
      } finally {
        setCargandoEmbalses(false);
      }
    };

    cargarEmbalses();

    const interval = setInterval(cargarEmbalses, 30000);
    return () => clearInterval(interval);
  }, []);

  // Guarda el embalse seleccionado en localStorage para mantener la selección al recargar la página
  useEffect(() => {
    if (!embalseSeleccionadoId) return;
    try {
      localStorage.setItem('embalseSeleccionadoId', String(embalseSeleccionadoId));
    } catch (error) {
      console.error('No se pudo guardar embalseSeleccionadoId:', error);
    }
  }, [embalseSeleccionadoId]);

  // Actualiza las compuertas cuando cambian los embalses o el embalse seleccionado
  useEffect(() => {
    if (!embalses || embalses.length === 0 || !embalseSeleccionadoId) {
      setCompuertas([]);
      setSensoresEditables([]);
      return;
    }
    const emb = embalses.find(e => String(e.id) === String(embalseSeleccionadoId));
    const lista = (emb?.compuertas || []).map((c) => ({
      id: c.id ?? `${embalseSeleccionadoId}-c-${Math.random()}`,
      nombre: c.nombre || `Compuerta ${c.id ?? ''}`,
      cotaFijaM: Number(c.cotaTomaM ?? c.altura ?? 0),
      caudalMaximo: Number(c.maximoCaudal ?? c.caudalMaximo ?? c.caudalSalidaActual ?? 0),
      estadoAperturaPorcentaje: Number(c.estadoAperturaPorcentaje ?? c.apertura ?? 0),
      caudalSalidaActual: 0
    }));
    setCompuertas(lista);
    setSensoresEditables((emb?.sensores || []).map((sensor) => ({
      id: sensor.id ?? `${embalseSeleccionadoId}-s-${Math.random()}`,
      tipo: sensor.tipo || 'Sensor',
      valorActual: sensor.valorActual ?? 0,
    })));
  }, [embalses, embalseSeleccionadoId]);

  return (
    <div className="App">
      <AppHeader />
      <main>
        <div className="main-superior">
          <h2 className="main-h2">Panel Simulación</h2>
        </div>

        <div className="app-dashboard-grid">

          {/* Datos Inicio Simulación */}
          <div className="form-card form-card--inicio">
            <h3 className="form-card-title">Datos Inicio Simulación</h3>
            <div className="form-card-content">
              <label className="form-card-label">Embalse</label>
              <select
                id="selector-embalse"
                className="form-card-input  embalse-selector"
                value={embalseSeleccionadoId}
                onChange={(e) => setEmbalseSeleccionadoId(e.target.value)}
                disabled={cargandoEmbalses || embalses.length === 0}
              >
                {cargandoEmbalses && <option value="">Cargando...</option>}
                {!cargandoEmbalses && embalses.length === 0 && <option value="">Sin embalses</option>}
                {embalses.map((embalse) => (
                  <option key={embalse.id} value={String(embalse.id)}>
                    {embalse.nombre}
                  </option>
                ))}
              </select>

              <label className="form-card-label">Duración Simulación (min)</label>
              <input type="number" className="form-card-input" value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} />

              <label className="form-card-label">Nivel Inicial Embalse (%)</label>

              <div className="form-card-input slider-box">
                <input
                  type="range"
                  className="slider-input"
                  min="0"
                  max="100"
                  value={nivelInicial}
                  onChange={(e) => setNivelInicial(Number(e.target.value))}
                />

                <div className="slider-footer">
                  <span className="slider-min">0%</span>
                  <div className="slider-current-box">{nivelInicial}%</div>
                  <span className="slider-max">100%</span>
                </div>
              </div>

              <label className="form-card-label">Lluvia prevista (mm)</label>
              <input type="number" className="form-card-input" value={lluviaPrevista} onChange={(e) => setLluviaPrevista(Number(e.target.value))} />

              <button className="btn-guardar" onClick={() => alert('Iniciar simulación (mock)')}>
                Iniciar Simulación
              </button>
            </div>
          </div>

          {/* Sensores */}
          <div className="sim-sensores-card">
            <h3 className="sensores-title">Sensores</h3>
            <div className="sim-sensores-list">
              {sensoresEditables.length === 0 && (
                <div className="sensores-empty">Sin sensores para este embalse</div>
              )}

              {sensoresEditables.map((sensor) => (
                <div key={sensor.id} className="form-card-campo compuerta-campo sensor-campo">
                  <div className="sensor-header">
                    <div className="sensor-icon">
                      {getSensorIcon(sensor.tipo)}
                    </div>
                    <div className="sensor-info">
                      <span className="sensor-label">{sensor.tipo}</span>
                      <span className="sensor-subtitle">Sensor #{sensor.id}</span>
                    </div>
                  </div>

                  <div className="sensor-value-box">
                    <span className="sensor-value-label">Valor actual</span>
                    <input
                      type="number"
                      step="0.1"
                      className="form-card-input sensor-input"
                      value={sensor.valorActual}
                      onChange={(e) => handleCambioSensor(sensor.id, e.target.value)}
                    />
                    <button className="btn-guardar sensor-send-btn" onClick={() => enviarDatosSensor(sensor)}>
                      Enviar Dato
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Estado Compuertas */}
          <div className="form-card form-card--compuertas">
            <h3 className="form-card-title">Estado Compuertas</h3>

            <div className="compuertas-grid">
              {compuertas.length === 0 && (
                <div className="compuertas-empty">Sin compuertas para este embalse</div>
              )}

              {compuertas.map((c) => {
                const abierta = Number(c.estadoAperturaPorcentaje) > 0;
                const caudalSeleccionado = Number(c.caudalSalidaActual || 0);
                const caudalEfectivo = abierta ? caudalSeleccionado : 0;

                return (
                  <div key={c.id} className="form-card-campo compuerta-campo">
                    <div className="compuerta-header">
                      <div className="compuerta-icon">
                        <Dam size={18} className="compuerta-icon-svg" />
                      </div>
                      <h4 className="compuerta-title">{c.nombre}</h4>
                      <span className={`compuerta-badge ${abierta ? 'compuerta-badge--open' : 'compuerta-badge--closed'}`}>
                        {abierta ? 'Abierta' : 'Cerrada'}
                      </span>
                    </div>

                    <div className="compuerta-contenido">
                      <div className="compuerta-inputs">
                        <div className="compuerta-input compuerta-input-toggle">
                          <span className="form-card-label">Abrir/Cerrar</span>
                          <label className="compuerta-switch">
                            <span className="compuerta-switch-control">
                              <input
                                type="checkbox"
                                checked={abierta}
                                onChange={() => toggleCompuerta(c.id)}
                              />
                              <span className="compuerta-switch-slider" />
                            </span>
                          </label>
                        </div>

                        <div className="compuerta-input">
                          <span className="form-card-label">Caudal de salida (m³/s)</span>
                          <input
                            type="range"
                            min="0"
                            max={Math.max(0, Number(c.caudalMaximo || 0))}
                            step="0.1"
                            value={Number(c.caudalSalidaActual || 0)}
                            onChange={(e) => handleCambioCaudal(c.id, e.target.value)}
                            className="compuerta-range"
                          />
                          <div className="compuerta-range-labels">
                            <span className="compuerta-num">0</span>
                            <span><span className="compuerta-num">{Number(c.caudalSalidaActual || 0).toFixed(1)}</span> / <span className="compuerta-num">{Number(c.caudalMaximo || 0).toFixed(1)}</span> m³/s</span>
                          </div>
                        </div>
                      </div>

                      <div className="compuerta-actions">
                        <div className="compuerta-cota-text">
                          Cota: <span className="compuerta-num">{Number.isFinite(c.cotaFijaM) ? c.cotaFijaM : '--'}</span> (m.s.n.m)
                        </div>

                        <div className="compuerta-resumen">
                          Caudal efectivo: <span className="compuerta-num">{caudalEfectivo}</span> (m³/s)
                        </div>
                      </div>

                      <button className="btn-guardar compuerta-send-btn" onClick={() => enviarDatosCompuerta(c)}>
                        Enviar Datos
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ajuste Umbrales */}
          <div className="form-card">
            <h3 className="form-card-title">Ajuste de Umbrales</h3>
            <div className="form-card-content">
              <label className="form-card-label">Umbral Alerta Sequía</label>
              <input type="number" className="form-card-input" placeholder="Ej: 20" />
              <label className="form-card-label">Oxígeno mínimo</label>
              <input type="number" className="form-card-input" placeholder="Ej: 5" />
              <button className="btn-guardar" onClick={() => setUmbralGuardado(true)}>Guardar Umbrales</button>
              {umbralGuardado && <div style={{marginTop:8,color:'#86efac'}}>Umbrales guardados (mock)</div>}
            </div>
          </div>

        </div>
      </main>
      <AppFooter lastUpdate="--/--/-- --:--" />
    </div>
  );
}