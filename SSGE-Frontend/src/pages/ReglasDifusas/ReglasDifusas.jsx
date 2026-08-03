import { useEffect, useState } from 'react';
import AppHeader from '../../components/AppHeader/AppHeader.jsx';
import AppFooter from '../../components/AppFooter/AppFooter.jsx';
import { apiFetch } from '../../lib/api.js';
import './ReglasDifusas.css';

const TRAPS_NIVEL = [
  { key: 'bajo', label: 'Nivel Bajo' },
  { key: 'medio', label: 'Nivel Medio' },
  { key: 'alto', label: 'Nivel Alto' },
  { key: 'critico', label: 'Nivel Critico' },
];

const TRAPS_ENTRADA = [
  { key: 'escasa', label: 'Entrada Escasa' },
  { key: 'moderada', label: 'Entrada Moderada' },
  { key: 'intensa', label: 'Entrada Intensa' },
  { key: 'torrencial', label: 'Entrada Torrencial' },
];

const REGLAS = [
  { key: 'regla1', label: 'R1: Nivel critico -> salida alta' },
  { key: 'regla2', label: 'R2: Nivel alto + lluvia intensa/torrencial' },
  { key: 'regla3', label: 'R3: Nivel alto + lluvia escasa/moderada' },
  { key: 'regla4', label: 'R4: Nivel medio + lluvia intensa/torrencial' },
  { key: 'regla5', label: 'R5: Nivel medio + lluvia moderada' },
  { key: 'regla6', label: 'R6: Nivel medio + lluvia escasa' },
  { key: 'regla7', label: 'R7: Nivel bajo' },
];

function parseNumero(input) {
  const numero = Number(input);
  return Number.isFinite(numero) ? numero : 0;
}

function ReglasDifusas() {
  const [reglas, setReglas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorEstado, setErrorEstado] = useState('');
  const [mensajeEstado, setMensajeEstado] = useState('');

  useEffect(() => {
    const cargarReglas = async () => {
      try {
        setCargando(true);
        setErrorEstado('');

        const respuesta = await apiFetch('/api/simulacion/reglas-difusas');
        const data = await respuesta.json();

        if (!respuesta.ok) {
          throw new Error(data?.error || 'No se pudo cargar la configuracion de reglas difusas.');
        }

        setReglas(data);
      } catch (error) {
        setErrorEstado(error.message || 'Error al cargar reglas difusas.');
      } finally {
        setCargando(false);
      }
    };

    cargarReglas();
  }, []);

  const actualizarTrapecio = (grupo, nombreTrapecio, indice, valor) => {
    setReglas((prev) => ({
      ...prev,
      [grupo]: {
        ...prev[grupo],
        [nombreTrapecio]: prev[grupo][nombreTrapecio].map((item, idx) => (idx === indice ? parseNumero(valor) : item)),
      },
    }));
  };

  const actualizarSalida = (reglaKey, campo, valor) => {
    setReglas((prev) => ({
      ...prev,
      salidas: {
        ...prev.salidas,
        [reglaKey]: {
          ...prev.salidas[reglaKey],
          [campo]: campo === 'modo' ? valor : parseNumero(valor),
        },
      },
    }));
  };

  const handleGuardar = async () => {
    if (!reglas) {
      setErrorEstado('No hay reglas cargadas para guardar.');
      return;
    }

    setGuardando(true);
    setErrorEstado('');
    setMensajeEstado('');

    try {
      const respuesta = await apiFetch('/api/simulacion/reglas-difusas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reglas),
      });

      const data = await respuesta.json();
      if (!respuesta.ok) {
        throw new Error(data?.error || 'No se pudieron guardar las reglas difusas globales.');
      }

      setReglas(data);
      setMensajeEstado('Reglas difusas globales actualizadas correctamente.');
    } catch (error) {
      setErrorEstado(error.message || 'Error al guardar reglas difusas globales.');
    } finally {
      setGuardando(false);
    }
  };

  const renderTrapecios = (grupo, titulo, lista) => (
    <section className="form-card reglas-editor-card">
      <h3 className="form-card-title">{titulo}</h3>
      <div className="form-card-content reglas-grid-trapecios">
        {lista.map((item) => (
          <div key={item.key} className="regla-card-mini">
            <div className="regla-card-mini-title">{item.label}</div>
            <div className="regla-card-mini-grid">
              {['a', 'b', 'c', 'd'].map((etiqueta, idx) => (
                <label key={etiqueta} className="regla-inline-input">
                  <span>{etiqueta}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={reglas?.[grupo]?.[item.key]?.[idx] ?? 0}
                    onChange={(event) => actualizarTrapecio(grupo, item.key, idx, event.target.value)}
                    className="form-card-input"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="App">
      <AppHeader />

      <main>
        <div className="reglas-main-superior">
          <h2 className="reglas-main-h2">Reglas Difusas de Simulacion</h2>
          <button type="button" className="btn-guardar" disabled={guardando || cargando || !reglas} onClick={handleGuardar}>
            {guardando ? 'Guardando...' : 'Guardar Reglas'}
          </button>
        </div>

        <p className="reglas-main-descripcion">
          Esta pantalla modifica reglas globales del motor de simulacion (no depende de embalse).
        </p>

        {mensajeEstado && <div className="embalse-ok-banner">{mensajeEstado}</div>}
        {errorEstado && <div className="embalse-error-banner">{errorEstado}</div>}

        {cargando ? (
          <section className="form-card reglas-editor-card">
            <div className="form-card-content">
              <p>Cargando reglas difusas globales...</p>
            </div>
          </section>
        ) : (
          <>
            {renderTrapecios('nivel', 'Pertenencia difusa de nivel (%)', TRAPS_NIVEL)}
            {renderTrapecios('entrada', 'Pertenencia difusa de caudal de entrada (m3/s)', TRAPS_ENTRADA)}

            <section className="form-card reglas-editor-card">
              <h3 className="form-card-title">Salidas por regla</h3>
              <div className="form-card-content reglas-grid-salidas">
                {REGLAS.map((regla) => {
                  const salida = reglas?.salidas?.[regla.key];
                  if (!salida) return null;

                  return (
                    <div key={regla.key} className="regla-card-mini">
                      <div className="regla-card-mini-title">{regla.label}</div>
                      <div className="regla-card-mini-grid regla-card-mini-grid--salida">
                        <label className="regla-inline-input regla-inline-input--full">
                          <span>Modo</span>
                          <select
                            className="form-card-input"
                            value={salida.modo}
                            onChange={(event) => actualizarSalida(regla.key, 'modo', event.target.value)}
                          >
                            <option value="max_factor">max(minimo, caudal*factor)</option>
                            <option value="fijo">fijo</option>
                          </select>
                        </label>

                        {salida.modo === 'fijo' ? (
                          <label className="regla-inline-input regla-inline-input--full">
                            <span>Valor fijo (m3/s)</span>
                            <input
                              type="number"
                              step="0.01"
                              className="form-card-input"
                              value={salida.fijo ?? 0}
                              onChange={(event) => actualizarSalida(regla.key, 'fijo', event.target.value)}
                            />
                          </label>
                        ) : (
                          <>
                            <label className="regla-inline-input">
                              <span>Minimo</span>
                              <input
                                type="number"
                                step="0.01"
                                className="form-card-input"
                                value={salida.minimo ?? 0}
                                onChange={(event) => actualizarSalida(regla.key, 'minimo', event.target.value)}
                              />
                            </label>
                            <label className="regla-inline-input">
                              <span>Factor</span>
                              <input
                                type="number"
                                step="0.01"
                                className="form-card-input"
                                value={salida.factor ?? 0}
                                onChange={(event) => actualizarSalida(regla.key, 'factor', event.target.value)}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="form-card reglas-editor-card">
              <h3 className="form-card-title">Fallback</h3>
              <div className="form-card-content">
                <div className="form-card-campo">
                  <span className="form-card-label">Caudal por defecto cuando no se activa ninguna regla (m3/s)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={reglas?.fallbackM3s ?? 0}
                    onChange={(event) => setReglas((prev) => ({ ...prev, fallbackM3s: parseNumero(event.target.value) }))}
                    className="form-card-input"
                  />
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <AppFooter />
    </div>
  );
}

export default ReglasDifusas;
