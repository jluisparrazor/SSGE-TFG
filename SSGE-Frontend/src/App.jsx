import { useEffect, useState, useRef, use } from 'react'
import { io } from 'socket.io-client';
import { Thermometer, CloudRain, Waves, TriangleAlert, ArrowRightFromLine, CheckCircle} from 'lucide-react';
import {LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Line} from 'recharts';

import EmbalseInfografia from './components/EmbalseInfografia'
import PanelNivelAguaHistorico from './components/PanelNivelAguaHistorico';
import AppHeader from './components/AppHeader';
import AppFooter from './components/AppFooter';
import "./styles/App.css";

const socket = io('http://localhost:3000');

function App() {

  const [embalses, setEmbalses] = useState([]);

  const [ultimasAlertas, setUltimasAlertas] = useState([]);

  // Para mantener el embalse seleccionado al recargar la página, hago uso de localStorage
  const [embalseSeleccionadoId, setEmbalseSeleccionadoId] = useState(() => {
    try {
      return localStorage.getItem('embalseSeleccionadoId') || '';
    }
    catch (error) {
      console.error('Error accediendo a localStorage:', error);
      return '';
    }
  });

  // Este estado se actualizará con los datos reales que lleguen del backend a través de Socket.IO. Por ahora, se inicializa con valores de ejemplo.
  const [datoActual, setDatoActual] = useState({
    nivel: 0,
    porcentaje: 0,
    volumen: 0,
    temperatura: 0,
    precipitacion: 0,
    caudalEntrada: 0,
    caudalSalida: 0,
    cotaMaximaM: 960,
    cotaMinimaM: 900,
    timestamp: '--/--/-- --:--'
  })

  const [refreshHitoricoToken, setRefreshHistoricoToken] = useState(0); // Este estado se usará para forzar la actualización del gráfico histórico cuando llegue un nuevo dato actual.
  const syncTimeoutRef = useRef(null); // Ref para almacenar el timeout de sincronización horaria.
  const embalseSeleccionado = embalses.find((emb) => String(emb.id) === String(embalseSeleccionadoId)) || null;
  const embalseTiempoRealId = embalses.length > 0 ? embalses[0].id : null; // Para la demo, se toma el primer embalse como el que muestra datos en tiempo real. Esto se cambiará cuando se integre el selector de embalse.
  const capacidadMaxima = embalseSeleccionado?.capacidadHm3 || 70.8;
  const [cargandoEmbalses, setCargandoEmbalses] = useState(true);
  const [errorEmbalses, setErrorEmbalses] = useState('');

  // Función para procesar la cadena de fecha que llega del backend y convertirla a timestamp. El formato esperado es "dd/MM/yy-HH:mm".
  const procesarDateStr = (dateStr) => {
    if(!dateStr || !dateStr.includes('-')) return 0;
    const [datePart, timePart] = dateStr.split('-');
    const [dia, mes, anio] = datePart.split('/');
    const [hora, min] = timePart.split(':');
    return new Date(parseInt(anio)+2000, parseInt(mes) - 1, parseInt(dia), parseInt(hora), parseInt(min), 0, 0).getTime();
  };

  // Función para procesar el dato bruto que llega del backend y convertirlo a un formato más manejable para la aplicación. Se encarga de extraer los valores numéricos de las mediciones, calcular el porcentaje de llenado, y parsear el timestamp.
  const procesarDatoBruto = (dato) => {
    const medicionesCrudas = dato?.mediciones || {};

    const parsearNumero = (valor) => {
      if (valor === null || valor === undefined) return null;
      if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
      if (typeof valor === 'string') {
        const limpio = valor.trim();
        if (!limpio) return null;
        const num = parseFloat(limpio.replace(',', '.'));
        return Number.isFinite(num) ? num : null;
      }
      return null;
    };

    // Función para extraer un número de las mediciones crudas, probando varias claves posibles. Devuelve el primer número válido que encuentra o null si no encuentra ninguno.
    const extraerNumero = (...claves ) => {
      for (const clave of claves) {
        if (!Object.prototype.hasOwnProperty.call(medicionesCrudas, clave)) continue;
        const num = parsearNumero(medicionesCrudas[clave]);
        if (num !== null) return num;
      }
      return null;
    };

    // Función para parsear el timestamp que llega del backend, que puede estar en formato ISO o en formato "dd/MM/yy-HH:mm".
    const parsearTimestampSocket = (valorTimestamp) => {
      if (!valorTimestamp) return null;

      const fechaDirecta = new Date(valorTimestamp);
      if (!Number.isNaN(fechaDirecta.getTime())) {
        return fechaDirecta.getTime();
      }

      const match = valorTimestamp.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[,\-]\s*(\d{1,2}):(\d{2})$/);
      if (!match) return null;

      const [, d, m, y, h, min] = match;
      const anio = y.length === 2 ? Number(`20${y}`) : Number(y);
      const fecha = new Date(anio, Number(m) - 1, Number(d), Number(h), Number(min));
      return Number.isNaN(fecha.getTime()) ? null : fecha.getTime();
    };

    const volumen = extraerNumero('VOLUMEN EMBALSADO (hm³)', 'volumen');
    const porcentajeCalc = volumen !== null ? Math.min(100, Number(((volumen / capacidadMaxima) * 100).toFixed(1))) : null;

    return {
      timestamp: parsearTimestampSocket(dato?.timestamp),
      nivel: extraerNumero('NIVEL (m.s.n.m.)', 'nivel'),
      porcentaje: porcentajeCalc,
      volumen: volumen,
      caudalEntrada: extraerNumero('CAUDAL DE ENTRADA (m³/s)', 'caudal_entrada'),
      caudalSalida: extraerNumero('CAUDAL DE SALIDA (m³/s)', 'caudal_salida'),
      temperatura: extraerNumero('TEMPERATURA (°C)', 'temperatura'),
      precipitacion: extraerNumero('PRECIPITACIÓN (mm)', 'precipitacion'),
      cotaMaximaM: parsearNumero(dato?.cotaMaximaM),
      cotaMinimaM: parsearNumero(dato?.cotaMinimaM)
    };
  };

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

  // Guardar el embalse seleccionado en localStorage cada vez que cambie, para mantener la selección al recargar la página.
  useEffect(() => {
    if (!embalseSeleccionadoId) return;
    try {
      localStorage.setItem('embalseSeleccionadoId', String(embalseSeleccionadoId));
    } catch (error) {
      console.error('No se pudo guardar embalseSeleccionadoId:', error);
    }
  }, [embalseSeleccionadoId]);

  useEffect(() => {
    const cargarDatosIniciales = async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/mediciones?rango=dia&embalseId=${embalseSeleccionadoId}&limite=4`);
        if (!res.ok) throw new Error(`Error al cargar datos iniciales: ${res.statusText}`);

        let historial = await res.json();
        if (historial.length > 0) {
          historial.sort((a, b) => parseoDateStr(b.timestamp) - parseoDateStr(a.timestamp));
          const ult = historial[0];
          const porcentajeCalc = Number(((ult.volumen / capacidadMaxima) * 100).toFixed(1));

          setDatoActual({
            ...ult,
            porcentaje: porcentajeCalc || 0,
            caudalEntrada: ult.caudalEntrada || 0,
            caudalSalida: ult.caudalSalida || 0,
            temperatura: ult.temperatura || 0,
            precipitacion: ult.precipitacion || 0,
            cotaMaximaM: ult.cotaMaximaM || 960,
            cotaMinimaM: ult.cotaMinimaM || 900,
            timestamp: ult.timestamp || '--/--/-- --:--',
          });
        } else {
          setDatoActual((prev) => ({ 
            ...prev,
            porcentaje: 0,
            volumen: 0,
            nivel: embalseSeleccionado?.cotaMinimaM ?? prev.nivel,
            caudalEntrada: 0,
            caudalSalida: 0,
            temperatura: 0,
            precipitacion: 0,
            cotaMaximaM: embalseSeleccionado?.cotaMaximaM ?? 960,
            cotaMinimaM: embalseSeleccionado?.cotaMinimaM ?? 900,
            timestamp: '--/--/-- --:--' }));
        }
      } catch (error) {
        console.error('Error cargando datos iniciales:', error);
      }
    };
    
    cargarDatosIniciales();
  }, [embalseSeleccionadoId, capacidadMaxima, embalseSeleccionado?.cotaMaximaM, embalseSeleccionado?.cotaMinimaM]);

  useEffect(() => {
    const manejadorSocket = (payload) => {
      const payloadEmbalseId = Number(payload?.embalseId);
      const hayEmbalseEnPayload = Number.isFinite(payloadEmbalseId);
      const embalseObjetivoId = hayEmbalseEnPayload ? payloadEmbalseId : Number(embalseSeleccionadoId);

      // Si el evento indica embalse explícito, solo actualizamos si coincide con el seleccionado.
      if (hayEmbalseEnPayload && Number(embalseSeleccionadoId) !== payloadEmbalseId) {
        return;
      }

      // Compatibilidad con payloads antiguos sin embalseId.
      if (!hayEmbalseEnPayload && (!embalseSeleccionadoId || Number(embalseSeleccionadoId) !== Number(embalseTiempoRealId))) {
        return;
      }

      const nuevoEstado = procesarDatoBruto(payload);
      setDatoActual((prev) => ({
        ...prev,
        timestamp: nuevoEstado.timestamp ?? prev.timestamp,
        timestampNum: nuevoEstado.timestampNum ?? prev.timestampNum,
        nivel: nuevoEstado.nivel ?? prev.nivel,
        volumen: nuevoEstado.volumen ?? prev.volumen,
        precipitacion: nuevoEstado.precipitacion ?? prev.precipitacion,
        temperatura: nuevoEstado.temperatura ?? prev.temperatura,
        caudalEntrada: nuevoEstado.caudalEntrada ?? prev.caudalEntrada,
        caudalSalida: nuevoEstado.caudalSalida ?? prev.caudalSalida,
        porcentaje: nuevoEstado.porcentaje ?? prev.porcentaje,
        cotaMaximaM: nuevoEstado.cotaMaximaM ?? prev.cotaMaximaM,
        cotaMinimaM: nuevoEstado.cotaMinimaM ?? prev.cotaMinimaM
      }));

      // Fuerza recarga de la gráfica histórica tras cada medición nueva.
      setRefreshHistoricoToken((prev) => prev + 1);

      // Reconciliación: refresca desde BD para aplicar la misma lógica que en recarga manual (LOCF, etc.).
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = setTimeout(async () => {
        try {
          if (!embalseObjetivoId) return;

          const res = await fetch(`http://localhost:3000/api/mediciones?rango=dia&embalseId=${embalseObjetivoId}&limite=1`);
          if (!res.ok) return;

          const historial = await res.json();
          if (!Array.isArray(historial) || historial.length === 0) return;

          const ultimo = historial[0];
          const porcentajeCalc = Number(((ultimo.volumen / capacidadMaxima) * 100).toFixed(1));

          setDatoActual((prev) => ({
            ...prev,
            ...ultimo,
            porcentaje: porcentajeCalc > 100 ? 100 : porcentajeCalc,
            caudalEntrada: ultimo.caudalEntrada || 0,
            caudalSalida: ultimo.caudalSalida || 0,
            temperatura: ultimo.temperatura || 0,
            cotaMaximaM: ultimo.cotaMaximaM ?? prev.cotaMaximaM,
            cotaMinimaM: ultimo.cotaMinimaM ?? prev.cotaMinimaM,
            timestampNum: parseoDateStr(ultimo.timestamp)
          }));
        } catch (_error) {
          // Si falla esta reconciliación, mantenemos el dato en vivo y esperamos el siguiente ciclo.
        }
      }, 300);
    };

    socket.on('actualizar_dashboard', manejadorSocket);
    return () => {
      socket.off('actualizar_dashboard', manejadorSocket);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [embalseSeleccionadoId, embalseTiempoRealId, capacidadMaxima]);

  useEffect(() => {
    const cargarAlertas = async () => {
      if (!embalseSeleccionadoId) {
        setUltimasAlertas([]);
        return;
      }

      try {
        const res = await fetch(`http://localhost:3000/api/historial-simulacion?embalseId=${embalseSeleccionadoId}&limite=4`);
        if (!res.ok) {
          throw new Error('Error al cargar las alertas');
        }
        const data = await res.json();
        setUltimasAlertas(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error al cargar las alertas:', error);
        setUltimasAlertas([]);
      }
    };

    cargarAlertas();

    const  interval = setInterval(cargarAlertas, 60000);
    return () => clearInterval(interval);
  }, [embalseSeleccionadoId]);

  const parseoDateStr = (dateStr) => {
    if(!dateStr || !dateStr.includes('-')) return 0;
    const [datePart, timePart] = dateStr.split('-');
    const [dia, mes, anio] = datePart.split('/');
    const [hora, min] = timePart.split(':');
    return new Date(parseInt(anio)+2000, parseInt(mes)-1, parseInt(dia), parseInt(hora), parseInt(min), 0, 0).getTime();
  };

  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);

  const toggleMenuUsuario = () => {
    setMenuUsuarioAbierto((prev) => !prev);
  };

  return (
    <div className="App">

      <AppHeader />

      <main>
        <div className='main-superior'>
          <h2 className='main-h2'>Panel General</h2>
          <div className="embalse-selector-wrap">
            <label htmlFor="selector-embalse" className='embalse-selector-label'>
              Embalse
            </label>
            <select
              id="selector-embalse"
              className="embalse-selector"
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
          </div>
        </div>

        {errorEmbalses && (
          <div className="embalse-error-banner"> 
            {errorEmbalses}
          </div>
        )}

        <div className="app-dashboard-grid">

          {/* 1. Infografía */}
          <EmbalseInfografia
            datoActual={datoActual}
            embalseNombre={embalseSeleccionado?.nombre || 'Embalse'}
            compuertas={embalseSeleccionado?.compuertas || []}
          />

          {/* 2. Nivel Actual del Agua */}
          <div className="nivel-agua-card">
            <h3 className="nivel-agua-title">Nivel Actual del Agua</h3>
            <div className="nivel-agua-content">
              <div>
                <p className="nivel-agua-label">Porcentaje:</p>
                <p className="nivel-agua-value">
                 {datoActual.porcentaje} <span className="nivel-agua-unit">%</span>
                </p>
              </div>
              <div>
                <p className="nivel-agua-label">Volumen:</p>
                <p className="nivel-agua-value">
                  {datoActual.volumen} <span className="nivel-agua-unit">hm³</span>
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
                <span className="sensor-value">{datoActual.temperatura} °C</span>
              </li>

              <li className="sensor-item">
                <span className="sensor-label">
                  <CloudRain size={25} className="sensor-icon" />
                  Precipitación
                </span>
                <span className="sensor-value">{datoActual.precipitacion} l/m²</span>
              </li>

              <li className="sensor-item">
                <span className="sensor-label">
                  <Waves size={25} className="sensor-icon" />
                  Caudal Entrada
                </span>
                <span className="sensor-value">{datoActual.caudalEntrada} m³/s</span>
              </li>

              <li className="sensor-item">
                <span className="sensor-label">
                  <ArrowRightFromLine size={25} className="sensor-icon" />
                  Caudal Salida
                </span>
                <span className="sensor-value">{datoActual.caudalSalida} m³/s</span>
              </li>
            </ul>
          </div>

          {/* 4. Historico de Evolución */}
          <PanelNivelAguaHistorico
            cotaMin={datoActual.cotaMaximaM ?? 960}
            cotaMax={datoActual.cotaMinimaM ?? 900}
            embalseId={embalseSeleccionadoId}
            refreshToken={refreshHitoricoToken}
          />

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

      <AppFooter lastUpdate={datoActual.timestamp} />
    </div>
  )
}

export default App
