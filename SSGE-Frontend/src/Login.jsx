import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { apiFetch, getToken, setToken } from './lib/api';
import './styles/Login.css';

function InicioSesion({ modal = false }) {
  const navegar = useNavigate();
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  if (getToken()) {
    return <Navigate to="/" replace />;
  }

  const claseContenedor = modal
    ? 'inicio-sesion-pagina inicio-sesion-pagina--modal'
    : 'inicio-sesion-pagina';
  const claseTarjeta = modal
    ? 'inicio-sesion-tarjeta inicio-sesion-tarjeta--modal'
    : 'inicio-sesion-tarjeta';

  const manejarEnvio = async (evento) => {
    evento.preventDefault();
    setError('');
    setCargando(true);

    try {
      const respuesta = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: nombreUsuario, password: contrasena }),
      });

      const datos = await respuesta.json();
      if (!respuesta.ok) {
        throw new Error(datos?.error || 'No se pudo iniciar sesion');
      }

      if (!datos?.token) {
        throw new Error('Respuesta de login invalida');
      }

      setToken(datos.token);
      navegar('/', { replace: true });
      window.location.reload();
    } catch (errorCapturado) {
      setError(errorCapturado.message || 'Error al iniciar sesion');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className={claseContenedor}>
      {modal && <div className="inicio-sesion-fondo" aria-hidden="true" />}
      <div className="inicio-sesion-brillo-fondo inicio-sesion-brillo-fondo--superior" aria-hidden="true" />
      <div className="inicio-sesion-brillo-fondo inicio-sesion-brillo-fondo--inferior" aria-hidden="true" />

      <main className={claseTarjeta} role="main" aria-label="Formulario de acceso">
        <div className="inicio-sesion-marca">
          <img src="/Logo_blanco.png" alt="Logo SSGE" className="inicio-sesion-logo" />
          <div>
            <h1 className="inicio-sesion-titulo">SSGE</h1>
            <p className="inicio-sesion-subtitulo">Sistema de Simulacion y Gestion de Embalses</p>
          </div>
        </div>

        <form className="inicio-sesion-formulario" onSubmit={manejarEnvio}>
          <label className="inicio-sesion-campo">
            <span className="inicio-sesion-campo-etiqueta">Usuario</span>
            <span className="inicio-sesion-entrada-contenedor">
              <User size={16} aria-hidden="true" />
              <input
                type="text"
                value={nombreUsuario}
                onChange={(e) => setNombreUsuario(e.target.value)}
                placeholder="Escribe tu usuario"
                autoComplete="username"
                required
              />
            </span>
          </label>

          <label className="inicio-sesion-campo">
            <span className="inicio-sesion-campo-etiqueta">Contrasena</span>
            <span className="inicio-sesion-entrada-contenedor">
              <Lock size={16} aria-hidden="true" />
              <input
                type="password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="********"
                autoComplete="current-password"
                required
              />
            </span>
          </label>

          {error && <p className="inicio-sesion-error">{error}</p>}

          <button type="submit" className="inicio-sesion-boton" disabled={cargando}>
            {cargando ? 'Accediendo...' : 'Iniciar sesion'}
          </button>
        </form>
      </main>
    </div>
  );
}

export default InicioSesion;
