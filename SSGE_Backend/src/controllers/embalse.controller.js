const EmbalseRepository = require('../repositories/embalse.repository');

// --- LÓGICA DE VALIDACIÓN Y PARSEO ---
const parseNumero = (valor, fallback = null) => {
    if (valor === null || valor === undefined || valor === '') return fallback;
    const numero = parseFloat(String(valor).replace(',', '.').trim());
    return Number.isFinite(numero) ? numero : fallback;
};

const validarPayloadEmbalse = (body) => {
    const nombre = String(body?.nombre || '').trim();
    const capacidadHm3 = parseNumero(body?.capacidadHm3);
    const cotaMaximaM = parseNumero(body?.cotaMaximaM);
    const cotaMinimaM = parseNumero(body?.cotaMinimaM);

    if (!nombre) throw new Error('El nombre del embalse es obligatorio');
    if (!Number.isFinite(capacidadHm3) || capacidadHm3 <= 0) throw new Error('La capacidad del embalse debe ser un número mayor a 0');
    if (!Number.isFinite(cotaMaximaM) || !Number.isFinite(cotaMinimaM)) throw new Error('Las cotas máxima y mínima son obligatorias');
    if (cotaMinimaM >= cotaMaximaM) throw new Error('La cota mínima debe ser menor que la cota máxima');

    const sensores = Array.isArray(body?.sensores) ? body.sensores.map(s => {
        const tipo = String(s?.tipo || '').trim();
        if (!tipo) throw new Error('El tipo de sensor es obligatorio');
        return { tipo, valorActual: parseNumero(s?.valorActual, 0) };
    }) : [];

    const compuertas = Array.isArray(body?.compuertas) ? body.compuertas.map((c, i) => {
        const nombreCompuerta = String(c?.nombre || '').trim() || `Compuerta ${i + 1}`;
        const cotaTomaM = parseNumero(c?.cotaTomaM, null);
        const estadoAperturaPorcentaje = parseNumero(c?.estadoAperturaPorcentaje, 0);
        const caudalSalidaActual = parseNumero(c?.caudalSalidaActual, 0);

        if (estadoAperturaPorcentaje < 0 || estadoAperturaPorcentaje > 100) throw new Error('La apertura debe estar entre 0 y 100');
        if (caudalSalidaActual < 0) throw new Error('El caudal de salida no puede ser negativo');
        if (cotaTomaM !== null && (cotaTomaM < cotaMinimaM || cotaTomaM > cotaMaximaM)) throw new Error('La cota de toma de compuerta debe estar dentro del rango del embalse');

        return { nombre: nombreCompuerta, cotaTomaM, estadoAperturaPorcentaje, caudalSalidaActual };
    }) : [];

    return {
        nombre, capacidadHm3, cotaMaximaM, cotaMinimaM,
        saihEstacionCodigo: body?.saihEstacionCodigo ? String(body.saihEstacionCodigo).trim() : null,
        saihIdPunto: body?.saihIdPunto ? String(body.saihIdPunto).trim() : null,
        demandaUrbanaMensual: parseNumero(body?.demandaUrbanaMensual),
        demandaAgrariaMensual: body?.demandaAgrariaMensual || null,
        caudalEcologicoMensual: body?.caudalEcologicoMensual || null,
        evaporacionMensual: body?.evaporacionMensual || null,
        curvaSuperficie: body?.curvaSuperficie || null,
        umbralesSequiaAgraria: body?.umbralesSequiaAgraria || null,
        sensores,
        compuertas,
        senalesAsignadas: Array.isArray(body?.senalesAsignadas) ? body.senalesAsignadas : []
    };
};

// --- CONTROLADORES HTTP ---
const obtenerTodos = async (req, res) => {
	try {
		const embalses = await EmbalseRepository.obtenerTodos();
		res.json(embalses);
	} catch (error) {
    	res.status(500).json({ error: error.message || "Error DB" });
	}
};

const obtenerPorId = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });

    const embalse = await EmbalseRepository.obtenerPorId(id);
    if (!embalse) return res.status(404).json({ error: 'Embalse no encontrado' });
    res.json(embalse);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error DB' });
  }
};

const crear = async (req, res) => {
	try {
        const payloadLimpio = validarPayloadEmbalse(req.body);
		const embalseCreado = await EmbalseRepository.guardar(payloadLimpio);

        const io = req.app.get('io');
        if (io) {
            io.to('ingesta').emit('ingesta:refresh-config', {
                tipo: 'embalse_creado', embalseId: embalseCreado.id, timestamp: new Date().toISOString()
            });
        }
		res.status(201).json(embalseCreado);
	} catch (error) {
		res.status(400).json({ error: error.message || "Error al crear embalse" });
	}
};

const actualizar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });

    const payloadLimpio = validarPayloadEmbalse(req.body);
    const actualizado = await EmbalseRepository.actualizar(id, payloadLimpio);
    res.json(actualizado);
  } catch (error) {
    const msg = error?.message || 'Error al actualizar embalse';
    if (msg.toLowerCase().includes('no existe')) return res.status(404).json({ error: msg });
    res.status(400).json({ error: msg });
  }
};

const eliminar = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

        const embalseEliminado = await EmbalseRepository.eliminarLogico(id);
        res.json({ message: 'Embalse eliminado', embalse: embalseEliminado });
    } catch (error) {
        res.status(400).json({ message: error.message || 'Error al eliminar', error: error.message });
    }
};

const cambiarEstado = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { activo } = req.body;
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
        if (typeof activo !== 'boolean') return res.status(400).json({ error: 'El campo activo debe ser un booleano' });

        const embalseActualizado = await EmbalseRepository.cambiarEstado(id, activo);
        res.json({ message: `Embalse modificado`, embalse: embalseActualizado });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Error al cambiar el estado' });
    }
};

module.exports = { obtenerTodos, obtenerPorId, crear, actualizar, eliminar, cambiarEstado };