import { useEffect, useState } from 'react';
import AppHeader from '../../components/AppHeader/AppHeader.jsx';
import AppFooter from '../../components/AppFooter/AppFooter.jsx';
import { apiFetch } from '../../lib/api.js';
import './AuditoriaGlobal.css';

function AuditoriaGlobal() {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Estados para los filtros
  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    nivel: '',
    usuario: ''
  });

  const cargarAuditoria = async () => {
    try {
      setCargando(true);
      setError('');

      // Construir query string dinámicamente
      const queryParams = new URLSearchParams();
      if (filtros.fechaInicio) queryParams.append('fechaInicio', filtros.fechaInicio);
      if (filtros.fechaFin) queryParams.append('fechaFin', filtros.fechaFin);
      if (filtros.nivel) queryParams.append('nivel', filtros.nivel);
      if (filtros.usuario) queryParams.append('usuario', filtros.usuario);

      const res = await apiFetch(`/api/auditoria?${queryParams.toString()}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || 'Error al cargar los registros');

      setRegistros(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Error de conexión');
      setRegistros([]);
    } finally {
      setCargando(false);
    }
  };

  // Cargar datos al montar y cada vez que cambien los filtros
  useEffect(() => {
    // Creamos un temporizador de 500 milisegundos
    const temporizador = setTimeout(() => {
      cargarAuditoria();
    }, 500);

    // Si el usuario escribe otra letra antes de los 500ms, cancelamos el temporizador anterior
    return () => clearTimeout(temporizador);
  }, [filtros]);

  const handleFiltroChange = (e) => {
    const { name, value } = e.target;
    setFiltros(prev => ({ ...prev, [name]: value }));
  };

  const limpiarFiltros = () => {
    setFiltros({ fechaInicio: '', fechaFin: '', nivel: '', usuario: '' });
  };

  return (
    <div className="App">
      <AppHeader />
      <main className="auditoria-main">
        <div className="main-superior">
          <h2 className="main-h2">Registro Global de Auditoría</h2>
        </div>

        {/* Panel de Filtros */}
        <section className="auditoria-filtros-card">
          <h3 className="auditoria-card-title">Filtros de Búsqueda</h3>
          <div className="auditoria-filtros-grid">
            <label className="auditoria-field">
              <span>Desde fecha:</span>
              <input 
                type="date" 
                name="fechaInicio"
                value={filtros.fechaInicio} 
                onChange={handleFiltroChange} 
                className="auditoria-input"
              />
            </label>
            <label className="auditoria-field">
              <span>Hasta fecha:</span>
              <input 
                type="date" 
                name="fechaFin"
                value={filtros.fechaFin} 
                onChange={handleFiltroChange} 
                className="auditoria-input"
              />
            </label>
            <label className="auditoria-field">
              <span>Nivel de Evento:</span>
              <select 
                name="nivel" 
                value={filtros.nivel} 
                onChange={handleFiltroChange} 
                className="auditoria-input"
              >
                <option value="">Todos</option>
                <option value="INFO">Información (Éxito)</option>
                <option value="ERROR">Errores (Fallo)</option>
              </select>
            </label>
            <label className="auditoria-field">
              <span>Usuario:</span>
              <input 
                type="text" 
                name="usuario"
                value={filtros.usuario} 
                onChange={handleFiltroChange} 
                className="auditoria-input"
                placeholder="Ej. admin"
              />
            </label>
            <button className="btn-limpiar" onClick={limpiarFiltros}>
              Limpiar Filtros
            </button>
          </div>
        </section>

        {error && <div className="error-banner">{error}</div>}

        {/* Tabla de Registros */}
        <section className="auditoria-tabla-card">
          <h3 className="auditoria-card-title">Historial de Eventos</h3>
          {cargando ? (
            <p>Cargando registros...</p>
          ) : registros.length === 0 ? (
            <p>No se encontraron eventos con estos filtros.</p>
          ) : (
            <div className="auditoria-table-wrap">
              <table className="auditoria-table">
                <thead>
                  <tr>
                    <th>Fecha y Hora</th>
                    <th>Estado</th>
                    <th>Método / Origen</th>
                    <th>Endpoint</th>
                    <th>Usuario (Actor)</th>
                    <th>Detalle Interno</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(reg => (
                    <tr key={reg.id}>
                      <td>{new Date(reg.fechaHora).toLocaleString('es-ES')}</td>
                      <td>
                        <span className={`badge-estado ${reg.estadoHttp >= 400 ? 'badge-error' : 'badge-info'}`}>
                          {reg.estadoHttp}
                        </span>
                      </td>
                      <td>{reg.metodo}</td>
                      <td>{reg.endpoint}</td>
                      <td>{reg.actorUsername || 'Sistema/Anónimo'}</td>
                      <td className="auditoria-detalle-cell">
                        {reg.detalle}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      <AppFooter lastUpdate="--/--/-- --:--" />
    </div>
  );
}

export default AuditoriaGlobal;