import "./EmbalseInfografia.css";
import { TriangleAlert, CheckCircle } from 'lucide-react';

function EmbalseInfografia({ 
  datoActual = {},
  embalseNombre = 'Embalse de Canales',
  compuertas = [],
  curvaSuperficie = [],
  sensores = []
}) {
  const cotaMax = datoActual.cotaMaximaM ?? 960;
  const cotaMin = datoActual.cotaMinimaM ?? 900;
  const rangoCotas = cotaMax - cotaMin;

  const Y_MAX_GRAFICO = 110;
  const Y_MIN_GRAFICO = 492;
  const Y_REGLA_TOP = Y_MAX_GRAFICO - 12;
  const Y_REGLA_BOTTOM = Y_MIN_GRAFICO;

  const calcularPosicionY = (nivel) => {
    if (!nivel) return Y_MIN_GRAFICO;
    const nivelSeguro = Math.min(Math.max(nivel, cotaMin), cotaMax);
    const altoDisponible = Y_MIN_GRAFICO - Y_MAX_GRAFICO;
    return Y_MIN_GRAFICO - ((nivelSeguro - cotaMin) / rangoCotas) * altoDisponible;
  };

  // Calcular intervalo dinámico según el rango
  let intervalo = 5;
  if (rangoCotas > 500) intervalo = 100;
  else if (rangoCotas > 200) intervalo = 50;
  else if (rangoCotas > 100) intervalo = 20;
  else if (rangoCotas > 50) intervalo = 10;

  const lineasRegla = [];
  const primerMultiplo = Math.ceil(cotaMin / intervalo) * intervalo;

  for (let cota = primerMultiplo; cota < cotaMax; cota += intervalo) {
    lineasRegla.push(cota);
  }

  if (lineasRegla.length === 0 || Math.abs(lineasRegla[0] - cotaMin) > intervalo / 2) {
    lineasRegla.unshift(cotaMin);
  }

  if (Math.abs(lineasRegla[lineasRegla.length - 1] - cotaMax) > intervalo / 2) {
    lineasRegla.push(cotaMax);
  }

  const normalizarNumero = (valor) => {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  };

  const formatearCaudal = (valor) => {
    const caudal = normalizarNumero(valor) ?? 0;
    return caudal.toFixed(3);
  };

  const resolverCotaCompuerta = (compuerta, idx) => {
    const cotaExplicita = normalizarNumero(compuerta?.altura);
    if (cotaExplicita !== null) return cotaExplicita;

    const cotaPersistida = normalizarNumero(compuerta?.cotaTomaM);
    if (cotaPersistida !== null) return cotaPersistida;

    const total = Math.max(1, compuertas.length);
    const fraccion = (idx + 1) / (total + 1);
    return cotaMax - (rangoCotas * fraccion);
  };

  const nivelActual = normalizarNumero(datoActual?.nivel);
  const caudalSalidaTotal = normalizarNumero(datoActual?.caudalSalida) ?? 0;
  const compuertasSumergidas = compuertas.reduce((total, compuerta, idx) => {
    const cotaCompuerta = resolverCotaCompuerta(compuerta, idx);
    return nivelActual !== null && nivelActual >= cotaCompuerta ? total + 1 : total;
  }, 0);
  const enAlerta = Number(datoActual?.porcentaje || 0) > 95;

  // --- NUEVA FUNCIÓN DE ESCULPIDO DINÁMICO ---
  const generarTerrenoDinamico = (curvaSuperficie) => {
    // Terreno por defecto por si el embalse aún no tiene curva en BD
    const terrenoFallback = {
      contorno: 'M 0 250 L 50 250 L 90 300 L 150 300 L 220 345 L 280 360 L 320 392 L 360 430 L 465 600 L 0 600 Z',
      base: 'M 0 260 L 50 260 L 90 310 L 150 310 L 220 355 L 280 370 L 320 402 L 360 440 L 465 600 L 0 600 Z'
    };

    if (!curvaSuperficie || !Array.isArray(curvaSuperficie) || curvaSuperficie.length < 2) {
      return terrenoFallback;
    }

    // Ordenar de menor a mayor volumen
    const curva = [...curvaSuperficie].sort((a, b) => a.vol - b.vol);
    const vMax = curva[curva.length - 1].vol;
    const sMax = curva[curva.length - 1].sup;

    if (vMax === 0 || sMax === 0) return terrenoFallback;

    const RANGO_Y = Y_MIN_GRAFICO - Y_MAX_GRAFICO;
    const ANCHO_MAX = 465; // Límite donde choca con el muro de la presa

    let pathPuntos = '';
    let basePuntos = '';

    // Pintamos de arriba (100% de capacidad) hacia abajo (fondo)
    for (let i = curva.length - 1; i >= 0; i--) {
      const punto = curva[i];
      
      // X = Raíz cuadrada de la superficie para simular perspectiva 2D en perfil
      const ratioX = Math.sqrt(punto.sup / sMax);
      const x = ANCHO_MAX - (ANCHO_MAX * ratioX);

      // Y = Raíz cúbica del volumen para simular la altura
      const ratioY = Math.cbrt(punto.vol / vMax);
      const y = Y_MIN_GRAFICO - (RANGO_Y * ratioY);

      pathPuntos += ` L ${Math.max(0, x).toFixed(1)} ${y.toFixed(1)}`;
      basePuntos += ` L ${Math.max(0, x).toFixed(1)} ${(y + 10).toFixed(1)}`;
    }

    // Cerramos el polígono conectando con la base del muro (465, 600) y volviendo a la izquierda (0, 600)
    const contorno = `M 0 ${Y_MAX_GRAFICO} ${pathPuntos} L 465 600 L 0 600 Z`;
    const base = `M 0 ${Y_MAX_GRAFICO + 10} ${basePuntos} L 465 600 L 0 600 Z`;

    return { contorno, base };
  };

  // Esculpimos el embalse en función de sus datos físicos
  // Asegurarnos de que tenemos un Array nativo, venga como venga de la BD
  let curvaParseada = curvaSuperficie; // O datoActual.curvaSuperficie si prefieres no cambiar los props
  
  if (typeof curvaParseada === 'string') {
    try {
      curvaParseada = JSON.parse(curvaParseada);
    } catch (error) {
      console.error("Error al parsear la curvaSuperficie:", error);
      curvaParseada = null;
    }
  }

  // Ahora sí, esculpimos el embalse con datos limpios
  const terrenoElegido = generarTerrenoDinamico(curvaParseada);

  // --- LÓGICA ANTI-SOLAPAMIENTO PARA SENSORES ---
  const getSensoresAntiSolapamiento = () => {
    if (!sensores || sensores.length === 0) return [];
    
    // 1. Calcular Y real y asignar valores simulados
    const mapeados = sensores.map(sensor => {
      const yReal = calcularPosicionY(sensor.valorActual);
      let valorSimulado = '--';
      let unidad = '';
      
      if (sensor.tipo === 'Oxígeno') { valorSimulado = '8.2'; unidad = 'mg/L'; }
      else if (sensor.tipo === 'Temperatura') { valorSimulado = '21.5'; unidad = '°C'; }
      else if (sensor.tipo === 'Turbidez') { valorSimulado = '14.3'; unidad = 'NTU'; }

      return { ...sensor, yReal, labelY: yReal, valorSimulado, unidad };
    });

    // 2. Ordenar de arriba a abajo (La Y crece hacia abajo en el SVG)
    mapeados.sort((a, b) => a.yReal - b.yReal);

    // 3. Empujar hacia abajo si chocan (Mínimo 45px de espacio vital)
    const ESPACIO = 45;
    for (let i = 1; i < mapeados.length; i++) {
      if (mapeados[i].labelY < mapeados[i - 1].labelY + ESPACIO) {
        mapeados[i].labelY = mapeados[i - 1].labelY + ESPACIO;
      }
    }

    // 4. Si la cadena de choques saca el último sensor por debajo del suelo, empujar todo hacia arriba
    const Y_MAX_PERMITIDO = Y_MIN_GRAFICO - 20;
    if (mapeados[mapeados.length - 1].labelY > Y_MAX_PERMITIDO) {
      mapeados[mapeados.length - 1].labelY = Y_MAX_PERMITIDO;
      for (let i = mapeados.length - 2; i >= 0; i--) {
        if (mapeados[i].labelY > mapeados[i + 1].labelY - ESPACIO) {
          mapeados[i].labelY = mapeados[i + 1].labelY - ESPACIO;
        }
      }
    }

    return mapeados;
  };

  const sensoresDibujar = getSensoresAntiSolapamiento();

  return (
    <div className="embalse-card">
      <div className="embalse-card-header">
        <h3 className="embalse-card-title">{embalseNombre}</h3>
        <span className={`embalse-card-badge ${enAlerta ? 'embalse-card-badge--alert' : 'embalse-card-badge--normal'}`}>
          {enAlerta ? (
            <>
              <TriangleAlert size={16} className="embalse-badge-icon embalse-badge-icon--alert" />
              <span>Estado: Alerta</span>
            </>
          ) : (
            <>
              <CheckCircle size={16} className="embalse-badge-icon embalse-badge-icon--normal" />
              <span>Estado: Normal</span>
            </>
          )}
        </span>
      </div>

      <div className="embalse-svg-wrapper">
        <svg viewBox="0 0 700 500" className="embalse-svg" preserveAspectRatio="xMinYMax meet">
          <defs>
            <clipPath id="molde-embalse">
              <polygon points="0,0 520,0 520,100 465,600 0,600" />
            </clipPath>
          </defs>

          <rect
            clipPath="url(#molde-embalse)"
            x="0"
            y={calcularPosicionY(datoActual.nivel)}
            width="800"
            height="1000"
            className="embalse-water"
          />

          {/* Renderizado dinámico del suelo del embalse */}
          <path className="embalse-terreno-contorno" d={terrenoElegido.contorno} />
          <path className="embalse-terreno-base" d={terrenoElegido.base} />
          <path className="embalse-muro" d="M 465 600 L 515 100 L 545 100 L 725 600 Z" />
          <path className="embalse-muro-sombra" d="M 515 100 L 525 100 L 705 600 L 695 600 Z" />

          <line className="embalse-regla-eje" x1="15" y1={Y_REGLA_TOP} x2="15" y2={Y_REGLA_BOTTOM} />
          {lineasRegla.map((cota, i) => {
            const yPos = calcularPosicionY(cota);
            const labelY = yPos >= (Y_MIN_GRAFICO - 6)
              ? yPos - 3
              : (yPos <= (Y_REGLA_TOP + 6) ? yPos + 12 : yPos + 4);
            return (
              <g key={i}>
                <line className="embalse-regla-guia" x1="15" y1={yPos} x2="400" y2={yPos} />
                <line className="embalse-regla-tick" x1="15" y1={yPos} x2="25" y2={yPos} />
                <text className="embalse-regla-texto" x="30" y={labelY}>{Number.isInteger(cota) ? cota : cota.toFixed(1)}</text>
              </g>
            );
          })}

          <g className="embalse-level-marker" style={{ transform: `translateY(${calcularPosicionY(datoActual.nivel)}px)` }}>
            <line className="embalse-nivel-linea" x1="0" y1="0" x2="485" y2="0" />
            <polygon className="embalse-nivel-flecha" points="475,0 485,-8 485,8" />
            <rect className="embalse-nivel-label-bg" x="135" y="-22" width="130" height="20" rx="4" />
            <text className="embalse-nivel-label" x="200" y="-8">
              Nivel: {datoActual.nivel ? datoActual.nivel.toFixed(2) : '--'} msnm 
            </text>
          </g>

          {/*MARCADORES DE SENSORES*/}
          {sensoresDibujar.length > 0 && (
            <g className="embalse-sensores-marcadores">
              {sensoresDibujar.map((sensor, idx) => (
                <g key={`sensor-grafico-${idx}`}>
                  <g transform={`translate(280, ${sensor.labelY})`}>
                    <rect x="0" y="-18" width="120" height="36" rx="4" className="embalse-sensor-bg" />
                    <text x="60" y="-3" className="embalse-sensor-texto">
                      {sensor.tipo}
                    </text>
                    <text x="60" y="11" className="embalse-sensor-texto" style={{ fontSize: '10px', fill: '#f8fafc' }}>
                      {sensor.valorSimulado} {sensor.unidad}
                    </text>
                  </g>
                  <polyline 
                    points={`400,${sensor.labelY} 430,${sensor.yReal} 465,${sensor.yReal}`} 
                    className="embalse-sensor-linea" 
                    fill="none" 
                  />
                  
                  <circle cx="465" cy={sensor.yReal} r="4" className="embalse-sensor-punto" />
                </g>
              ))}
            </g>
          )}

          <g transform="translate(60, 40)">
            <g className={datoActual.caudalEntrada > 0 ? 'embalse-flujo-activo' : 'embalse-flujo-inactivo'}>
              <path className="embalse-entrada-path" d="M 40 0 Q 80 0 80 40">
                <animate attributeName="stroke-dashoffset" from="10" to="0" dur="0.5s" repeatCount="indefinite" />
              </path>
              <polygon className="embalse-flecha-agua" points="75,35 85,35 80,47" />
            </g>
            <rect className="embalse-caudal-label-bg" x="0" y="-12" width="130" height="20" rx="4" />
            <text className="embalse-caudal-label" x="65" y="2">
              Entrada: {formatearCaudal(datoActual.caudalEntrada)} m³/s
            </text>
          </g>

          <g>
            {compuertas.length > 0 ? (
              compuertas.map((compuerta, idx) => {
                const cotaCompuerta = resolverCotaCompuerta(compuerta, idx);
                const tomaSumergida = nivelActual !== null && nivelActual >= cotaCompuerta;
                const caudal = tomaSumergida && compuertasSumergidas > 0
                  ? caudalSalidaTotal / compuertasSumergidas
                  : 0;
                const ySalida = calcularPosicionY(cotaCompuerta); 
                
                return (
                  <g key={`salida-${idx}`} transform={`translate(0, ${ySalida})`}>
                    <path className="embalse-salida-base" d="M 455 0 L 760 0" />
                    <path className="embalse-salida-canal" d="M 455 0 L 760 0" />
                    <g className={caudal > 0 ? 'embalse-flujo-activo' : 'embalse-flujo-inactivo-salida'}>
                      <path className="embalse-salida-path" d="M 455 0 L 760 0">
                        <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.5s" repeatCount="indefinite" />
                      </path>
                      <polygon className="embalse-flecha-agua" points="760,-6 772,0 760,6" />
                    </g>
                    <rect className="embalse-caudal-label-bg" x="485" y="-31" width="190" height="21" rx="4" />
                    <text className="embalse-caudal-label" x="582" y="-15">
                      Salida {idx + 1}: {formatearCaudal(caudal)} m³/s
                    </text>
                  </g>
                );
              })
            ) : (
              <g transform="translate(0, 420)">
                <path className="embalse-salida-base" d="M 455 0 L 760 0" />
                <path className="embalse-salida-canal" d="M 455 0 L 760 0" />
                <g className={datoActual.caudalSalida > 0 ? 'embalse-flujo-activo' : 'embalse-flujo-inactivo-salida'}>
                  <path className="embalse-salida-path" d="M 455 0 L 760 0">
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.5s" repeatCount="indefinite" />
                  </path>
                  <polygon className="embalse-flecha-agua" points="760,-6 772,0 760,6" />
                </g>
                <rect className="embalse-caudal-label-bg" x="520" y="-30" width="135" height="20" rx="4" />
                <text className="embalse-caudal-label" x="582" y="-15">
                  Salida: {formatearCaudal(datoActual.caudalSalida)} m³/s
                </text>
              </g>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}

export default EmbalseInfografia;