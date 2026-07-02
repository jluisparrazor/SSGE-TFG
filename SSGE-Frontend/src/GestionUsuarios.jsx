import { useEffect, useMemo, useState } from 'react';
import AppHeader from './components/AppHeader.jsx';
import AppFooter from './components/AppFooter.jsx';
import { apiFetch, getCurrentRole } from './lib/api';
import './styles/GestionUsuarios.css';

const ROLES = ['ADMIN', 'OPERADOR', 'VISUALIZADOR', 'INGESTA'];

function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardandoId, setGuardandoId] = useState(null);
  const [creando, setCreando] = useState(false);
  const [editandoPasswordId, setEditandoPasswordId] = useState(null);
  const [passwordTemporal, setPasswordTemporal] = useState('');

  const [nuevo, setNuevo] = useState({
    username: '',
    password: '',
    rol: 'OPERADOR',
    activo: true,
  });

  const esAdmin = useMemo(() => getCurrentRole() === 'ADMIN', []);

  const cargarUsuarios = async () => {
    try {
      setCargando(true);
      setError('');

      const res = await apiFetch('/api/admin/usuarios');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudieron cargar los usuarios');
      }

      setUsuarios(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Error cargando usuarios');
      setUsuarios([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!esAdmin) {
      setError('Acceso restringido a administradores');
      setCargando(false);
      return;
    }

    cargarUsuarios();
  }, [esAdmin]);

  const actualizarCampo = (id, campo, valor) => {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, [campo]: valor } : u)));
  };

  const guardarUsuario = async (usuario) => {
    setGuardandoId(usuario.id);
    try {
      const passwordPendiente = editandoPasswordId === usuario.id ? String(passwordTemporal || '').trim() : '';
      const res = await apiFetch(`/api/admin/usuarios/${usuario.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usuario.username,
          rol: usuario.rol,
          activo: usuario.activo,
          ...(passwordPendiente ? { password: passwordPendiente } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo actualizar');
      }

      setUsuarios((prev) => prev.map((u) => (u.id === usuario.id ? data : u)));
      if (editandoPasswordId === usuario.id) {
        setEditandoPasswordId(null);
        setPasswordTemporal('');
      }
    } catch (err) {
      alert(err.message || 'Error al actualizar usuario');
    } finally {
      setGuardandoId(null);
    }
  };

  const abrirEditorPassword = (usuario) => {
    setEditandoPasswordId(usuario.id);
    setPasswordTemporal('');
  };

  const cancelarEditorPassword = () => {
    setEditandoPasswordId(null);
    setPasswordTemporal('');
  };

  const crearUsuario = async () => {
    if (!nuevo.username.trim() || !nuevo.password) {
      alert('Username y contraseña son obligatorios');
      return;
    }

    setCreando(true);
    try {
      const res = await apiFetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevo),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo crear usuario');
      }

      setUsuarios((prev) => [...prev, data]);
      setNuevo({ username: '', password: '', rol: 'OPERADOR', activo: true });
    } catch (err) {
      alert(err.message || 'Error al crear usuario');
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="App">
      <AppHeader />

      <main className="usuarios-page-main">
        <div className="main-superior">
          <h2 className="main-h2">Gestión de Usuarios</h2>
        </div>

        {error && <div className="embalse-error-banner">{error}</div>}

        <div className="usuarios-layout">
          <section className="usuarios-card usuarios-card-create">
            <h3 className="usuarios-title">Crear usuario</h3>
            <div className="usuarios-create-grid">
              <label className="usuarios-form-field">
                <span className="usuarios-field-label">Username</span>
                <input
                  className="usuarios-input"
                  placeholder="Escribe el username"
                  value={nuevo.username}
                  onChange={(e) => setNuevo((prev) => ({ ...prev, username: e.target.value }))}
                  disabled={creando || !esAdmin}
                />
              </label>

              <label className="usuarios-form-field">
                <span className="usuarios-field-label">Password</span>
                <input
                  className="usuarios-input"
                  placeholder="Escribe la contraseña"
                  type="password"
                  value={nuevo.password}
                  onChange={(e) => setNuevo((prev) => ({ ...prev, password: e.target.value }))}
                  disabled={creando || !esAdmin}
                />
              </label>

              <label className="usuarios-form-field">
                <span className="usuarios-field-label">Rol</span>
                <select
                  className="usuarios-input"
                  value={nuevo.rol}
                  onChange={(e) => setNuevo((prev) => ({ ...prev, rol: e.target.value }))}
                  disabled={creando || !esAdmin}
                >
                  {ROLES.map((rol) => (
                    <option key={rol} value={rol}>{rol}</option>
                  ))}
                </select>
              </label>

              <label className="usuarios-form-field usuarios-form-field--switch">
                <span className="usuarios-field-label">Activo</span>
                <span className="usuarios-switch">
                  <span className="usuarios-switch-control">
                    <input
                      type="checkbox"
                      checked={nuevo.activo}
                      onChange={(e) => setNuevo((prev) => ({ ...prev, activo: e.target.checked }))}
                      disabled={creando || !esAdmin}
                    />
                    <span className="usuarios-switch-slider" />
                  </span>
                  <span className="usuarios-switch-text">{nuevo.activo ? 'Sí' : 'No'}</span>
                </span>
              </label>

              <button className="btn-guardar" onClick={crearUsuario} disabled={creando || !esAdmin}>
                {creando ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </section>

          <section className="usuarios-card usuarios-card-list">
            <h3 className="usuarios-title">Usuarios existentes</h3>

            {cargando ? (
              <p>Cargando usuarios...</p>
            ) : usuarios.length === 0 ? (
              <p>No hay usuarios.</p>
            ) : (
              <div className="usuarios-table-wrap">
                <table className="usuarios-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Username</th>
                      <th>Rol</th>
                      <th>Activo</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((usuario) => (
                      <tr key={usuario.id}>
                        <td>{usuario.id}</td>
                        <td>
                          <input
                            className="usuarios-input"
                            value={usuario.username}
                            onChange={(e) => actualizarCampo(usuario.id, 'username', e.target.value)}
                            disabled={!esAdmin || guardandoId === usuario.id}
                          />
                        </td>
                        <td>
                          <select
                            className="usuarios-input"
                            value={usuario.rol}
                            onChange={(e) => actualizarCampo(usuario.id, 'rol', e.target.value)}
                            disabled={!esAdmin || guardandoId === usuario.id}
                          >
                            {ROLES.map((rol) => (
                              <option key={rol} value={rol}>{rol}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <label className="usuarios-switch usuarios-switch-inline">
                            <span className="usuarios-switch-control">
                              <input
                                type="checkbox"
                                checked={Boolean(usuario.activo)}
                                onChange={(e) => actualizarCampo(usuario.id, 'activo', e.target.checked)}
                                disabled={!esAdmin || guardandoId === usuario.id}
                              />
                              <span className="usuarios-switch-slider" />
                            </span>
                            <span className="usuarios-switch-text">{usuario.activo ? 'Sí' : 'No'}</span>
                          </label>
                        </td>
                        <td className="usuarios-actions">
                          {editandoPasswordId === usuario.id ? (
                            <div className="usuarios-password-editor">
                              <input
                                className="usuarios-input usuarios-password-input"
                                type="password"
                                value={passwordTemporal}
                                onChange={(e) => setPasswordTemporal(e.target.value)}
                                placeholder="Nueva clave"
                                disabled={!esAdmin || guardandoId === usuario.id}
                              />
                              <button
                                type="button"
                                className="usuarios-password-cancel"
                                onClick={cancelarEditorPassword}
                                disabled={!esAdmin || guardandoId === usuario.id}
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn-guardar"
                              onClick={() => abrirEditorPassword(usuario)}
                              disabled={!esAdmin || guardandoId === usuario.id}
                            >
                              Cambiar clave
                            </button>
                          )}

                          <button
                            className="btn-guardar"
                            onClick={() => guardarUsuario(usuario)}
                            disabled={!esAdmin || guardandoId === usuario.id}
                          >
                            {guardandoId === usuario.id ? 'Guardando...' : 'Guardar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      <AppFooter lastUpdate="--/--/-- --:--" />
    </div>
  );
}

export default GestionUsuarios;
