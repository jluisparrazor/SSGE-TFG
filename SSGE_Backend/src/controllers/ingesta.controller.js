const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { prisma } = require('../lib/prisma');
const MedicionController = require('../controllers/medicion.controller');

const SCRAPER_DIR = process.env.SCRAPER_DIR || '';
const SCRAPER_DIR_FALLBACK = path.resolve(__dirname, '../../../SSGE_Scraper');

const TAREAS_INGESTA = {
	produccion: 'produccion.js',
	poblar_historico_mes_sin_sobrescribir: 'poblar_historico_mes_sin_sobrescribir.js',
};

const tareasEnEjecucion = new Set();

function obtenerDirectorioScraper() {
	const candidatos = [SCRAPER_DIR, SCRAPER_DIR_FALLBACK].filter(Boolean);
	for (const candidato of candidatos) {
		try {
			if (fs.existsSync(candidato) && fs.statSync(candidato).isDirectory()) {
				return candidato;
			}
		} catch (_error) {}
	}
	const error = new Error('No se encontro el directorio del scraper.');
	error.code = 'SCRAPER_NO_CONFIGURADO';
	throw error;
}

function lanzarScriptIngesta(nombreTarea) {
	const scraperDir = obtenerDirectorioScraper();
	const script = TAREAS_INGESTA[nombreTarea];
	if (!script) {
		const error = new Error('Tarea de ingesta no valida');
		error.code = 'TAREA_NO_VALIDA';
		throw error;
	}
	if (tareasEnEjecucion.has(nombreTarea)) {
		const error = new Error('La tarea ya se esta ejecutando');
		error.code = 'TAREA_EN_EJECUCION';
		throw error;
	}

	const scriptPath = path.join(scraperDir, script);
	if (!fs.existsSync(scriptPath)) {
		const error = new Error(`No se encontro el script ${script} en ${scraperDir}`);
		error.code = 'SCRIPT_NO_ENCONTRADO';
		throw error;
	}

	tareasEnEjecucion.add(nombreTarea);
	const proceso = spawn('node', [scriptPath], { cwd: scraperDir, detached: true, stdio: 'ignore' });
	proceso.on('error', () => tareasEnEjecucion.delete(nombreTarea));
	proceso.on('exit', () => tareasEnEjecucion.delete(nombreTarea));
	proceso.unref();
}

const obtenerEmbalsesConfig = async (_req, res) => {
	try {
		const embalses = await prisma.embalse.findMany({
			where: { eliminado: false },
			select: {
				id: true, nombre: true, saihEstacionCodigo: true, saihIdPunto: true,
				senalesAsignadas: {
					where: { activa: true },
					select: { senal: { select: { codigo: true, nombre: true } } },
				},
			},
		});
		return res.json(embalses);
	} catch (error) {
		console.error('Error en GET /api/ingesta/embalses-config:', error.message);
		return res.status(500).json({ error: 'Error DB' });
	}
};

const cargarRangoHistorico = async (req, res) => {
  try {
    const { embalseId, estacionCodigo, desde, hasta } = req.body;
    if (!embalseId || !estacionCodigo || !desde || !hasta) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios' });
    }

    const embalse = await prisma.embalse.findUnique({ where: { id: Number(embalseId) } });
    if (!embalse) return res.status(404).json({ error: 'Embalse no encontrado' });

    const formatFechaSAIH = (fechaStr) => {
      const [yyyy, mm, dd] = fechaStr.split('-');
      return `${dd}/${mm}/${yyyy}`;
    };

    const scraperDir = obtenerDirectorioScraper();
    const { obtenerDatosEstacion } = require(path.join(scraperDir, 'saih_sdk.js'));

    const datosNuevos = await obtenerDatosEstacion(estacionCodigo, formatFechaSAIH(desde), formatFechaSAIH(hasta));

    if (!datosNuevos || datosNuevos.length === 0) {
      return res.json({ ok: true, mensaje: 'La CHG no devolvió datos para este rango.', registrosNuevos: 0 });
    }

    const datosValidos = datosNuevos.filter(fila => fila['NIVEL EMBALSE (m.s.n.m)'] && fila['NIVEL EMBALSE (m.s.n.m)'].trim() !== '' && fila['Fecha y Hora'] && fila['Fecha y Hora'].trim() !== '');

    let registrosGuardados = 0;
    for (const fila of datosValidos) {
      try {
        await MedicionController.procesarYGuardarPayload({
          origen: 'SAIH_CHG_HISTORICO_ONDEMAND', embalse: embalse.nombre,
          embalseId: embalse.id, timestamp: fila['Fecha y Hora'].trim(), mediciones: fila,
        });
        registrosGuardados++;
      } catch (err) {
        console.warn(`Aviso al guardar histórico:`, err.message);
      }
    }

    return res.json({ ok: true, mensaje: `Datos extraídos del SAIH correctamente.`, registrosNuevos: registrosGuardados });
  } catch (error) {
    console.error('Error cargando datos del SAIH bajo demanda:', error);
    return res.status(500).json({ error: 'Error al comunicarse con el scraper o la BD' });
  }
};

const ejecutarTarea = async (req, res) => {
	try {
		const tarea = typeof req.body?.tarea === 'string' ? req.body.tarea.trim() : '';
		if (!tarea) return res.status(400).json({ error: 'tarea es obligatoria' });

		lanzarScriptIngesta(tarea);
		return res.status(202).json({ ok: true, mensaje: `Tarea ${tarea} lanzada correctamente` });
	} catch (error) {
		if (error?.code === 'TAREA_EN_EJECUCION') return res.status(409).json({ error: error.message });
		if (error?.code === 'TAREA_NO_VALIDA') return res.status(400).json({ error: error.message });
		if (error?.code === 'SCRIPT_NO_ENCONTRADO') return res.status(404).json({ error: error.message });
		if (error?.code === 'SCRAPER_NO_CONFIGURADO') return res.status(500).json({ error: error.message });
		return res.status(500).json({ error: error.message || 'No se pudo lanzar la tarea' });
	}
};

module.exports = { obtenerEmbalsesConfig, cargarRangoHistorico, ejecutarTarea };