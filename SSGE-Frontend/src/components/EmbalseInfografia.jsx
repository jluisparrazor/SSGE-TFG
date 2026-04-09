import './EmbalseInfografia.css';
import { TriangleAlert, CheckCircle } from 'lucide-react';

function EmbalseInfografia({ datoActual = {},
  theme = { panel: '#1e293b', border: '#334155', accent: '#06b6d4' },
  embalseNombre = 'Embalse de Canales',
  compuertas = []}) {
  const cotaMax = datoActual.cotaMaximaM ?? 960;
  const cotaMin = datoActual.cotaMinimaM ?? 900;
  const rangoCotas = cotaMax - cotaMin;

  // Ajuste fino del eje vertical para que la cota minima quede en la punta inferior visible del embalse.
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
  lineasRegla.unshift(cotaMin);
  lineasRegla.push(cotaMax);

  const normalizarNumero = (valor) => {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
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

  const resolverCaudalCompuerta = (compuerta) => {
    const caudalFormulario = normalizarNumero(compuerta?.maximoCaudal);
    if (caudalFormulario !== null) return caudalFormulario;

    const caudalBD = normalizarNumero(compuerta?.caudalSalidaActual);
    if (caudalBD !== null) return caudalBD;

    return 0;
  };

  const nivelActual = normalizarNumero(datoActual?.nivel);
  const enAlerta = Number(datoActual?.porcentaje || 0) > 80;

  return (
    <div
      className="embalse-card"
      style={{
        '--panel-bg': theme.panel,
        '--border-color': theme.border,
        '--accent-color': theme.accent
      }}
    >
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

          <path className="embalse-terreno-contorno" d="M 0 250 L 50 250 L 90 300 L 150 300 L 220 345 L 280 360 L 320 392 L 360 430 L 465 600 L 0 600 Z" />
          <path className="embalse-terreno-base" d="M 0 260 L 50 260 L 90 310 L 150 310 L 220 355 L 280 370 L 320 402 L 360 440 L 465 600 L 0 600 Z" />
          <path className="embalse-muro" d="M 465 600 L 515 100 L 545 100 L 725 600 Z" />
          <path className="embalse-muro-sombra" d="M 515 100 L 525 100 L 705 600 L 695 600 Z" />

          <line className="embalse-regla-eje" x1="15" y1={Y_REGLA_TOP} x2="15" y2={Y_REGLA_BOTTOM} />
          {lineasRegla.map((cota, i) => {
            const yPos = calcularPosicionY(cota);
            const labelY = yPos >= (Y_MIN_GRAFICO - 6)
              ? yPos - 6
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

          <g transform="translate(60, 40)">
            <g className={datoActual.caudalEntrada > 0 ? 'embalse-flujo-activo' : 'embalse-flujo-inactivo'}>
              <path className="embalse-entrada-path" d="M 40 0 Q 80 0 80 40">
                <animate attributeName="stroke-dashoffset" from="10" to="0" dur="0.5s" repeatCount="indefinite" />
              </path>
              <polygon className="embalse-flecha-agua" points="75,35 85,35 80,47" />
            </g>
            <rect className="embalse-caudal-label-bg" x="0" y="-12" width="130" height="20" rx="4" />
            <text className="embalse-caudal-label" x="65" y="2">
              Entrada: {datoActual.caudalEntrada || 0} m³/s
            </text>
          </g>

          <g>
            {/* Renderizar múltiples salidas basadas en compuertas */}
            {compuertas.length > 0 ? (
              compuertas.map((compuerta, idx) => {
                const cotaCompuerta = resolverCotaCompuerta(compuerta, idx);
                const caudalSolicitado = resolverCaudalCompuerta(compuerta);
                // Si el nivel no alcanza la cota de la toma, no puede haber salida por esa compuerta.
                const tomaSumergida = nivelActual !== null && nivelActual >= cotaCompuerta;
                const caudal = tomaSumergida ? caudalSolicitado : 0;
                const ySalida = calcularPosicionY(cotaCompuerta); // Calcular Y según la cota
                
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
                    <rect className="embalse-caudal-label-bg" x="520" y="-30" width="125" height="20" rx="4" />
                    <text className="embalse-caudal-label" x="582" y="-15">
                      Salida {idx + 1}: {caudal || 0} m³/s
                    </text>
                  </g>
                );
              })
            ) : (
              // Si no hay compuertas, mostrar salida por defecto
              <g transform="translate(0, 420)">
                <path className="embalse-salida-base" d="M 455 0 L 760 0" />
                <path className="embalse-salida-canal" d="M 455 0 L 760 0" />
                <g className={datoActual.caudalSalida > 0 ? 'embalse-flujo-activo' : 'embalse-flujo-inactivo-salida'}>
                  <path className="embalse-salida-path" d="M 455 0 L 760 0">
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.5s" repeatCount="indefinite" />
                  </path>
                  <polygon className="embalse-flecha-agua" points="760,-6 772,0 760,6" />
                </g>
                <rect className="embalse-caudal-label-bg" x="520" y="-30" width="125" height="20" rx="4" />
                <text className="embalse-caudal-label" x="582" y="-15">
                  Salida: {datoActual.caudalSalida || 0} m³/s
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
