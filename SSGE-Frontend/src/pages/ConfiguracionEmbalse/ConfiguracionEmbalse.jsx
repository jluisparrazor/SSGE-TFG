import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppHeader from "../../components/AppHeader/AppHeader.jsx";
import AppFooter from "../../components/AppFooter/AppFooter.jsx";
import "./ConfiguracionEmbalse.css";
import { apiFetch } from "../../lib/api.js";

function ConfiguracionEmbalse() {
  const navigate = useNavigate();
  const [embalses, setEmbalses] = useState([]);
  const [cargandoEmbalses, setCargandoEmbalses] = useState(true);
  const [errorEmbalses, setErrorEmbalses] = useState("");
  const [embalseAEliminar, setEmbalseAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [lanzandoProduccion, setLanzandoProduccion] = useState(false);
  const [lanzandoHistoricoMes, setLanzandoHistoricoMes] = useState(false);
  const [mensajeIngesta, setMensajeIngesta] = useState("");
  const [errorIngesta, setErrorIngesta] = useState("");

  const lanzarTareaIngesta = async (tarea) => {
    setMensajeIngesta("");
    setErrorIngesta("");

    const res = await apiFetch('/api/admin/ingesta/ejecutar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tarea })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || 'No se pudo lanzar la tarea');
    }

    setMensajeIngesta(data?.mensaje || 'Tarea lanzada correctamente');
  };

  const manejarLanzarProduccion = async () => {
    setLanzandoProduccion(true);
    try {
      await lanzarTareaIngesta('produccion');
    } catch (error) {
      setErrorIngesta(error.message || 'Error lanzando scraper de produccion');
    } finally {
      setLanzandoProduccion(false);
    }
  };

  const manejarLanzarHistoricoMesSinSobrescribir = async () => {
    setLanzandoHistoricoMes(true);
    try {
      await lanzarTareaIngesta('poblar_historico_mes_sin_sobrescribir');
    } catch (error) {
      setErrorIngesta(error.message || 'Error lanzando poblado historico mensual');
    } finally {
      setLanzandoHistoricoMes(false);
    }
  };

  const handleEliminarEmbalse = async (embalse) => {
    setEmbalseAEliminar(embalse);
  };

  const handleToggleActivo = async (embalseId, estadoActual) => {
    try {
        const nuevoEstado = !estadoActual;
        const res = await apiFetch(`/api/embalses/${embalseId}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: nuevoEstado })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Error al cambiar el estado');
        }

        setEmbalses(embalses.map(emb => 
            emb.id === embalseId ? { ...emb, activo: nuevoEstado } : emb
        ));
    } catch (error) {
        console.error("Error al cambiar estado:", error);
        alert(error.message);
    }
  };

  const confirmarEliminar = async () => {
    if (!embalseAEliminar) return;
    
    setEliminando(true);
    try {
        const res = await apiFetch(`/api/embalses/${embalseAEliminar.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'Error al eliminar');
        }

    setEmbalses((prev) => prev.filter((e) => e.id !== embalseAEliminar.id));
        setEmbalseAEliminar(null);
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        setEliminando(false);
    }
  };

  const cancelarEliminar = () => {
    setEmbalseAEliminar(null);
  };

  useEffect(() => {
    const cargarEmbalses = async () => {
      try {
        setCargandoEmbalses(true);
        setErrorEmbalses("");

        const res = await apiFetch('/api/embalses');
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "No se pudieron cargar los embalses");
        }

        setEmbalses(Array.isArray(data) ? data : []);
      } catch (error) {
        setErrorEmbalses(error.message || "Error cargando embalses");
      } finally {
        setCargandoEmbalses(false);
      }
    };

    cargarEmbalses();
  }, []);

  return (
    <div className="App">
      <AppHeader />

      <main>
        <div className="config-main-superior">
            <h2 className="config-main-h2">Configuración Embalse</h2>
            <div className="config-acciones-ingesta">
              <button
                type="button"
                className="btn-guardar"
                onClick={manejarLanzarProduccion}
                disabled={lanzandoProduccion || lanzandoHistoricoMes}
              >
                {lanzandoProduccion ? 'Lanzando...' : 'Lanzar scraper produccion'}
              </button>
              <button
                type="button"
                className="btn-guardar"
                onClick={manejarLanzarHistoricoMesSinSobrescribir}
                disabled={lanzandoProduccion || lanzandoHistoricoMes}
              >
                {lanzandoHistoricoMes ? 'Lanzando...' : 'Lanzar poblar_historico_mes_sin_sobrescribir'}
              </button>
            </div>
        </div>

        {mensajeIngesta && (
            <div className="embalse-ok-banner">{mensajeIngesta}</div>
        )}

        {errorIngesta && (
            <div className="embalse-error-banner">{errorIngesta}</div>
        )}

        {errorEmbalses && (
            <div className="embalse-error-banner">{errorEmbalses}</div>
        )}

        {embalseAEliminar && (
          <div className="modal-overlay" onClick={cancelarEliminar}>
            <div className="modal-contenido config-embalse-modal" onClick={(e) => e.stopPropagation()}>
              <h2 className="modal-titulo">Eliminar embalse</h2>
              <p className="modal-texto">
                Vas a eliminar <strong>{embalseAEliminar.nombre}</strong>. ¿Estás seguro?
              </p>
              <div className="modal-botones">
                <button
                  type="button"
                  className="modal-boton-cancelar"
                  onClick={cancelarEliminar}
                  disabled={eliminando}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="modal-boton-eliminar"
                  onClick={confirmarEliminar}
                  disabled={eliminando}
                >
                  {eliminando ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="config-embalse-grid">
          <section className="form-card config-embalse-full">
            <div className="config-embalse-header">
              <h3 className="form-card-title config-embalse-title">Embalses registrados</h3>
              <button
                type="button"
                className="btn-guardar"
                onClick={() => navigate("/aniadir-embalse")}
              >
                Nuevo embalse
              </button>
            </div>

            {cargandoEmbalses ? (
              <p>Cargando embalses...</p>
            ) : embalses.length === 0 ? (
              <p>No hay embalses registrados.</p>
            ) : (
              <div className="config-embalse-list">
                {embalses.map((embalse) => (
                  <div 
                    key={embalse.id} 
                    className={`config-embalse-item ${!embalse.activo ? 'config-embalse-item--desactivado' : ''}`}
                  >
                    <div className="config-embalse-name">
                      {embalse.nombre} {!embalse.activo && '(Desactivado)'}
                    </div>
                    
                    <button 
                      className={`config-embalse-toggle-btn ${!embalse.activo ? 'config-embalse-toggle-btn--inactivo' : ''}`}
                      onClick={() => handleToggleActivo(embalse.id, embalse.activo)}
                    >
                      {embalse.activo ? 'Desactivar' : 'Activar'}
                    </button>

                    <button
                      type="button"
                      className="btn-guardar config-embalse-rules-btn"
                      onClick={() => navigate('/reglas-difusas')}
                    >
                      Reglas Globales
                    </button>
                    <button
                        type="button"
                        className="btn-guardar config-embalse-edit-btn"
                        onClick={() => navigate(`/aniadir-embalse?id=${embalse.id}`)}
                    >
                        Editar
                    </button>
                    <button
                        type="button"
                        className="config-embalse-delete-btn"
                        onClick={() => handleEliminarEmbalse(embalse)}
                        disabled={eliminando}
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <AppFooter lastUpdate="--/--/-- --:--" />
    </div>
  );
}

export default ConfiguracionEmbalse;