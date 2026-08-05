const { prisma } = require('../lib/prisma');
const { simularEscenarioManual, simularEscenarioHistorico } = require('../services/MotorSimulacion');

const ejecutarSimulacion = async (req, res) => {
  try {
    const { embalseId, estadoInicial, escenario } = req.body || {};

    const embalseIdNumero = Number(embalseId);
    if (!Number.isInteger(embalseIdNumero) || embalseIdNumero <= 0) {
      return res.status(400).json({ error: 'embalseId debe ser un entero positivo' });
    }

    if (!escenario || !['manual', 'historico'].includes(escenario.tipo)) {
      return res.status(400).json({ error: 'Tipo de escenario no válido' });
    }

    const embalse = await prisma.embalse.findFirst({
      where: { id: embalseIdNumero, eliminado: false },
      select: {
        id: true,
        nombre: true,
        capacidadHm3: true,
        cotaMaximaM: true,
        cotaMinimaM: true,
        demandaUrbanaMensual: true,
        demandaAgrariaMensual: true,
        caudalEcologicoMensual: true,
        evaporacionMensual: true,
        curvaSuperficie: true,
        umbralesSequiaAgraria: true,
      },
    });

    if (!embalse) {
      return res.status(404).json({ error: 'Embalse no encontrado' });
    }

    let resultado;

    if (escenario.tipo === 'manual') {
      resultado = simularEscenarioManual({ embalse, estadoInicial, escenario });
    } else {
      const fechaDesde = new Date(escenario.desde);
      const fechaHasta = new Date(escenario.hasta);

      if (Number.isNaN(fechaDesde.getTime()) || Number.isNaN(fechaHasta.getTime())) {
        return res.status(400).json({ error: 'Fechas inválidas para escenario histórico' });
      }

      if (fechaDesde > fechaHasta) {
        return res.status(400).json({ error: 'El rango histórico es inválido (desde > hasta)' });
      }

      fechaHasta.setHours(23, 59, 59, 999);

      const serieHistorica = await prisma.medicionHistorica.findMany({
        where: {
          embalseId: embalse.id,
          timestamp: { gte: fechaDesde, lte: fechaHasta },
        },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true, caudalEntrada: true, volumen: true, caudalSalida: true },
      });

      if (serieHistorica.length === 0) {
        return res.status(404).json({ error: 'No hay datos históricos en ese rango.' });
      }

      resultado = simularEscenarioHistorico({ embalse, estadoInicial, serieHistorica, escenario });
    }

    const resultadoGuardado = await prisma.$transaction(async (tx) => {
      const creado = await tx.resultadoSimulacion.create({
        data: {
          tipo: resultado.tipo,
          embalseId: embalse.id,
          parametrosInput: resultado.parametros,
          proyeccion: resultado.proyeccion,
          alertaMaxima: resultado.metricas.alertaMaxima,
          duracionMin: Number(resultado.parametros?.duracionMin) || 0,
        },
        select: { id: true, fechaEjecucion: true },
      });

      const idsConservar = await tx.resultadoSimulacion.findMany({
        where: { embalseId: embalse.id },
        orderBy: [{ fechaEjecucion: 'desc' }, { id: 'desc' }],
        take: 15,
        select: { id: true },
      });

      await tx.resultadoSimulacion.deleteMany({
        where: {
          embalseId: embalse.id,
          id: { notIn: idsConservar.map((x) => x.id) },
        },
      });

      return creado;
    });

    return res.json({
      ...resultado,
      id: resultadoGuardado.id,
      fechaEjecucion: resultadoGuardado.fechaEjecucion,
    });
  } catch (error) {
    console.error('Error en ejecución:', error);
    return res.status(400).json({ error: error.message || 'Error en simulación' });
  }
};

const exportarSimulacion = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID de simulación inválido' });

    const simulacion = await prisma.resultadoSimulacion.findUnique({
      where: { id },
      include: { embalse: true }
    });

    if (!simulacion) return res.status(404).json({ error: 'Simulación no encontrada' });

    const proyeccion = simulacion.proyeccion || [];
    const cabeceras = [
      'Paso', 'Minutos', 'Nivel (%)', 'Volumen (hm3)', 
      'Entrada (m3/s)', 'Ecologico (m3/s)', 'Desembalse (m3/s)',
      'Urbana Servida (hm3)', 'Agraria Servida (hm3)', 'Situacion'
    ];

    const filas = proyeccion.map(p => [
      p.paso, p.instanteMin, p.nivelPorcentaje, p.volumenHm3, p.caudalEntradaM3s,
      p.caudalEcologicoM3s, p.desembalseSeguridadM3s, p.demandaUrbanaServidaHm3,
      p.demandaAgrariaServidaHm3, p.riesgo
    ]);

    const csvContent = [cabeceras.join(','), ...filas.map(fila => fila.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="simulacion_${id}_${simulacion.embalse.nombre.replace(/\s+/g, '_')}.csv"`);
    return res.send(csvContent);
  } catch (error) {
    console.error('Error al exportar simulación:', error.message);
    return res.status(500).json({ error: 'Error al generar el archivo de exportación' });
  }
};

const obtenerSimulaciones = async (req, res) => {
  try {
    const embalseIdRaw = req.query.embalseId;
    const embalseId = embalseIdRaw !== undefined ? Number(embalseIdRaw) : undefined;

    if (embalseIdRaw !== undefined && (!Number.isInteger(embalseId) || embalseId <= 0)) {
      return res.status(400).json({ error: 'embalseId debe ser un entero positivo' });
    }

    const resultados = await prisma.resultadoSimulacion.findMany({
      where: embalseId ? { embalseId } : undefined,
      orderBy: { fechaEjecucion: 'desc' },
      take: 15,
      select: {
        id: true,
        fechaEjecucion: true,
        tipo: true,
        alertaMaxima: true,
        duracionMin: true,
        parametrosInput: true,
        embalse: { select: { id: true, nombre: true } },
      },
    });

    return res.json(resultados);
  } catch (error) {
    console.error('Error en GET /api/simulaciones:', error);
    return res.status(500).json({ error: error.message || 'Error DB' });
  }
};

const obtenerSimulacionPorId = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

    const simulacion = await prisma.resultadoSimulacion.findUnique({
      where: { id },
      include: { embalse: true }
    });

    if (!simulacion) return res.status(404).json({ error: 'Simulación no encontrada' });

    const proyeccion = simulacion.proyeccion || [];
    const volumenTotalDesembalsadoHm3 = proyeccion.reduce((acc, p) => acc + (p.desembalseSeguridadHm3 || 0), 0);
    const totalUrbanaObjetivo = proyeccion.reduce((acc, p) => acc + (p.demandaUrbanaObjetivoHm3 || 0), 0);
    const totalUrbanaServida = proyeccion.reduce((acc, p) => acc + (p.demandaUrbanaServidaHm3 || 0), 0);
    const totalAgrariaObjetivo = proyeccion.reduce((acc, p) => acc + (p.demandaAgrariaObjetivoHm3 || 0), 0);
    const totalAgrariaServida = proyeccion.reduce((acc, p) => acc + (p.demandaAgrariaServidaHm3 || 0), 0);

    const metricas = {
      alertaMaxima: simulacion.alertaMaxima,
      volumenTotalDesembalsadoHm3: Number(volumenTotalDesembalsadoHm3.toFixed(4)),
      demandaUrbanaSatisfechaPct: totalUrbanaObjetivo > 0 ? Number(((totalUrbanaServida / totalUrbanaObjetivo) * 100).toFixed(2)) : 100,
      demandaAgrariaSatisfechaPct: totalAgrariaObjetivo > 0 ? Number(((totalAgrariaServida / totalAgrariaObjetivo) * 100).toFixed(2)) : 100,
    };

    return res.json({
      id: simulacion.id, fechaEjecucion: simulacion.fechaEjecucion, tipo: simulacion.tipo,
      embalse: simulacion.embalse, parametros: simulacion.parametrosInput, proyeccion, metricas
    });
  } catch (error) {
    console.error('Error al obtener la simulación:', error.message);
    return res.status(500).json({ error: 'Error al recuperar la simulación' });
  }
};

const eliminarSimulacion = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID de simulación inválido' });

    await prisma.resultadoSimulacion.delete({ where: { id } });
    return res.json({ message: 'Simulación eliminada correctamente' });
  } catch (error) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'La simulación no existe' });
    console.error('Error en DELETE /api/simulaciones/:id:', error.message);
    return res.status(500).json({ error: 'Error al eliminar la simulación' });
  }
};

const obtenerHistorial = async (req, res) => {
  try {
    const embalseIdRaw = req.query.embalseId;
    const embalseId = embalseIdRaw !== undefined ? Number(embalseIdRaw) : undefined;
    const limiteRaw = Number(req.query.limite);
    const limite = Number.isFinite(limiteRaw) && limiteRaw > 0 ? Math.min(1000, Math.floor(limiteRaw)) : 4;

    if (embalseIdRaw !== undefined && (!Number.isInteger(embalseId) || embalseId <= 0)) {
      return res.status(400).json({ error: 'embalseId debe ser un número entero positivo' });
    }

    const historiales = await prisma.historialSimulacion.findMany({
      where: embalseId ? { embalseId } : undefined,
      orderBy: { fechaHora: 'desc' },
      take: limite,
      select: { id: true, tipo: true, fechaHora: true, eventoDisparador: true, accionAutomatica: true },
    });

    const resultados = historiales.map(item => ({
      id: item.id, tipo: item.tipo || 'info',
      hora: item.fechaHora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      titulo: item.eventoDisparador, descripcion: item.accionAutomatica, fechaHora: item.fechaHora,
    }));

    res.json(resultados);
  } catch (error) {
    console.error('Error en /api/historial-simulacion:', error);
    res.status(500).json({ error: error.message || "Error DB" });
  }
};

module.exports = {
  ejecutarSimulacion,
  exportarSimulacion,
  obtenerSimulaciones,
  obtenerSimulacionPorId,
  eliminarSimulacion,
  obtenerHistorial
};