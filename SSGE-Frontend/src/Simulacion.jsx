import { useEffect, useState } from 'react';
import {Activity, AlertTriangle, CalendarRange, Droplets, Gauge, History, Play, Waves, Download, Trash2, Eye, EyeOff, Pause} from 'lucide-react';
import {CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer,Tooltip,XAxis, YAxis,} from 'recharts';
import AppHeader from './components/AppHeader.jsx';
import AppFooter from './components/AppFooter.jsx';
import EmbalseInfografia from './components/EmbalseInfografia.jsx';
import { apiFetch } from './lib/api';
import './styles/Simulacion.css';

const DURACIONES = [
  { etiqueta: '6 horas', minutos: 360 },
  { etiqueta: '24 horas', minutos: 1440 },
  { etiqueta: '72 horas', minutos: 4320 },
  { etiqueta: '1 semana', minutos: 10080 },
  { etiqueta: '1 mes', minutos: 43200 },
];

const MESES = [
  { valor: 1, etiqueta: 'Enero' },
  { valor: 2, etiqueta: 'Febrero' },
  { valor: 3, etiqueta: 'Marzo' },
  { valor: 4, etiqueta: 'Abril' },
  { valor: 5, etiqueta: 'Mayo' },
  { valor: 6, etiqueta: 'Junio' },
  { valor: 7, etiqueta: 'Julio' },
  { valor: 8, etiqueta: 'Agosto' },
  { valor: 9, etiqueta: 'Septiembre' },
  { valor: 10, etiqueta: 'Octubre' },
  { valor: 11, etiqueta: 'Noviembre' },
  { valor: 12, etiqueta: 'Diciembre' },
];

function parsearTimestampBackend(texto) {
  if (!texto || typeof texto !== 'string') return null;

  if (texto.includes('T')) {
    const fechaIso = new Date(texto);
    return Number.isNaN(fechaIso.getTime()) ? null : fechaIso;
  }

  const match = texto.match(/^(\d{2})\/(\d{2})\/(\d{2})-(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, dd, mm, yy, hh, min] = match;
  const fecha = new Date(
    Number(`20${yy}`),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    0,
    0
  );

  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function formatearFecha(fechaTexto) {
  const fecha = parsearTimestampBackend(fechaTexto);
  if (!fecha) return fechaTexto || '--/--/-- --:--';

  return fecha.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatearFechaGrafica(timestampTexto) {
  if (!timestampTexto) return '';
  const fecha = parsearTimestampBackend(timestampTexto);
  if (!fecha || Number.isNaN(fecha.getTime())) return timestampTexto;

  return fecha.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatearNumero(valor, decimales = 2) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '--';
  return numero.toFixed(decimales);
}

function normalizarRiesgo(riesgo) {
  const valor = String(riesgo || '').toLowerCase();

  if (valor === 'emergencia') return 'emergencia';
  if (valor === 'alerta') return 'alerta';
  if (valor === 'precaucion' || valor === 'precaución') return 'precaucion';
  return 'normal';
}

function obtenerTextoDuracion(simulacion) {
  if (!simulacion) return '--';

  // Extraemos los parámetros donde el backend nuevo ahora sí guarda 'desde' y 'hasta'
  let params = simulacion.parametrosInput || simulacion.escenario || {};
  if (typeof params === 'string') {
    try { params = JSON.parse(params); } catch (e) { params = {}; }
  }

  // 1. Si es histórica y existen las fechas en los parámetros, las formateamos a DD/MM/YY
  if (simulacion.tipo === 'historico' && params.desde && params.hasta) {
    const formatearFecha = (fechaStr) => {
      const partes = fechaStr.split('-'); // El input type="date" da YYYY-MM-DD
      if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0].slice(-2)}`;
      }
      return fechaStr;
    };
    return `Del ${formatearFecha(params.desde)} al ${formatearFecha(params.hasta)}`;
  }

  // 2. Si no hay fechas (simulación manual o registros antiguos), usamos la duración en minutos
  const mins = Number(simulacion.duracionMin || params.duracionMin);
  if (mins) {
    if (mins >= 43200) return `${Math.round(mins / 43200)} mes(es)`;
    if (mins >= 10080) return `${Math.round(mins / 10080)} sem(s)`;
    if (mins >= 1440) return `${Math.round(mins / 1440)} día(s)`;
    if (mins >= 60) return `${Math.round(mins / 60)}h`;
    return `${mins} min`;
  }

  return '--';
}

export default function Simulacion() {
  const [embalses, setEmbalses] = useState([]);
  const [cargandoEmbalses, setCargandoEmbalses] = useState(true);
  const [errorEmbalses, setErrorEmbalses] = useState('');
  const [pasoSeleccionado, setPasoSeleccionado] = useState(null);
  const [animando, setAnimando] = useState(false);
  const [multiplicadorVelocidad, setMultiplicadorVelocidad] = useState(1);
  const [embalseSeleccionadoId, setEmbalseSeleccionadoId] = useState(() => {
    try {
      return localStorage.getItem('embalseSeleccionadoId') || '';
    } catch (_error) {
      return '';
    }
  });

  const [cargandoEstadoInicial, setCargandoEstadoInicial] = useState(false);
  const [errorEstadoInicial, setErrorEstadoInicial] = useState('');

  const [modoEscenario, setModoEscenario] = useState('manual');
  const [duracionMin, setDuracionMin] = useState(1440);
  const [mesReferencia, setMesReferencia] = useState(new Date().getMonth() + 1);
  const [caudalEntradaPrevisto, setCaudalEntradaPrevisto] = useState(0);

  const [estadoInicial, setEstadoInicial] = useState({
    nivelM: 0,
    nivelPorcentaje: 0,
    volumenHm3: 0,
    caudalEntradaActual: 0,
    timestamp: '--/--/-- --:--',
    cotaMaximaM: 0,
    cotaMinimaM: 0,
  });

  const [historico, setHistorico] = useState({
    estacion: '',
    desde: '',
    hasta: '',
    compararCon: 'real',
  });

  const [mensajeHistorico, setMensajeHistorico] = useState('');
  const [ejecutandoSimulacion, setEjecutandoSimulacion] = useState(false);
  const [errorSimulacion, setErrorSimulacion] = useState('');
  const [resultadoSimulacion, setResultadoSimulacion] = useState(null);
  const [progreso, setProgreso] = useState(0);
  const [visibilidadGrafica, setVisibilidadGrafica] = useState({
    volumenProyectado: true,
    volumenReal: true,
    caudalSimulado: false,
    caudalReal: false,
  });

  // Bucle de animación dinámico e inteligente con control de velocidad
  useEffect(() => {
    if (!animando || !resultadoSimulacion?.proyeccion?.length) return;

    const totalPasos = resultadoSimulacion.proyeccion.length;
    
    // TIEMPO DINÁMICO: 8000 milisegundos (8 segundos) base.
    const delayCalculado = Math.round(8000 / totalPasos);
    
    // Limitamos los topes y aplicamos el multiplicador elegido por el usuario
    let delayBase = Math.max(30, Math.min(delayCalculado, 400));
    let delay = delayBase / multiplicadorVelocidad;

    // Aceleramos también las pausas inicial y final para que todo fluya acorde
    if (pasoSeleccionado === 0) {
      delay = 800 / multiplicadorVelocidad; 
    } 
    else if (pasoSeleccionado === totalPasos - 1) {
      delay = 1500 / multiplicadorVelocidad; 
    }

    const timeoutId = setTimeout(() => {
      setPasoSeleccionado((prevPaso) => {
        if (prevPaso === null || prevPaso >= totalPasos - 1) {
          return 0;
        }
        return prevPaso + 1;
      });
    }, delay);

    return () => clearTimeout(timeoutId);
    
  }, [animando, resultadoSimulacion, pasoSeleccionado, multiplicadorVelocidad]); 

  const embalseSeleccionado = embalses.find(
    (embalse) => String(embalse.id) === String(embalseSeleccionadoId)
  ) || null;

  useEffect(() => {
    const cargarEmbalses = async () => {
      try {
        setCargandoEmbalses(true);
        setErrorEmbalses('');

        const res = await apiFetch('/api/embalses');
        const data = await res.json().catch(() => []);

        if (!res.ok) {
          throw new Error(data?.error || 'No se pudieron cargar los embalses');
        }

        const lista = Array.isArray(data) ? data.filter(emb => emb.activo) : [];
        setEmbalses(lista);

        setEmbalseSeleccionadoId((prev) => {
          if (lista.length === 0) return '';
          const existeActual = prev && lista.some((item) => String(item.id) === String(prev));
          if (existeActual) return prev;
          return String(lista[0].id);
        });
      } catch (error) {
        setEmbalses([]);
        setErrorEmbalses(error.message || 'Error cargando embalses');
      } finally {
        setCargandoEmbalses(false);
      }
    };

    cargarEmbalses();
    const intervalo = setInterval(cargarEmbalses, 30000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (!embalseSeleccionadoId) return;
    try {
      localStorage.setItem('embalseSeleccionadoId', String(embalseSeleccionadoId));
    } catch (_error) {
      // Ignorado
    }
  }, [embalseSeleccionadoId]);

  useEffect(() => {
    if (!embalseSeleccionadoId) return;
    cargarSimulacionesGuardadas(embalseSeleccionadoId);
  }, [embalseSeleccionadoId]);

  useEffect(() => {
    if (!embalseSeleccionadoId || !embalseSeleccionado) return;

    const cargarEstadoInicial = async () => {
      try {
        setCargandoEstadoInicial(true);
        setErrorEstadoInicial('');
        setMensajeHistorico('');

        const res = await apiFetch(`/api/mediciones?rango=dia&embalseId=${embalseSeleccionadoId}&limite=24`);
        const data = await res.json().catch(() => []);

        if (!res.ok) {
          throw new Error(data?.error || 'No se pudo cargar el estado inicial');
        }

        const mediciones = Array.isArray(data) ? data : [];
        const ultima = mediciones[0];

        if (!ultima) {
          setEstadoInicial({
            nivelM: embalseSeleccionado.cotaMinimaM || 0,
            nivelPorcentaje: 0,
            volumenHm3: 0,
            caudalEntradaActual: 0,
            timestamp: '--/--/-- --:--',
            cotaMaximaM: embalseSeleccionado.cotaMaximaM || 0,
            cotaMinimaM: embalseSeleccionado.cotaMinimaM || 0,
          });

          setCaudalEntradaPrevisto(0);
          setHistorico((prev) => ({
            ...prev,
            estacion: embalseSeleccionado.saihEstacionCodigo || '',
          }));
          return;
        }

        const capacidad = Number(embalseSeleccionado.capacidadHm3) || 0;
        const volumen = Number(ultima.volumen) || 0;
        const porcentaje = capacidad > 0 ? (volumen / capacidad) * 100 : 0;

        setEstadoInicial({
          nivelM: Number(ultima.nivel) || 0,
          nivelPorcentaje: Number(porcentaje.toFixed(2)),
          volumenHm3: volumen,
          caudalEntradaActual: Number(ultima.caudalEntrada) || 0,
          timestamp: ultima.timestamp || '--/--/-- --:--',
          cotaMaximaM: Number(ultima.cotaMaximaM) || embalseSeleccionado.cotaMaximaM || 0,
          cotaMinimaM: Number(ultima.cotaMinimaM) || embalseSeleccionado.cotaMinimaM || 0,
        });

        setCaudalEntradaPrevisto(Number(ultima.caudalEntrada) || 0);
        setHistorico((prev) => ({
          ...prev,
          estacion: embalseSeleccionado.saihEstacionCodigo || '',
        }));
      } catch (error) {
        setErrorEstadoInicial(error.message || 'Error cargando estado inicial');
      } finally {
        setCargandoEstadoInicial(false);
      }
    };

    cargarEstadoInicial();
  }, [embalseSeleccionadoId, embalseSeleccionado]);

  const actualizarEstadoInicial = (campo, valor) => {
    setEstadoInicial((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  };

  const handlePorcentajeManualChange = (nuevoPorcentaje) => {
    const pct = Math.max(0, Math.min(100, Number(nuevoPorcentaje)));
    const capacidad = Number(embalseSeleccionado?.capacidadHm3) || 0;
    
    const cotaMax = Number(embalseSeleccionado?.cotaMaximaM || estadoInicial.cotaMaximaM || 0);
    const cotaMin = Number(embalseSeleccionado?.cotaMinimaM || estadoInicial.cotaMinimaM || 0);

    const nuevoVolumen = (pct / 100) * capacidad;
    const nuevoNivel = cotaMin + (pct / 100) * (cotaMax - cotaMin);

    setEstadoInicial((prev) => ({
      ...prev,
      nivelPorcentaje: pct,
      volumenHm3: Number(nuevoVolumen.toFixed(4)),
      nivelM: Number(nuevoNivel.toFixed(2))
    }));
  };

  const [simulacionesGuardadas, setSimulacionesGuardadas] = useState([]);
  const [cargandoSimulacionesGuardadas, setCargandoSimulacionesGuardadas] = useState(false);
  const [errorSimulacionesGuardadas, setErrorSimulacionesGuardadas] = useState('');

  const cargarSimulacionesGuardadas = async (embalseIdParam = embalseSeleccionadoId) => {
    if (!embalseIdParam) {
      setSimulacionesGuardadas([]);
      return;
    }

    try {
      setCargandoSimulacionesGuardadas(true);
      setErrorSimulacionesGuardadas('');

      const res = await apiFetch(`/api/simulaciones?embalseId=${embalseIdParam}`);
      const data = await res.json().catch(() => []);

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudieron cargar las simulaciones guardadas');
      }

      setSimulacionesGuardadas(Array.isArray(data) ? data : []);
    } catch (error) {
      setSimulacionesGuardadas([]);
      setErrorSimulacionesGuardadas(error.message || 'Error cargando simulaciones guardadas');
    } finally {
      setCargandoSimulacionesGuardadas(false);
    }
  };

  const descargarSimulacion = async (idSimulacion, nombreEmbalse) => {
    try {
      // Pide el CSV al backend
      const res = await apiFetch(`/api/simulaciones/${idSimulacion}/exportar`);
      
      if (!res.ok) {
        throw new Error('No se pudo exportar la simulación');
      }

      // Procesa el texto/blob que llega
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Crea un enlace invisible y lo pulsa automáticamente
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `simulacion_${idSimulacion}_${nombreEmbalse.replace(/\s+/g, '_')}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      
      // Limpieza
      enlace.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error descargando CSV:', error);
      alert('Error al descargar el archivo de simulación.');
    }
  };

  const cargarSimulacionEnPantalla = async (idSimulacion) => {
    try {
      setEjecutandoSimulacion(true);
      setErrorSimulacion('');
      
      const res = await apiFetch(`/api/simulaciones/${idSimulacion}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo cargar la simulación');
      }

      setResultadoSimulacion(data);
      setMensajeHistorico(`Visualizando simulación guardada #${idSimulacion} del ${formatearFecha(data.fechaEjecucion)}`);
      
      // Hacemos scroll suave hacia arriba para ver la gráfica
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error) {
      console.error('Error cargando simulación:', error);
      alert(error.message);
    } finally {
      setEjecutandoSimulacion(false);
    }
  };

  const ejecutarSimulacion = async () => {
    setErrorSimulacion('');
    setMensajeHistorico('');

    if (!embalseSeleccionadoId) {
      setErrorSimulacion('Selecciona un embalse antes de ejecutar la simulación.');
      return;
    }

    try {
      setEjecutandoSimulacion(true);
      setProgreso(5); // Arrancamos la solicitud

      // --- 1. FASE DE INGESTA PREVIA (Solo si es modo histórico) ---
      if (modoEscenario === 'historico') {
        if (!historico.estacion || !historico.desde || !historico.hasta) {
          throw new Error('Debes completar estación, fecha desde y fecha hasta para el escenario histórico.');
        }

        const fechaDesde = new Date(historico.desde);
        const fechaHasta = new Date(historico.hasta);

        if (fechaDesde > fechaHasta) {
          throw new Error('La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
        }

        // FASE 1: Scraper del SAIH (La parte más lenta)
        setProgreso(15);
        setMensajeHistorico('Fase 1/3: Conectando con la CHG para descargar datos reales...');

        // Añadimos un pequeño intervalo para que la barra se mueva mientras esperamos al scraper
        const intervaloScraper = setInterval(() => {
          setProgreso((prev) => (prev >= 45 ? 45 : prev + 2)); // Sube lentamente hasta estancarse en el 45%
        }, 2000);

        let resIngesta;
        try {
          resIngesta = await apiFetch('/api/ingesta/cargar-rango', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              embalseId: Number(embalseSeleccionadoId),
              estacionCodigo: historico.estacion,
              desde: historico.desde,
              hasta: historico.hasta
            })
          });
        } finally {
          clearInterval(intervaloScraper);
        }

        if (!resIngesta.ok) {
          const dataIngesta = await resIngesta.json().catch(() => ({}));
          throw new Error(dataIngesta.error || 'No se pudieron descargar los datos del SAIH previos a la simulación.');
        }

        // FASE 2: Preparación de la base de datos
        setProgreso(50);
        setMensajeHistorico('Fase 2/3: Datos descargados. Extrayendo serie histórica de la base de datos...');
      } else {
        // En modo manual no hay scraper, avanzamos rápido
        setProgreso(40);
        setMensajeHistorico('Preparando parámetros del escenario manual...');
      }

      // --- 2. FASE DE SIMULACIÓN MATEMÁTICA ---
      const payload = {
        embalseId: Number(embalseSeleccionadoId),
        estadoInicial: {
          nivelPorcentaje: Number(estadoInicial.nivelPorcentaje),
          volumenHm3: Number(estadoInicial.volumenHm3),
          nivelM: Number(estadoInicial.nivelM),
        },
        escenario: {},
      };

      if (modoEscenario === 'manual') {
        payload.escenario = {
          tipo: 'manual',
          duracionMin: Number(duracionMin),
          pasoMin: 60,
          mes: Number(mesReferencia),
          caudalEntradaM3s: Number(caudalEntradaPrevisto),
        };
      } else if (modoEscenario === 'historico') {
        payload.escenario = {
          tipo: 'historico',
          desde: historico.desde,
          hasta: historico.hasta,
          pasoMin: 60,
        };
      }

      // FASE 3: Ejecución de la lógica difusa y el balance de masas en el backend
      setProgreso(65);
      setMensajeHistorico(modoEscenario === 'historico' 
        ? 'Fase 3/3: Ejecutando motor de inferencia y lógica difusa...' 
        : 'Ejecutando motor matemático...');

      const res = await apiFetch('/api/simulacion/ejecutar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // FASE 4: Recepción de resultados
      setProgreso(90);
      setMensajeHistorico('Procesando resultados y construyendo gráficas...');

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo ejecutar la simulación');
      }

      // --- 3. RENDERIZADO DE RESULTADOS ---
      setProgreso(100);
      setResultadoSimulacion(data);
      cargarSimulacionesGuardadas(Number(embalseSeleccionadoId));
      
      if (modoEscenario === 'historico') {
         setMensajeHistorico(`¡Simulación histórica completada! Rango: ${historico.desde} → ${historico.hasta}.`);
      } else {
         setMensajeHistorico('');
      }
      
    } catch (error) {
      setProgreso(0);
      setResultadoSimulacion(null);
      setMensajeHistorico('');
      setErrorSimulacion(error.message || 'Error ejecutando la simulación');
    } finally {
      // Damos medio segundo para que el usuario vea la barra llegar al 100% antes de desaparecer
      setTimeout(() => {
        setEjecutandoSimulacion(false);
        setProgreso(0);
      }, 500);
    }
  };

  const alertaMaxima = resultadoSimulacion?.metricas?.alertaMaxima || 'Normal';
  const riesgoAlertaMaxima = normalizarRiesgo(alertaMaxima);

  const datosGrafica = (resultadoSimulacion?.proyeccion || []).map((paso) => ({
    momento: paso.timestampReal 
      ? formatearFechaGrafica(paso.timestampReal) 
      : `+${Math.round((paso.instanteMin || 0) / 60)}h`,
    nivelPorcentaje: Number(paso.nivelPorcentaje || 0),
    volumenRealHm3: typeof paso.volumenRealHm3 === 'number' ? paso.volumenRealHm3 : null,
    volumenHm3: Number(paso.volumenHm3 || 0),
    caudalSalidaTotalSimuladoM3s: Number(paso.caudalSalidaTotalSimuladoM3s || 0),
    caudalSalidaRealM3s: typeof paso.caudalSalidaRealM3s === 'number' ? paso.caudalSalidaRealM3s : null,
  }));
  
  const [rolUsuario, setRolUsuario] = useState(null);

  // Llamada al backend para obtener el rol real verificado
  useEffect(() => {
    const verificarUsuario = async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setRolUsuario(data.usuario?.rol);
        }
      } catch (error) {
        console.error('Error al verificar el rol del usuario', error);
      }
    };

    verificarUsuario();
  }, []);

  const puedeEliminar = rolUsuario === 'ADMIN' || rolUsuario === 'OPERADOR';

  const eliminarSimulacion = async (idSimulacion) => {
    const confirmar = window.confirm('¿Estás seguro de que deseas eliminar esta simulación del historial?');
    if (!confirmar) return;

    try {
      const res = await apiFetch(`/api/simulaciones/${idSimulacion}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo eliminar la simulación');
      }

      // Si había un resultado en pantalla y lo acabamos de borrar, limpiamos la pantalla
      if (resultadoSimulacion?.id === idSimulacion) {
        setResultadoSimulacion(null);
      }

      // Recargamos la tabla para que desaparezca
      cargarSimulacionesGuardadas(embalseSeleccionadoId);
      
    } catch (error) {
      console.error('Error eliminando simulación:', error);
      alert(error.message);
    }
  };

  const capacidadMax = resultadoSimulacion?.embalse?.capacidadHm3 || 100;
  const alertaHm3 = capacidadMax * 0.90;
  const criticoHm3 = capacidadMax * 0.95;

  // Lógica para alimentar la infografía interactiva
  let datosInfografia = null;

  const cotaMaxReal = Number(resultadoSimulacion?.embalse?.cotaMaximaM || embalseSeleccionado?.cotaMaximaM || 960);
  const cotaMinReal = Number(resultadoSimulacion?.embalse?.cotaMinimaM || embalseSeleccionado?.cotaMinimaM || 900);
  
  if (resultadoSimulacion?.proyeccion?.length > 0) {
    // Si el usuario pasa el ratón sobre la gráfica, usamos ese índice. Si no, usamos el último paso.
    const indiceMostrar = pasoSeleccionado !== null && pasoSeleccionado < resultadoSimulacion.proyeccion.length
        ? pasoSeleccionado
        : resultadoSimulacion.proyeccion.length - 1;

    const pasoFoco = resultadoSimulacion.proyeccion[indiceMostrar];
    
    
    // Calculamos la cota exacta interpolando el porcentaje de ese paso
    const nivelCotaAproximado = cotaMinReal + (pasoFoco.nivelPorcentaje / 100) * (cotaMaxReal - cotaMinReal);

    datosInfografia = {
        nivel: nivelCotaAproximado,
        porcentaje: pasoFoco.nivelPorcentaje,
        caudalEntrada: pasoFoco.caudalEntradaM3s,
        caudalSalida: pasoFoco.desembalseSeguridadM3s,
        cotaMaximaM: cotaMaxReal,
        cotaMinimaM: cotaMinReal,
    };
  } else if (embalseSeleccionadoId) {
    // Si aún no se ha ejecutado la simulación, mostramos el estado inicial
    datosInfografia = {
        nivel: estadoInicial.nivelM,
        porcentaje: estadoInicial.nivelPorcentaje,
        caudalEntrada: estadoInicial.caudalEntradaActual,
        caudalSalida: 0,
        cotaMaximaM: cotaMaxReal,
        cotaMinimaM: cotaMinReal,
    };
  }

  return (
    <div className="App">
      <AppHeader />

      <main>
        <div className="main-superior">
          <h2 className="main-h2">Panel Simulación</h2>

          {!puedeEliminar && (
            <div className="embalse-selector-wrap">
              <select
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
          )}
        </div>
        

        {errorEmbalses && <div className="embalse-error-banner">{errorEmbalses}</div>}
        {errorEstadoInicial && <div className="embalse-error-banner">{errorEstadoInicial}</div>}
        {errorSimulacion && <div className="embalse-error-banner">{errorSimulacion}</div>}
        {mensajeHistorico && <div className="embalse-ok-banner">{mensajeHistorico}</div>}

        {puedeEliminar && (
        <div className="simulacion-dashboard-grid">
          <section className="form-card">
            <h3 className="form-card-title">Configurador de escenario</h3>

            <div className="form-card-content">
              <label className="form-card-label">Embalse</label>
              <select
                className="form-card-input embalse-selector"
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

              <div className="simulacion-modos">
                <button
                  type="button"
                  className={`btn-guardar simulacion-modo-btn ${modoEscenario === 'manual' ? 'simulacion-modo-btn--activo' : ''}`}
                  onClick={() => setModoEscenario('manual')}
                >
                  Modo manual
                </button>

                <button
                  type="button"
                  className={`btn-guardar simulacion-modo-btn ${modoEscenario === 'historico' ? 'simulacion-modo-btn--activo' : ''}`}
                  onClick={() => setModoEscenario('historico')}
                >
                  Modo histórico
                </button>
              </div>

              {modoEscenario === 'manual' ? (
                <>
                  <label className="form-card-label">Caudal de entrada previsto (m³/s)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="form-card-input"
                    value={caudalEntradaPrevisto}
                    onChange={(e) => setCaudalEntradaPrevisto(Number(e.target.value))}
                  />

                  <label className="form-card-label">Duración de la simulación</label>
                  <select
                    className="form-card-input"
                    value={duracionMin}
                    onChange={(e) => setDuracionMin(Number(e.target.value))}
                  >
                    {DURACIONES.map((duracion) => (
                      <option key={duracion.minutos} value={duracion.minutos}>
                        {duracion.etiqueta}
                      </option>
                    ))}
                  </select>

                  <label className="form-card-label">Mes de referencia</label>
                  <select
                    className="form-card-input"
                    value={mesReferencia}
                    onChange={(e) => setMesReferencia(Number(e.target.value))}
                  >
                    {MESES.map((mes) => (
                      <option key={mes.valor} value={mes.valor}>
                        {mes.etiqueta}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="form-card-label">Estación SAIH</label>
                  <input
                    type="text"
                    className="form-card-input"
                    value={historico.estacion}
                    onChange={(e) => setHistorico((prev) => ({ ...prev, estacion: e.target.value }))}
                    placeholder="Ej: E41_CANALES"
                  />

                  <label className="form-card-label">Desde</label>
                  <input
                    type="date"
                    className="form-card-input"
                    value={historico.desde}
                    max={historico.hasta || new Date().toISOString().split('T')[0]} 
                    onChange={(e) => setHistorico((prev) => ({ ...prev, desde: e.target.value }))}
                  />

                  <label className="form-card-label">Hasta</label>
                  <input
                    type="date"
                    className="form-card-input"
                    value={historico.hasta}
                    min={historico.desde || '2000-01-01'}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setHistorico((prev) => ({ ...prev, hasta: e.target.value }))}
                  />
                </>
              )}

              <button
                type="button"
                className="btn-guardar"
                onClick={ejecutarSimulacion}
                disabled={ejecutandoSimulacion || !embalseSeleccionadoId}
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem'}}
              >
                {ejecutandoSimulacion ? (
                  <>
                    <span className="spinner"></span> Ejecutando...
                  </>
                ) : (
                  'Ejecutar simulación'
                )}
              </button>

              {ejecutandoSimulacion && (
                <div className="simulacion-progreso-contenedor">
                  <div
                    className="simulacion-progreso-barra"
                    style={{ width: `${progreso}%` }}
                  >
                    {progreso > 5 && `${progreso}%`}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="form-card">
            <h3 className="form-card-title">Estado inicial de referencia</h3>

            <div className="form-card-content">
              <div className="simulacion-estado-grid">
                <div className="compuerta-campo">
                  <div className="sensor-header">
                    <div className="sensor-icon">
                      <Droplets size={18} className="sensor-icon-svg" />
                    </div>
                    <div className="sensor-info">
                      <span className="sensor-label">Nivel porcentual</span>
                      <span className="sensor-subtitle">
                        {modoEscenario === 'manual' ? 'Ajusta para simular' : 'Valor real del SAIH'}
                      </span>
                    </div>
                  </div>

                  {modoEscenario === 'manual' ? (
                    <div className="simulacion-slider-container">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="0.1"
                        className="simulacion-slider"
                        value={estadoInicial.nivelPorcentaje}
                        onChange={(e) => handlePorcentajeManualChange(e.target.value)}
                        style={{ '--slider-porcentaje': `${estadoInicial.nivelPorcentaje}%` }}
                      />
                      <div className="simulacion-slider-valor">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className="form-card-input slider-number-input"
                          value={estadoInicial.nivelPorcentaje}
                          onChange={(e) => handlePorcentajeManualChange(e.target.value)}
                        />
                        <span>%</span>
                      </div>
                    </div>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className="form-card-input"
                      value={estadoInicial.nivelPorcentaje}
                      disabled={true}
                    />
                  )}
                </div>

                {/* 2. NIVEL ACTUAL (Cota) */}
                <div className="compuerta-campo">
                  <div className="sensor-header">
                    <div className="sensor-icon">
                      <Gauge size={18} className="sensor-icon-svg" />
                    </div>
                    <div className="sensor-info">
                      <span className="sensor-label">Nivel actual</span>
                      <span className="sensor-subtitle">
                        {modoEscenario === 'manual' 
                          ? 'Cota calculada' 
                          : `Referencia: ${cargandoEstadoInicial ? 'cargando...' : formatearFecha(estadoInicial.timestamp)}`}
                      </span>
                    </div>
                  </div>

                  <input
                    type="number"
                    step="0.01"
                    className="form-card-input"
                    value={estadoInicial.nivelM}
                    onChange={(e) => actualizarEstadoInicial('nivelM', Number(e.target.value))}
                    disabled={modoEscenario === 'manual' || modoEscenario === 'historico'}
                  />
                </div>

                {/* 3. VOLUMEN EMBALSADO */}
                <div className="compuerta-campo">
                  <div className="sensor-header">
                    <div className="sensor-icon">
                      <Waves size={18} className="sensor-icon-svg" />
                    </div>
                    <div className="sensor-info">
                      <span className="sensor-label">Volumen embalsado (hm³)</span>
                      <span className="sensor-subtitle">
                        {modoEscenario === 'manual' ? 'Calculado automáticamente' : 'Estado inicial'}
                      </span>
                    </div>
                  </div>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-card-input"
                    value={estadoInicial.volumenHm3}
                    onChange={(e) => actualizarEstadoInicial('volumenHm3', Number(e.target.value))}
                    disabled={modoEscenario === 'manual' || modoEscenario === 'historico'}
                  />
                </div>

                {/* 4. CAUDAL ENTRADA ACTUAL */}
                <div className="compuerta-campo">
                  <div className="sensor-header">
                    <div className="sensor-icon">
                      <Activity size={18} className="sensor-icon-svg" />
                    </div>
                    <div className="sensor-info">
                      <span className="sensor-label">Caudal entrada actual (m³/s)</span>
                      <span className="sensor-subtitle">Último dato observado</span>
                    </div>
                  </div>

                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="form-card-input"
                    value={estadoInicial.caudalEntradaActual}
                    onChange={(e) => actualizarEstadoInicial('caudalEntradaActual', Number(e.target.value))}
                    disabled={modoEscenario === 'manual' || modoEscenario === 'historico'}
                  />
                </div>
              </div>

              <div className="simulacion-cotas-grid">
                <div className="compuerta-campo">
                  <div className="sensor-header">
                    <div className="sensor-icon">
                      <AlertTriangle size={18} className="sensor-icon-svg" />
                    </div>
                    <div className="sensor-info">
                      <span className="sensor-label">Cota máxima</span>
                      <span className="sensor-subtitle">{formatearNumero(estadoInicial.cotaMaximaM, 2)} m.s.n.m.</span>
                    </div>
                  </div>
                </div>

                <div className="compuerta-campo">
                  <div className="sensor-header">
                    <div className="sensor-icon">
                      <History size={18} className="sensor-icon-svg" />
                    </div>
                    <div className="sensor-info">
                      <span className="sensor-label">Cota mínima</span>
                      <span className="sensor-subtitle">{formatearNumero(estadoInicial.cotaMinimaM, 2)} m.s.n.m.</span>
                    </div>
                  </div>
                </div>

                <div className="compuerta-campo">
                  <div className="sensor-header">
                    <div className="sensor-icon">
                      <CalendarRange size={18} className="sensor-icon-svg" />
                    </div>
                    <div className="sensor-info">
                      <span className="sensor-label">Capacidad máxima</span>
                      <span className="sensor-subtitle">
                        {formatearNumero(embalseSeleccionado?.capacidadHm3, 2)} hm³
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
        )}

        <section className="form-card simulacion-resultado-section">
          <div className="simulacion-resultado-header">
            <h3 className="form-card-title simulacion-resultado-title">
              Resultado de simulación
            </h3>

            <div className={`simulacion-alerta-chip simulacion-alerta-chip--${riesgoAlertaMaxima}`}>
              <Play size={16} />
              <span>Alerta máxima: {alertaMaxima}</span>
            </div>
          </div>

          {!resultadoSimulacion ? (
            <div className="form-card-content">
              <p className="simulacion-empty">
                Ejecuta una simulación para ver la proyección, las métricas y la tabla de decisiones.
              </p>
            </div>
          ) : (
            <div className="form-card-content">
              <div className="simulacion-metricas-grid">
                <div className="compuerta-campo">
                  <span className="sensor-label">Embalse</span>
                  <span className="sensor-subtitle">{resultadoSimulacion.embalse?.nombre || '--'}</span>
                </div>

                <div className="compuerta-campo">
                  <span className="sensor-label">Volumen desembalsado</span>
                  <span className="sensor-subtitle">
                    {formatearNumero(resultadoSimulacion.metricas?.volumenTotalDesembalsadoHm3, 4)} hm³
                  </span>
                </div>

                <div className="compuerta-campo">
                  <span className="sensor-label">Demanda urbana satisfecha</span>
                  <span className="sensor-subtitle">
                    {formatearNumero(resultadoSimulacion.metricas?.demandaUrbanaSatisfechaPct, 2)}%
                  </span>
                </div>

                <div className="compuerta-campo">
                  <span className="sensor-label">Demanda agraria satisfecha</span>
                  <span className="sensor-subtitle">
                    {formatearNumero(resultadoSimulacion.metricas?.demandaAgrariaSatisfechaPct, 2)}%
                  </span>
                </div>

                {resultadoSimulacion?.id && (
                  <div className="compuerta-campo">
                    <span className="sensor-label">Simulación guardada</span>
                    <span className="sensor-subtitle">
                      ID #{resultadoSimulacion.id}
                    </span>
                    <span className="sensor-subtitle">
                      {formatearFecha(resultadoSimulacion.fechaEjecucion)}
                    </span>
                  </div>
                )}
              </div>

              <section className="simulacion-grafica">
                <div className="simulacion-grafica-header">
                  <h4 className="form-card-title">Proyección vs Realidad (Gemelo Digital)</h4>

                  <div className="simulacion-toggles-container">
                    
                    <button
                      type="button"
                      onClick={() => setVisibilidadGrafica(prev => ({ ...prev, volumenProyectado: !prev.volumenProyectado }))}
                      className={`simulacion-toggle-btn btn-proyectado ${visibilidadGrafica.volumenProyectado ? 'activo' : ''}`}
                    >
                      {visibilidadGrafica.volumenProyectado ? <Eye size={15} /> : <EyeOff size={15} />}
                      Vol. Proyectado
                    </button>

                    {/* Oculto en modo manual */}
                    {resultadoSimulacion?.tipo === 'historico' && (
                      <button
                        type="button"
                        onClick={() => setVisibilidadGrafica(prev => ({ ...prev, volumenReal: !prev.volumenReal }))}
                        className={`simulacion-toggle-btn btn-real ${visibilidadGrafica.volumenReal ? 'activo' : ''}`}
                      >
                        {visibilidadGrafica.volumenReal ? <Eye size={15} /> : <EyeOff size={15} />}
                        Vol. Real
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setVisibilidadGrafica(prev => ({ ...prev, caudalSimulado: !prev.caudalSimulado }))}
                      className={`simulacion-toggle-btn btn-caudal-sim ${visibilidadGrafica.caudalSimulado ? 'activo' : ''}`}
                    >
                      {visibilidadGrafica.caudalSimulado ? <Eye size={15} /> : <EyeOff size={15} />}
                      Caudal Sim.
                    </button>

                    {/* Oculto en modo manual */}
                    {resultadoSimulacion?.tipo === 'historico' && (
                      <button
                        type="button"
                        onClick={() => setVisibilidadGrafica(prev => ({ ...prev, caudalReal: !prev.caudalReal }))}
                        className={`simulacion-toggle-btn btn-caudal-real ${visibilidadGrafica.caudalReal ? 'activo' : ''}`}
                      >
                        {visibilidadGrafica.caudalReal ? <Eye size={15} /> : <EyeOff size={15} />}
                        Caudal Real
                      </button>
                    )}

                    {/* LEYENDA (CSS Limpio) */}
                    <div className="simulacion-leyenda-resguardo">
                      <span className="simulacion-leyenda-resguardo-item simulacion-leyenda-resguardo-item--alerta">
                        <span className="simulacion-leyenda-linea simulacion-leyenda-linea--alerta"></span> 
                        Alerta (90%)
                      </span>
                      <span className="simulacion-leyenda-resguardo-item simulacion-leyenda-resguardo-item--critico">
                        <span className="simulacion-leyenda-linea simulacion-leyenda-linea--critico"></span> 
                        Crítico (95%)
                      </span>
                    </div>

                  </div>
                </div>

                <div className="simulacion-grafica-wrap">
                  {/* FORZAMOS UN RE-RENDER AL CAMBIAR LA VISIBILIDAD */}
                  <ResponsiveContainer width="100%" height={320} key={JSON.stringify(visibilidadGrafica)}>
                    <LineChart 
                      data={datosGrafica} 
                      margin={{ top: 12, right: 8, left: 4, bottom: 8 }}
                      onMouseMove={(e) => {
                        if (e.activeTooltipIndex !== undefined) {
                          setAnimando(false); // <--- Pausa el auto-play si el usuario mueve el ratón
                          setPasoSeleccionado(e.activeTooltipIndex);
                        }
                      }}
                      onMouseLeave={() => setPasoSeleccionado(null)}
                    >
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                      <XAxis
                        dataKey="momento"
                        stroke="#94a3b8"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        interval="preserveStartEnd"
                        angle={-15}
                        textAnchor="end"
                        height={40}
                      />
                      
                      {/* EJE Y PRINCIPAL (IZQUIERDA) - Para Volúmenes */}
                      <YAxis
                        yAxisId="left"
                        stroke="#94a3b8"
                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                        label={{
                          value: 'Volumen (hm³)',
                          angle: -90,
                          position: 'insideLeft',
                          fill: '#94a3b8',
                        }}
                      />

                      {/* EJE Y SECUNDARIO (DERECHA) - Para Caudales */}
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#94a3b8"
                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                        label={{
                          value: 'Caudal (m³/s)',
                          angle: 90,
                          position: 'insideRight',
                          fill: '#94a3b8',
                        }}
                      />
                      
                      <Tooltip
                        contentStyle={{
                          background: '#0f172a',
                          border: '1px solid rgba(148, 163, 184, 0.25)',
                          borderRadius: '8px',
                          color: '#e2e8f0',
                        }}
                        labelStyle={{ color: '#67e8f9' }}
                      />
                      
                      {/* Líneas de referencia asociadas al eje izquierdo (Volumen) */}
                      <ReferenceLine
                        yAxisId="left"
                        y={alertaHm3}
                        stroke="#f59e0b"
                        strokeDasharray="6 4"
                      />

                      <ReferenceLine
                        yAxisId="left"
                        y={criticoHm3}
                        stroke="#ef4444"
                        strokeDasharray="6 4"
                      />
                      
                      {/* LÍNEAS DE VOLUMEN (Asignadas al eje izquierdo) */}
                      {visibilidadGrafica.volumenProyectado && (
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="volumenHm3"
                          name="Vol. proyectado (hm³)"
                          stroke="#22d3ee"
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 5 }}
                        />
                      )}

                      {visibilidadGrafica.volumenReal && (
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="volumenRealHm3"
                          name="Vol. real SAIH (hm³)"
                          stroke="#a855f7"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls={true}
                        />
                      )}

                      {/* LÍNEAS DE CAUDAL / DESEMBALSE (Asignadas al eje derecho) */}
                      {visibilidadGrafica.caudalSimulado && (
                        <Line
                          yAxisId="right"
                          type="stepAfter"
                          dataKey="caudalSalidaTotalSimuladoM3s"
                          name="Desembalse sim. (m³/s)"
                          stroke="#fca5a5"
                          strokeWidth={2}
                          dot={false}
                        />
                      )}

                      {visibilidadGrafica.caudalReal && (
                        <Line
                          yAxisId="right"
                          type="stepAfter"
                          dataKey="caudalSalidaRealM3s"
                          name="Desembalse real (m³/s)"
                          stroke="#4ade80"
                          strokeDasharray="3 3"
                          strokeWidth={2}
                          dot={false}
                          connectNulls={true}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* 2. TABLA E INFOGRAFÍA LADO A LADO */}
              <div className="simulacion-tabla-infografia-grid">
                
                {/* COLUMNA IZQUIERDA: TABLA */}
                <div className="simulacion-tabla-columna">
                  <div className="simulacion-tabla-wrap simulacion-tabla-wrap--proyeccion">
                    <table className="simulacion-tabla simulacion-tabla--proyeccion">
                      <thead>
                        <tr>
                          <th>Momento</th>
                          <th>Nivel %</th>
                          <th>Volumen hm³</th>
                          <th>Entrada m³/s</th>
                          <th>Desembalse m³/s</th>
                          <th>Urbana hm³</th>
                          <th>Agraria hm³</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(resultadoSimulacion.proyeccion || []).map((paso) => {
                          const riesgoPaso = normalizarRiesgo(paso.riesgo);

                          return (
                            <tr key={paso.paso}>
                              <td>+{Math.round((paso.instanteMin || 0) / 60)}h</td>
                              <td>{formatearNumero(paso.nivelPorcentaje, 2)}</td>
                              <td>{formatearNumero(paso.volumenHm3, 4)}</td>
                              <td>{formatearNumero(paso.caudalEntradaM3s, 2)}</td>
                              <td>{formatearNumero(paso.desembalseSeguridadM3s, 2)}</td>
                              <td>{formatearNumero(paso.demandaUrbanaServidaHm3, 4)}</td>
                              <td>{formatearNumero(paso.demandaAgrariaServidaHm3, 4)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* COLUMNA DERECHA: INFOGRAFÍA INTERACTIVA */}
                <div className="simulacion-infografia-wrap">
                  <div className="simulacion-infografia-cabecera">
                    <div className={`simulacion-infografia-indicador ${pasoSeleccionado === null ? 'simulacion-infografia-indicador--default' : ''}`}>
                      {pasoSeleccionado !== null 
                        ? `Instante ${datosGrafica[pasoSeleccionado]?.momento}` 
                        : 'Estado final'}
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="simulacion-btn-velocidad"
                        onClick={() => setMultiplicadorVelocidad(prev => prev === 1 ? 2 : prev === 2 ? 4 : 1)}
                        title="Cambiar velocidad de animación"
                      >
                        {multiplicadorVelocidad}x
                      </button>

                      <button
                        type="button"
                        className={`simulacion-btn-animacion ${animando ? 'activo' : ''}`}
                        onClick={() => setAnimando(!animando)}
                        title={animando ? "Pausar animación" : "Reproducir en bucle"}
                      >
                        {animando ? (
                          <><Pause size={14} /> Pausar</>
                        ) : (
                          <><Play size={14} /> Reproducir</>
                        )}
                      </button>
                    </div>
                  </div>

                  {datosInfografia && (
                    <EmbalseInfografia 
                      datoActual={datosInfografia}
                      embalseNombre={resultadoSimulacion?.embalse?.nombre || embalseSeleccionado?.nombre || 'Embalse'}
                      compuertas={embalseSeleccionado?.compuertas || []} 
                      curvaSuperficie={embalseSeleccionado?.curvaSuperficie || []}
                      sensores={embalseSeleccionado?.sensores || []}
                    />
                  )}
                </div>

              </div>
            </div>
          )}

          {errorSimulacionesGuardadas && (
            <div className="embalse-error-banner">
              {errorSimulacionesGuardadas}
            </div>
          )}

          <section className="simulacion-historial">
            <h4 className="form-card-title">Últimas simulaciones guardadas</h4>

            {cargandoSimulacionesGuardadas ? (
              <p className="simulacion-empty">Cargando historial...</p>
            ) : simulacionesGuardadas.length === 0 ? (
              <p className="simulacion-empty">No hay simulaciones guardadas para este embalse.</p>
            ) : (
              <div className="simulacion-tabla-wrap simulacion-tabla-wrap--historial">
                <table className="simulacion-tabla simulacion-tabla--historial">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Fecha</th>
                      <th>Embalse</th>
                      <th>Tipo</th>
                      <th>Alerta máxima</th>
                      <th>Duración</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulacionesGuardadas.map((simulacion) => {
                      const riesgoFila = normalizarRiesgo(simulacion.alertaMaxima);

                      return (
                        <tr key={simulacion.id}>
                          <td>#{simulacion.id}</td>
                          <td>{formatearFecha(simulacion.fechaEjecucion)}</td>
                          <td>{simulacion.embalse?.nombre || '--'}</td>
                          <td>{simulacion.tipo || '--'}</td>
                          <td>
                            <span className={`simulacion-riesgo-badge simulacion-riesgo-badge--${riesgoFila}`}>
                              {simulacion.alertaMaxima || '--'}
                            </span>
                          </td>
                          <td>{obtenerTextoDuracion(simulacion)}</td>

                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className={`simulacion-btn-icono ${resultadoSimulacion?.id === simulacion.id ? 'simulacion-btn-icono--activo' : ''}`}
                                title="Ver gráfica y detalles"
                                onClick={() => cargarSimulacionEnPantalla(simulacion.id)}
                              >
                                <Eye size={18} />
                              </button>
                              <button
                                type="button"
                                className="simulacion-btn-icono"
                                title="Descargar CSV"
                                onClick={() => descargarSimulacion(simulacion.id, simulacion.embalse?.nombre || 'embalse')}
                              >
                                <Download size={18} />
                              </button>
                              
                              {/* Botón condicional solo para ADMIN/OPERADOR */}
                              {puedeEliminar && (
                                <button
                                  type="button"
                                  className="simulacion-btn-icono simulacion-btn-icono--danger"
                                  title="Eliminar simulación"
                                  onClick={() => eliminarSimulacion(simulacion.id)}
                                >
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </div>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          
        </section>
      </main>

      <AppFooter lastUpdate={formatearFecha(estadoInicial.timestamp)} />
    </div>
  );
}