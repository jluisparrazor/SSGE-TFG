/**
 * Convierte un string de fecha (ISO estándar o custom antiguo del SAIH) 
 * a un objeto Date nativo. Devuelve null si el formato es inválido.
 */
export function parsearTimestampBackend(texto) {
  if (!texto || typeof texto !== 'string') return null;

  // Si ya viene en formato ISO estándar (comportamiento por defecto de Prisma)
  if (texto.includes('T')) {
    const fechaIso = new Date(texto);
    return Number.isNaN(fechaIso.getTime()) ? null : fechaIso;
  }

  // Si viene en el formato antiguo del scraper (dd/mm/yy-hh:mm)
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

/**
 * Convierte un string de fecha a milisegundos.
 * Fundamental para que la gráfica de Recharts ordene correctamente el eje X.
 */
export function parseDateToMs(dateStr) {
  if (!dateStr) return 0;
  
  const fecha = parsearTimestampBackend(dateStr);
  if (fecha) return fecha.getTime();
  
  // Fallback de seguridad
  const fechaNativa = new Date(dateStr);
  return isNaN(fechaNativa.getTime()) ? 0 : fechaNativa.getTime();
}

/**
 * Formatea una fecha completa para mostrar en interfaz (ej: tablas o encabezados).
 * Devuelve DD/MM/YY, HH:mm
 */
export function formatearFecha(fechaTexto) {
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

/**
 * Formatea una fecha resumida, ideal para los tooltips de gráficas (sin el año).
 * Devuelve DD/MM, HH:mm
 */
export function formatearFechaGrafica(timestampTexto) {
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

/**
 * Específica para el footer de la aplicación.
 * Garantiza que siempre haya un texto visible aunque falle el parseo.
 */
export function formatearFechaFooter(fechaTexto) {
  if (!fechaTexto || fechaTexto === '--/--/-- --:--') return fechaTexto;
  
  const fecha = parsearTimestampBackend(fechaTexto);
  if (!fecha || isNaN(fecha.getTime())) return fechaTexto;
  
  return fecha.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}