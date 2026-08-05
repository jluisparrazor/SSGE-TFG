// --- FUNCIONES AUXILIARES ---
function limitar(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

function caudalM3sAHm3PorPaso(caudalM3s, pasoMin) {
  return (Number(caudalM3s) * pasoMin * 60) / 1_000_000;
}

function demandaMensualAHm3PorPaso(demandaMensualHm3, pasoMin) {
  const minutosMes = 30 * 24 * 60;
  return (Number(demandaMensualHm3) / minutosMes) * pasoMin;
}

function gradoPertenencia(x, a, b, c, d) {
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x > a && x < b) return (x - a) / (b - a);
  if (x > c && x < d) return (d - x) / (d - c);
  return 0;
}

// Interpola la superficie del embalse según su volumen actual y la curva geométrica de la BD
function interpolarSuperficie(volumenHm3, curvaSuperficie) {
  if (!curvaSuperficie || !Array.isArray(curvaSuperficie) || curvaSuperficie.length === 0) return 0;
  
  const curva = [...curvaSuperficie].sort((a, b) => a.vol - b.vol);

  if (volumenHm3 <= curva[0].vol) return curva[0].sup;
  if (volumenHm3 >= curva[curva.length - 1].vol) return curva[curva.length - 1].sup;

  for (let i = 0; i < curva.length - 1; i++) {
    if (volumenHm3 >= curva[i].vol && volumenHm3 <= curva[i+1].vol) {
      const v1 = curva[i].vol; const s1 = curva[i].sup;
      const v2 = curva[i+1].vol; const s2 = curva[i+1].sup;
      return s1 + ((volumenHm3 - v1) / (v2 - v1)) * (s2 - s1);
    }
  }
  return 0;
}

// --- REGLAS DE NEGOCIO DINÁMICAS (LÓGICA DIFUSA) ---

function obtenerMultiplicadorEcologicoDifuso(volumenHm3, mesIndex) {
  if (mesIndex >= 3 && mesIndex <= 8) {
    const eCritico = gradoPertenencia(volumenHm3, -1, 0, 0, 16);
    const eBajo = gradoPertenencia(volumenHm3, 0, 16, 16, 37);
    const eMedio = gradoPertenencia(volumenHm3, 16, 37, 37, 51);
    const eAlto = gradoPertenencia(volumenHm3, 37, 51, 1000, 1000);

    const restriccion = (eCritico * 0.5) + (eBajo * 0.4) + (eMedio * 0.35) + (eAlto * 0.0);
    return 1 - restriccion;
  }
  return 1.0; 
}

function obtenerCaudalEcologicoM3s(configCaudalMensual, volumenHm3, mesIndex) {
  let caudalBase = 0.21;
  if (configCaudalMensual && Array.isArray(configCaudalMensual) && configCaudalMensual.length === 12) {
    caudalBase = configCaudalMensual[mesIndex];
  }
  
  const multiplicador = obtenerMultiplicadorEcologicoDifuso(volumenHm3, mesIndex);
  return caudalBase * multiplicador;
}

function obtenerMultiplicadorAgrarioDifuso(volumenHm3, umbrales) {
  if (!umbrales || !Array.isArray(umbrales) || umbrales.length !== 3) return 1;
  
  const [uCritico, uBajo, uMedio] = umbrales;

  const vCritico = gradoPertenencia(volumenHm3, -1, 0, 0, uCritico);
  const vBajo = gradoPertenencia(volumenHm3, 0, uCritico, uCritico, uBajo);
  const vMedio = gradoPertenencia(volumenHm3, uCritico, uBajo, uBajo, uMedio);
  const vAlto = gradoPertenencia(volumenHm3, uBajo, uMedio, 1000, 1000);

  const restriccion = (vCritico * 1.0) + (vBajo * 0.7) + (vMedio * 0.1) + (vAlto * 0.0);
  return Math.max(0, 1 - restriccion);
}

function obtenerMultiplicadorLluvia(caudalEntradaM3s) {
  const cSeco = gradoPertenencia(caudalEntradaM3s, -1, 0, 4, 10);
  const cHumedo = gradoPertenencia(caudalEntradaM3s, 6, 12, 20, 35);
  const cLluviaFuerte = gradoPertenencia(caudalEntradaM3s, 25, 45, 1000, 1000);

  const multiplicador = (cSeco * 1.0) + (cHumedo * 0.3) + (cLluviaFuerte * 0.0);
  return limitar(multiplicador, 0, 1);
}

function obtenerEvaporacionM3s(configEvaporacion, curvaSuperficie, volumenHm3, mesIndex) {
  if (!configEvaporacion || !Array.isArray(configEvaporacion) || configEvaporacion.length !== 12) return 0;
  if (!curvaSuperficie || !Array.isArray(curvaSuperficie) || curvaSuperficie.length === 0) return 0;

  const tasaMm = configEvaporacion[mesIndex];
  const superficieHa = interpolarSuperficie(volumenHm3, curvaSuperficie);

  const evaporacionMensualM3 = (tasaMm / 1000) * (superficieHa * 10_000);
  return evaporacionMensualM3 / (30 * 24 * 60 * 60);
}

function obtenerFactorUrbanoHorario(fecha) {
  const hora = fecha.getHours();
  if (hora >= 7 && hora <= 11) return 1.3;  
  if (hora >= 19 && hora <= 23) return 1.4; 
  if (hora >= 0 && hora <= 5) return 0.6;   
  return 1.0;                                
}

function obtenerFactorAgrarioHorario(fecha) {
  const hora = fecha.getHours();
  if (hora >= 8 && hora <= 20) return 1.25;
  return 0.5; 
}

function calcularDesembalseSeguridadDifuso({ nivelPorcentaje, caudalEntradaPrevistoM3s }) {
  const nBajo = gradoPertenencia(nivelPorcentaje, 0, 0, 40, 60);
  const nMedio = gradoPertenencia(nivelPorcentaje, 50, 70, 85, 90);
  const nAlto = gradoPertenencia(nivelPorcentaje, 85, 95, 98, 99);
  const nCritico = gradoPertenencia(nivelPorcentaje, 98, 99, 100, 100);

  const eEscasa = gradoPertenencia(caudalEntradaPrevistoM3s, 0, 0, 5, 15);
  const eModerada = gradoPertenencia(caudalEntradaPrevistoM3s, 10, 20, 40, 60);
  const eIntensa = gradoPertenencia(caudalEntradaPrevistoM3s, 40, 70, 120, 180);
  const eTorrencial = gradoPertenencia(caudalEntradaPrevistoM3s, 150, 200, 1000, 1000);

  const w1 = nCritico;
  const out1 = Math.max(30, caudalEntradaPrevistoM3s * 1.5);

  const w2 = Math.min(nAlto, Math.max(eIntensa, eTorrencial));
  const out2 = Math.max(25, caudalEntradaPrevistoM3s * 1.25);

  const w3 = Math.min(nAlto, Math.max(eEscasa, eModerada));
  const out3 = 15;

  const w4 = Math.min(nMedio, Math.max(eIntensa, eTorrencial));
  const out4 = Math.max(10, caudalEntradaPrevistoM3s * 0.6);

  const w5 = Math.min(nMedio, eModerada);
  const out5 = Math.max(2, caudalEntradaPrevistoM3s * 0.8);

  const w6 = Math.min(nMedio, eEscasa);
  const out6 = Math.max(0.5, caudalEntradaPrevistoM3s * 0.5);

  const w7 = nBajo;
  const out7 = Math.max(0.3, caudalEntradaPrevistoM3s * 0.1);

  const numerador = (w1 * out1) + (w2 * out2) + (w3 * out3) + (w4 * out4) + (w5 * out5) + (w6 * out6) + (w7 * out7);
  const denominador = w1 + w2 + w3 + w4 + w5 + w6 + w7;

  if (denominador === 0) return 0.3;
  return Number((numerador / denominador).toFixed(2));
}

function clasificarRiesgo(nivelPorcentaje) {
  if (nivelPorcentaje >= 98) return 'Emergencia';
  if (nivelPorcentaje >= 95) return 'Alerta';
  if (nivelPorcentaje >= 85) return 'Precaucion';
  return 'Normal';
}

function calcularEstadoInicialHm3({ embalse, estadoInicial }) {
  if (Number.isFinite(estadoInicial?.volumenHm3)) {
    return limitar(estadoInicial.volumenHm3, 0, embalse.capacidadHm3);
  }
  if (Number.isFinite(estadoInicial?.nivelPorcentaje)) {
    return limitar((estadoInicial.nivelPorcentaje / 100) * embalse.capacidadHm3, 0, embalse.capacidadHm3);
  }
  throw new Error('estadoInicial.volumenHm3 o estadoInicial.nivelPorcentaje es obligatorio');
}

function generarResumen(proyeccion) {
  const alertaMaxima = proyeccion.reduce((maxima, paso) => {
    const prioridad = { Normal: 0, Precaucion: 1, Alerta: 2, Emergencia: 3 };
    return prioridad[paso.riesgo] > prioridad[maxima] ? paso.riesgo : maxima;
  }, 'Normal');

  const volumenTotalDesembalsadoHm3 = proyeccion.reduce((acumulado, paso) => acumulado + paso.desembalseSeguridadHm3, 0);
  const totalUrbanaObjetivo = proyeccion.reduce((acc, paso) => acc + paso.demandaUrbanaObjetivoHm3, 0);
  const totalUrbanaServida = proyeccion.reduce((acc, paso) => acc + paso.demandaUrbanaServidaHm3, 0);
  const totalAgrariaObjetivo = proyeccion.reduce((acc, paso) => acc + paso.demandaAgrariaObjetivoHm3, 0);
  const totalAgrariaServida = proyeccion.reduce((acc, paso) => acc + paso.demandaAgrariaServidaHm3, 0);

  return {
    alertaMaxima,
    volumenTotalDesembalsadoHm3: Number(volumenTotalDesembalsadoHm3.toFixed(4)),
    demandaUrbanaSatisfechaPct: totalUrbanaObjetivo > 0 ? Number(((totalUrbanaServida / totalUrbanaObjetivo) * 100).toFixed(2)) : 100,
    demandaAgrariaSatisfechaPct: totalAgrariaObjetivo > 0 ? Number(((totalAgrariaServida / totalAgrariaObjetivo) * 100).toFixed(2)) : 100,
  };
}

// ---------------------------------------------
// 1. MODO MANUAL (Caudal Constante)
// ---------------------------------------------
function simularEscenarioManual({ embalse, estadoInicial, escenario }) {
  if (!embalse || !Number.isFinite(embalse.capacidadHm3) || embalse.capacidadHm3 <= 0) {
    throw new Error('El embalse seleccionado no tiene una capacidad configurada válida (> 0).');
  }

  const pasoMin = Number(escenario?.pasoMin) || 60;
  const duracionMin = Number(escenario?.duracionMin);
  const mesInicial = limitar(Number(escenario?.mes) || new Date().getMonth() + 1, 1, 12);
  const caudalEntradaPrevistoM3s = Number(escenario?.caudalEntradaM3s);

  if (!Number.isFinite(duracionMin) || duracionMin <= 0) {
    throw new Error('escenario.duracionMin debe ser un número positivo');
  }
  if (!Number.isFinite(caudalEntradaPrevistoM3s) || caudalEntradaPrevistoM3s < 0) {
    throw new Error('escenario.caudalEntradaM3s debe ser un número mayor o igual a 0');
  }

  const pasos = Math.ceil(duracionMin / pasoMin);
  
  let volumenActualHm3 = calcularEstadoInicialHm3({ embalse, estadoInicial });

  // Extracción dinámica de la personalidad del embalse con Fallbacks
  const demandaUrbanaMes = embalse.demandaUrbanaMensual ?? 4.72;
  const demandaAgrariaArray = (embalse.demandaAgrariaMensual && Array.isArray(embalse.demandaAgrariaMensual)) ? embalse.demandaAgrariaMensual : [2.1, 2.1, 4.5, 8.2, 17.21, 14.0, 13.5, 15.9, 9.0, 5.0, 2.8, 2.1];
  const caudalEcologicoArray = (embalse.caudalEcologicoMensual && Array.isArray(embalse.caudalEcologicoMensual)) ? embalse.caudalEcologicoMensual : [0.145, 0.145, 0.145, 0.145, 0.110, 0.110, 0.110, 0.110, 0.110, 0.115, 0.115, 0.145];
  const evaporacionArray = (embalse.evaporacionMensual && Array.isArray(embalse.evaporacionMensual)) ? embalse.evaporacionMensual : [38.9, 45.8, 92.0, 105.2, 125.9, 166.6, 235.2, 232.7, 161.9, 81.2, 58.6, 48.7];
  const umbralesSequiaArray = (embalse.umbralesSequiaAgraria && Array.isArray(embalse.umbralesSequiaAgraria)) ? embalse.umbralesSequiaAgraria : [15, 43, 65];
  const curvaGeometrica = (embalse.curvaSuperficie && Array.isArray(embalse.curvaSuperficie)) ? embalse.curvaSuperficie : [{ vol: 0, sup: 1 }, { vol: 14.1, sup: 31 }, { vol: 70.7, sup: 156 }];

  const proyeccionCompleta = [];
  const añoActual = new Date().getFullYear();
  let fechaVirtual = new Date(añoActual, mesInicial - 1, 1, 0, 0, 0);

  for (let indice = 0; indice < pasos; indice += 1) {
    fechaVirtual.setMinutes(fechaVirtual.getMinutes() + pasoMin);
    const mesActualIndex = fechaVirtual.getMonth();

    const factorUrbano = obtenerFactorUrbanoHorario(fechaVirtual);
    const factorAgrario = obtenerFactorAgrarioHorario(fechaVirtual);

    const caudalEcologicoM3s = obtenerCaudalEcologicoM3s(caudalEcologicoArray, volumenActualHm3, mesActualIndex);
    const demandaEcologicaPasoHm3 = caudalM3sAHm3PorPaso(caudalEcologicoM3s, pasoMin);

    const multiplicadorAgrarioDifuso = obtenerMultiplicadorAgrarioDifuso(volumenActualHm3, umbralesSequiaArray);
    const multiplicadorLluvia = obtenerMultiplicadorLluvia(caudalEntradaPrevistoM3s);

    const demandaUrbanaPasoHm3 = demandaMensualAHm3PorPaso(demandaUrbanaMes, pasoMin) * factorUrbano;
    const demandaAgrariaPasoHm3 = demandaMensualAHm3PorPaso(demandaAgrariaArray[mesActualIndex], pasoMin) * factorAgrario * multiplicadorAgrarioDifuso * multiplicadorLluvia;

    const nivelPorcentajeAntes = (volumenActualHm3 / embalse.capacidadHm3) * 100;
    
    const desembalseSeguridadM3s = calcularDesembalseSeguridadDifuso({
      nivelPorcentaje: nivelPorcentajeAntes,
      caudalEntradaPrevistoM3s,
    });

    const evaporacionM3s = obtenerEvaporacionM3s(evaporacionArray, curvaGeometrica, volumenActualHm3, mesActualIndex);

    const entradaHm3 = caudalM3sAHm3PorPaso(caudalEntradaPrevistoM3s, pasoMin);
    const salidaEcologicaHm3 = demandaEcologicaPasoHm3;
    const salidaSeguridadHm3 = caudalM3sAHm3PorPaso(desembalseSeguridadM3s, pasoMin);
    const salidaEvaporacionHm3 = caudalM3sAHm3PorPaso(evaporacionM3s, pasoMin);

    let volumenDisponibleHm3 = volumenActualHm3 + entradaHm3 - salidaEcologicaHm3 - salidaSeguridadHm3 - salidaEvaporacionHm3;
    volumenDisponibleHm3 = Math.max(0, volumenDisponibleHm3);

    const demandaUrbanaServidaHm3 = Math.min(volumenDisponibleHm3, demandaUrbanaPasoHm3);
    volumenDisponibleHm3 -= demandaUrbanaServidaHm3;

    const demandaAgrariaServidaHm3 = Math.min(volumenDisponibleHm3, demandaAgrariaPasoHm3);
    volumenDisponibleHm3 -= demandaAgrariaServidaHm3;

    volumenActualHm3 = limitar(volumenDisponibleHm3, 0, embalse.capacidadHm3);

    const nivelPorcentaje = Number(((volumenActualHm3 / embalse.capacidadHm3) * 100).toFixed(2));
    const riesgo = clasificarRiesgo(nivelPorcentaje);

    const demandaTotalServidaHm3 = demandaUrbanaServidaHm3 + demandaAgrariaServidaHm3;
    const demandaTotalServidaM3s = (demandaTotalServidaHm3 * 1_000_000) / (pasoMin * 60);
    const caudalSalidaTotalSimuladoM3s = desembalseSeguridadM3s + caudalEcologicoM3s + demandaTotalServidaM3s + evaporacionM3s;

    proyeccionCompleta.push({
      paso: indice,
      instanteMin: (indice + 1) * pasoMin,
      volumenHm3: Number(volumenActualHm3.toFixed(4)),
      nivelPorcentaje,
      riesgo,
      caudalEntradaM3s: caudalEntradaPrevistoM3s,
      caudalEcologicoM3s,
      caudalSalidaRealM3s: null,
      caudalSalidaTotalSimuladoM3s: Number(caudalSalidaTotalSimuladoM3s.toFixed(2)),
      desembalseSeguridadM3s: Number(desembalseSeguridadM3s.toFixed(2)),
      desembalseSeguridadHm3: Number(salidaSeguridadHm3.toFixed(4)),
      demandaUrbanaObjetivoHm3: Number(demandaUrbanaPasoHm3.toFixed(4)),
      demandaUrbanaServidaHm3: Number(demandaUrbanaServidaHm3.toFixed(4)),
      demandaAgrariaObjetivoHm3: Number(demandaAgrariaPasoHm3.toFixed(4)),
      demandaAgrariaServidaHm3: Number(demandaAgrariaServidaHm3.toFixed(4)),
    });
  }

  const metricas = generarResumen(proyeccionCompleta);
  const MAX_PUNTOS_FRONTEND = 300;
  const factorMuestreo = Math.max(1, Math.ceil(proyeccionCompleta.length / MAX_PUNTOS_FRONTEND));
  
  const proyeccionDownsampled = proyeccionCompleta.filter((_, idx) => idx % factorMuestreo === 0 || idx === proyeccionCompleta.length - 1);

  return {
    tipo: 'manual',
    embalse: {
      id: embalse.id,
      nombre: embalse.nombre,
      capacidadHm3: embalse.capacidadHm3,
      cotaMaximaM: embalse.cotaMaximaM,
      cotaMinimaM: embalse.cotaMinimaM,
    },
    parametros: { pasoMin, duracionMin, mes: mesInicial, caudalEntradaM3s: caudalEntradaPrevistoM3s, estadoInicial },
    proyeccion: proyeccionDownsampled,
    metricas,
  };
}

// ---------------------------------------------
// 2. MODO HISTÓRICO (Caudal Variable Real)
// ---------------------------------------------
function simularEscenarioHistorico({ embalse, estadoInicial, serieHistorica, escenario }) {
  if (!embalse || !Number.isFinite(embalse.capacidadHm3) || embalse.capacidadHm3 <= 0) {
    throw new Error('El embalse seleccionado no tiene una capacidad configurada válida (> 0).');
  }
  if (!Array.isArray(serieHistorica) || serieHistorica.length === 0) {
    throw new Error('La serie histórica está vacía o no es válida.');
  }

  const pasoMin = Number(escenario?.pasoMin) || 60;

  let volumenActualHm3 = null;
  if (serieHistorica[0] && serieHistorica[0].volumen != null) {
    volumenActualHm3 = Number(serieHistorica[0].volumen);
  } else {
    volumenActualHm3 = calcularEstadoInicialHm3({ embalse, estadoInicial });
  }

  // Extracción dinámica de la personalidad del embalse con Fallbacks
  const demandaUrbanaMes = embalse.demandaUrbanaMensual ?? 4.72;
  const demandaAgrariaArray = (embalse.demandaAgrariaMensual && Array.isArray(embalse.demandaAgrariaMensual)) ? embalse.demandaAgrariaMensual : [2.1, 2.1, 4.5, 8.2, 17.21, 14.0, 13.5, 15.9, 9.0, 5.0, 2.8, 2.1];
  const caudalEcologicoArray = (embalse.caudalEcologicoMensual && Array.isArray(embalse.caudalEcologicoMensual)) ? embalse.caudalEcologicoMensual : [0.145, 0.145, 0.145, 0.145, 0.110, 0.110, 0.110, 0.110, 0.110, 0.115, 0.115, 0.145];
  const evaporacionArray = (embalse.evaporacionMensual && Array.isArray(embalse.evaporacionMensual)) ? embalse.evaporacionMensual : [38.9, 45.8, 92.0, 105.2, 125.9, 166.6, 235.2, 232.7, 161.9, 81.2, 58.6, 48.7];
  const umbralesSequiaArray = (embalse.umbralesSequiaAgraria && Array.isArray(embalse.umbralesSequiaAgraria)) ? embalse.umbralesSequiaAgraria : [15, 43, 65];
  const curvaGeometrica = (embalse.curvaSuperficie && Array.isArray(embalse.curvaSuperficie)) ? embalse.curvaSuperficie : [{ vol: 0, sup: 1 }, { vol: 14.1, sup: 31 }, { vol: 70.7, sup: 156 }];

  const proyeccionCompleta = [];

  for (let indice = 0; indice < serieHistorica.length; indice += 1) {
    const datoReal = serieHistorica[indice];
    const caudalEntradaM3s = Number(datoReal.caudalEntrada) || 0; 
    const fechaPaso = new Date(datoReal.timestamp);
    const mesActualIndex = fechaPaso.getMonth(); 

    const factorUrbano = obtenerFactorUrbanoHorario(fechaPaso);
    const factorAgrario = obtenerFactorAgrarioHorario(fechaPaso);

    const caudalEcologicoM3s = obtenerCaudalEcologicoM3s(caudalEcologicoArray, volumenActualHm3, mesActualIndex);
    const demandaEcologicaPasoHm3 = caudalM3sAHm3PorPaso(caudalEcologicoM3s, pasoMin);

    const multiplicadorAgrarioDifuso = obtenerMultiplicadorAgrarioDifuso(volumenActualHm3, umbralesSequiaArray);
    const multiplicadorLluvia = obtenerMultiplicadorLluvia(caudalEntradaM3s);
    
    const demandaUrbanaPasoHm3 = demandaMensualAHm3PorPaso(demandaUrbanaMes, pasoMin) * factorUrbano;
    const demandaAgrariaPasoHm3 = demandaMensualAHm3PorPaso(demandaAgrariaArray[mesActualIndex], pasoMin) * factorAgrario * multiplicadorAgrarioDifuso * multiplicadorLluvia;
    
    const nivelPorcentajeAntes = (volumenActualHm3 / embalse.capacidadHm3) * 100;

    const desembalseSeguridadM3s = calcularDesembalseSeguridadDifuso({
      nivelPorcentaje: nivelPorcentajeAntes,
      caudalEntradaPrevistoM3s: caudalEntradaM3s,
    });

    const evaporacionM3s = obtenerEvaporacionM3s(evaporacionArray, curvaGeometrica, volumenActualHm3, mesActualIndex);

    const entradaHm3 = caudalM3sAHm3PorPaso(caudalEntradaM3s, pasoMin);
    const salidaEcologicaHm3 = demandaEcologicaPasoHm3;
    const salidaSeguridadHm3 = caudalM3sAHm3PorPaso(desembalseSeguridadM3s, pasoMin);
    const salidaEvaporacionHm3 = caudalM3sAHm3PorPaso(evaporacionM3s, pasoMin);

    let volumenDisponibleHm3 = volumenActualHm3 + entradaHm3 - salidaEcologicaHm3 - salidaSeguridadHm3 - salidaEvaporacionHm3;
    volumenDisponibleHm3 = Math.max(0, volumenDisponibleHm3);

    const demandaUrbanaServidaHm3 = Math.min(volumenDisponibleHm3, demandaUrbanaPasoHm3);
    volumenDisponibleHm3 -= demandaUrbanaServidaHm3;

    const demandaAgrariaServidaHm3 = Math.min(volumenDisponibleHm3, demandaAgrariaPasoHm3);
    volumenDisponibleHm3 -= demandaAgrariaServidaHm3;

    volumenActualHm3 = limitar(volumenDisponibleHm3, 0, embalse.capacidadHm3);

    const nivelPorcentaje = Number(((volumenActualHm3 / embalse.capacidadHm3) * 100).toFixed(2));
    const riesgo = clasificarRiesgo(nivelPorcentaje);

    const valorSalidaBD = datoReal.caudalSalida;
    const caudalSalidaRealM3s = (valorSalidaBD !== null && valorSalidaBD !== undefined) ? Number(valorSalidaBD) : null;

    const demandaTotalServidaHm3 = demandaUrbanaServidaHm3 + demandaAgrariaServidaHm3;
    const demandaTotalServidaM3s = (demandaTotalServidaHm3 * 1_000_000) / (pasoMin * 60);
    const caudalSalidaTotalSimuladoM3s = desembalseSeguridadM3s + caudalEcologicoM3s + demandaTotalServidaM3s + evaporacionM3s;

    const valorVolumenBD = Number(datoReal.volumen);
    const capacidadEfectiva = Number(embalse?.capacidadHm3) > 0 ? Number(embalse.capacidadHm3) : 70.8;
    let nivelRealPorcentaje = null;

    if (Number.isFinite(valorVolumenBD)) {
      if (valorVolumenBD <= 100) {
        nivelRealPorcentaje = Number(limitar(valorVolumenBD, 0, 100).toFixed(2));
      } else {
        const calculoPct = (valorVolumenBD / capacidadEfectiva) * 100;
        nivelRealPorcentaje = Number(limitar(calculoPct, 0, 100).toFixed(2));
      }
    }

    const volumenRealHm3 = Number(datoReal.volumen);

    proyeccionCompleta.push({
      paso: indice,
      instanteMin: (indice + 1) * pasoMin,
      volumenHm3: Number(volumenActualHm3.toFixed(4)),
      nivelPorcentaje,
      nivelRealPorcentaje,
      volumenRealHm3: Number.isFinite(volumenRealHm3) ? volumenRealHm3 : null,
      riesgo,
      caudalEntradaM3s,
      caudalEcologicoM3s,
      caudalSalidaRealM3s: caudalSalidaRealM3s,
      caudalSalidaTotalSimuladoM3s: Number(caudalSalidaTotalSimuladoM3s.toFixed(2)),
      desembalseSeguridadM3s: Number(desembalseSeguridadM3s.toFixed(2)),
      desembalseSeguridadHm3: Number(salidaSeguridadHm3.toFixed(4)),
      demandaUrbanaObjetivoHm3: Number(demandaUrbanaPasoHm3.toFixed(4)),
      demandaUrbanaServidaHm3: Number(demandaUrbanaServidaHm3.toFixed(4)),
      demandaAgrariaObjetivoHm3: Number(demandaAgrariaPasoHm3.toFixed(4)),
      demandaAgrariaServidaHm3: Number(demandaAgrariaServidaHm3.toFixed(4)),
      timestampReal: datoReal.timestamp 
    });
  }

  const metricas = generarResumen(proyeccionCompleta);

  const MAX_PUNTOS_FRONTEND = 120;
  const factorMuestreo = Math.max(1, Math.ceil(proyeccionCompleta.length / MAX_PUNTOS_FRONTEND));
  
  const proyeccionDownsampled = proyeccionCompleta.filter((_, idx) => 
    idx % factorMuestreo === 0 || idx === proyeccionCompleta.length - 1
  );

  return {
    tipo: 'historico',
    embalse: {
      id: embalse.id,
      nombre: embalse.nombre,
      capacidadHm3: embalse.capacidadHm3,
      cotaMaximaM: embalse.cotaMaximaM,
      cotaMinimaM: embalse.cotaMinimaM,
    },
    parametros: {
      pasoMin,
      duracionMin: serieHistorica.length * pasoMin,
      mes: null,
      estadoInicial,
      desde: escenario?.desde, 
      hasta: escenario?.hasta,
    },
    proyeccion: proyeccionDownsampled,
    metricas,
  };
}

module.exports = {
  simularEscenarioManual,
  simularEscenarioHistorico,
};