import "./styles/EmbalseInfografia.css";
import { TriangleAlert, CheckCircle } from 'lucide-react';

function EmbalseInfografia({ datoActual = {},
  embalseNombre = 'Embalse de Canales',
  compuertas = []}) {
  const cotaMax = datoActual.cotaMaximaM ?? 960;
  const cotaMin = datoActual.cotaMinimaM ?? 900;
  const rangoCotas = cotaMax - cotaMin;

  // Ajuste del eje vertical para que la cota minima quede en la punta inferior visible del embalse.
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

  const resolverCaudalCompuerta = (compuerta) => {
    const caudalFormulario = normalizarNumero(compuerta?.maximoCaudal);
    if (caudalFormulario !== null) return caudalFormulario;
    
    const caudalBD = normalizarNumero(compuerta?.caudalSalidaActual);
    if (caudalBD !== null) return caudalBD;

    return 0;
  };

  const nivelActual = normalizarNumero(datoActual?.nivel);
  const caudalSalidaTotal = normalizarNumero(datoActual?.caudalSalida) ?? 0;
  const compuertasSumergidas = compuertas.reduce((total, compuerta, idx) => {
    const cotaCompuerta = resolverCotaCompuerta(compuerta, idx);
    return nivelActual !== null && nivelActual >= cotaCompuerta ? total + 1 : total;
  }, 0);
  const enAlerta = Number(datoActual?.porcentaje || 0) > 95;

  const TERRENOS_EMBALSE = [
  {
    // 1. Garganta profunda: Empieza ALTÍSIMO (Y=50) y cae casi en picado.
    contorno: 'M 0 100 L 50 150 L 120 260 L 200 380 L 280 480 L 360 560 L 420 590 L 465 600 L 0 600 Z',
    base:     'M 0 110 L 50 160 L 120 270 L 200 390 L 280 490 L 360 570 L 420 600 L 465 600 L 0 600 Z'
  },
  {
    // 2. Meseta alta: Empieza en 120, baja a un rellano donde se queda plano, y luego cae de nuevo.
    contorno: 'M 0 120 L 40 300 L 120 320 L 220 330 L 280 420 L 340 520 L 400 580 L 465 600 L 0 600 Z',
    base:     'M 0 130 L 40 310 L 120 330 L 220 340 L 280 430 L 340 530 L 400 590 L 465 600 L 0 600 Z'
  },
  {
    // 3. Orilla baja y plana (Playa): Empieza MUY ABAJO (Y=320), es muy poco profundo hasta acercarse a la presa.
    contorno: 'M 0 320 L 60 340 L 140 370 L 220 410 L 300 480 L 360 550 L 420 590 L 465 600 L 0 600 Z',
    base:     'M 0 330 L 60 350 L 140 380 L 220 420 L 300 490 L 360 560 L 420 600 L 465 600 L 0 600 Z'
  },
  {
    // 4. Baches irregulares: Empieza en 200 y tiene varias "colinas" y valles submarinos.
    contorno: 'M 0 200 L 30 280 L 70 260 L 110 350 L 160 330 L 220 450 L 280 500 L 350 560 L 465 600 L 0 600 Z',
    base:     'M 0 210 L 30 290 L 70 270 L 110 360 L 160 340 L 220 460 L 280 510 L 350 570 L 465 600 L 0 600 Z'
  },
  {
    // 5. Cañón escalonado: Empieza alto (Y=100) y baja haciendo forma de terrazas o escaleras.
    contorno: 'M 0 100 L 20 200 L 80 220 L 110 350 L 180 370 L 220 480 L 290 500 L 350 570 L 465 600 L 0 600 Z',
    base:     'M 0 110 L 20 210 L 80 230 L 110 360 L 180 380 L 220 490 L 290 510 L 350 580 L 465 600 L 0 600 Z'
  },
  {
    // 6. Acantilado final: Empieza medio-bajo (Y=260) y aguanta plano mucho rato para caer de golpe al final.
    contorno: 'M 0 260 L 80 280 L 180 300 L 260 340 L 320 450 L 360 550 L 400 590 L 465 600 L 0 600 Z',
    base:     'M 0 270 L 80 290 L 180 310 L 260 350 L 320 460 L 360 560 L 400 600 L 465 600 L 0 600 Z'
  },
  {
    // 7. Cóncavo clásico: Empieza en 140, con forma de cuenco suave y continuo.
    contorno: 'M 0 140 L 40 260 L 90 360 L 150 450 L 220 520 L 310 570 L 400 590 L 465 600 L 0 600 Z',
    base:     'M 0 150 L 40 270 L 90 370 L 150 460 L 220 530 L 310 580 L 400 600 L 465 600 L 0 600 Z'
  },
  {
    // 8. Fosa y elevación: Empieza en 180, baja, hace un agujero, y luego sube un poco antes de la presa.
    contorno: 'M 0 180 L 50 380 L 120 450 L 200 460 L 260 440 L 320 500 L 380 570 L 465 600 L 0 600 Z',
    base:     'M 0 190 L 50 390 L 120 460 L 200 470 L 260 450 L 320 510 L 380 580 L 465 600 L 0 600 Z'
  },
  {
      contorno: 'M 0 250 L 50 250 L 90 300 L 150 300 L 220 345 L 280 360 L 320 392 L 360 430 L 465 600 L 0 600 Z',
      base: 'M 0 260 L 50 260 L 90 310 L 150 310 L 220 355 L 280 370 L 320 402 L 360 440 L 465 600 L 0 600 Z'
  },
  {
    // 10. Doble onda suave: Empieza en 240 y desciende haciendo una forma de "S" sutil.
    contorno: 'M 0 240 L 40 300 L 80 280 L 130 360 L 180 340 L 240 440 L 290 420 L 350 520 L 410 580 L 465 600 L 0 600 Z',
    base:     'M 0 250 L 40 310 L 80 290 L 130 370 L 180 350 L 240 450 L 290 430 L 350 530 L 410 590 L 465 600 L 0 600 Z'
  }
];


  const terrenoElegido = TERRENOS_EMBALSE[8];

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
            {/* Renderizar múltiples salidas basadas en compuertas */}
            {compuertas.length > 0 ? (
              compuertas.map((compuerta, idx) => {
                const cotaCompuerta = resolverCotaCompuerta(compuerta, idx);
                // Si el nivel no alcanza la cota de la toma, no puede haber salida por esa compuerta.
                const tomaSumergida = nivelActual !== null && nivelActual >= cotaCompuerta;
                const caudal = tomaSumergida && compuertasSumergidas > 0
                  ? caudalSalidaTotal / compuertasSumergidas
                  : 0;
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
                    <rect className="embalse-caudal-label-bg" x="485" y="-31" width="190" height="21" rx="4" />
                    <text className="embalse-caudal-label" x="582" y="-15">
                      Salida {idx + 1}: {formatearCaudal(caudal)} m³/s
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
