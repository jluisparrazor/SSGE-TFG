const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, 'reglasDifusas.json');

const DEFAULT_REGLAS_DIFUSAS = {
  nivel: {
    bajo: [0, 0, 40, 60],
    medio: [50, 70, 85, 90],
    alto: [85, 95, 98, 99],
    critico: [98, 99, 100, 100],
  },
  entrada: {
    escasa: [0, 0, 5, 15],
    moderada: [10, 20, 40, 60],
    intensa: [40, 70, 120, 180],
    torrencial: [150, 200, 1000, 1000],
  },
  salidas: {
    regla1: { modo: 'max_factor', minimo: 30, factor: 1.5 },
    regla2: { modo: 'max_factor', minimo: 25, factor: 1.25 },
    regla3: { modo: 'fijo', fijo: 15 },
    regla4: { modo: 'max_factor', minimo: 10, factor: 0.6 },
    regla5: { modo: 'max_factor', minimo: 2, factor: 0.8 },
    regla6: { modo: 'max_factor', minimo: 0.5, factor: 0.5 },
    regla7: { modo: 'max_factor', minimo: 0.3, factor: 0.1 },
  },
  fallbackM3s: 0.3,
};

let cacheReglas = null;

function clonar(objeto) {
  return JSON.parse(JSON.stringify(objeto));
}

function asegurarNumero(nombre, valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    throw new Error(`El campo ${nombre} debe ser numerico.`);
  }
  return numero;
}

function validarTrapecio(nombre, valor) {
  if (!Array.isArray(valor) || valor.length !== 4) {
    throw new Error(`El campo ${nombre} debe ser un array de 4 valores.`);
  }

  const [a, b, c, d] = valor.map((item, idx) => asegurarNumero(`${nombre}[${idx}]`, item));
  if (a > b || b > c || c > d) {
    throw new Error(`El campo ${nombre} debe estar ordenado: a <= b <= c <= d.`);
  }
  return [a, b, c, d];
}

function validarSalidaRegla(nombre, valor) {
  if (!valor || typeof valor !== 'object') {
    throw new Error(`La salida ${nombre} no es valida.`);
  }

  const modo = String(valor.modo || '').trim();
  if (!['max_factor', 'fijo'].includes(modo)) {
    throw new Error(`La salida ${nombre} debe usar modo 'max_factor' o 'fijo'.`);
  }

  if (modo === 'fijo') {
    const fijo = asegurarNumero(`${nombre}.fijo`, valor.fijo);
    if (fijo < 0) throw new Error(`El campo ${nombre}.fijo debe ser >= 0.`);
    return { modo: 'fijo', fijo };
  }

  const minimo = asegurarNumero(`${nombre}.minimo`, valor.minimo);
  const factor = asegurarNumero(`${nombre}.factor`, valor.factor);

  if (minimo < 0 || factor < 0) {
    throw new Error(`Los campos ${nombre}.minimo y ${nombre}.factor deben ser >= 0.`);
  }

  return { modo: 'max_factor', minimo, factor };
}

function validarReglasDifusas(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('La configuracion de reglas difusas no es valida.');
  }

  const validado = {
    nivel: {
      bajo: validarTrapecio('nivel.bajo', raw?.nivel?.bajo),
      medio: validarTrapecio('nivel.medio', raw?.nivel?.medio),
      alto: validarTrapecio('nivel.alto', raw?.nivel?.alto),
      critico: validarTrapecio('nivel.critico', raw?.nivel?.critico),
    },
    entrada: {
      escasa: validarTrapecio('entrada.escasa', raw?.entrada?.escasa),
      moderada: validarTrapecio('entrada.moderada', raw?.entrada?.moderada),
      intensa: validarTrapecio('entrada.intensa', raw?.entrada?.intensa),
      torrencial: validarTrapecio('entrada.torrencial', raw?.entrada?.torrencial),
    },
    salidas: {
      regla1: validarSalidaRegla('salidas.regla1', raw?.salidas?.regla1),
      regla2: validarSalidaRegla('salidas.regla2', raw?.salidas?.regla2),
      regla3: validarSalidaRegla('salidas.regla3', raw?.salidas?.regla3),
      regla4: validarSalidaRegla('salidas.regla4', raw?.salidas?.regla4),
      regla5: validarSalidaRegla('salidas.regla5', raw?.salidas?.regla5),
      regla6: validarSalidaRegla('salidas.regla6', raw?.salidas?.regla6),
      regla7: validarSalidaRegla('salidas.regla7', raw?.salidas?.regla7),
    },
    fallbackM3s: asegurarNumero('fallbackM3s', raw.fallbackM3s),
  };

  if (validado.fallbackM3s < 0) {
    throw new Error('fallbackM3s debe ser >= 0.');
  }

  return validado;
}

function leerDisco() {
  if (!fs.existsSync(STORE_PATH)) {
    return clonar(DEFAULT_REGLAS_DIFUSAS);
  }

  const contenido = fs.readFileSync(STORE_PATH, 'utf8');
  if (!contenido.trim()) {
    return clonar(DEFAULT_REGLAS_DIFUSAS);
  }

  const parseado = JSON.parse(contenido);
  return validarReglasDifusas(parseado);
}

function getReglasDifusas() {
  if (!cacheReglas) {
    cacheReglas = leerDisco();
  }
  return clonar(cacheReglas);
}

function setReglasDifusas(payload) {
  const reglas = validarReglasDifusas(payload);
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(reglas, null, 2)}\n`, 'utf8');
  cacheReglas = reglas;
  return clonar(cacheReglas);
}

module.exports = {
  DEFAULT_REGLAS_DIFUSAS,
  getReglasDifusas,
  setReglasDifusas,
  validarReglasDifusas,
};