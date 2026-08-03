/**
 * Intenta convertir cualquier valor a un número finito, reemplazando comas por puntos.
 * Si falla, no es numérico, o viene vacío, devuelve el valor fallback de seguridad (por defecto 0).
 */
export function parseNumero(valor, fallback = 0) {
  if (valor === null || valor === undefined || valor === '') return fallback;
  
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : fallback;
  
  if (typeof valor === 'string') {
    const limpio = valor.trim();
    if (!limpio) return fallback;
    // Sustituye coma decimal por punto decimal para evitar retornos NaN
    const n = parseFloat(limpio.replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }
  
  return fallback;
}

/**
 * Devuelve un string numérico redondeado a la cantidad de decimales deseada.
 * Si el valor no es válido, devuelve '--' para mantener la estética en tablas e infografías.
 */
export function formatearNumeroSeguro(valor, decimales = 2) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '--';
  return numero.toFixed(decimales);
}