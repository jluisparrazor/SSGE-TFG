const MedicionRepository = require('../repositories/medicion.repository');

// --- FUNCIONES DE PARSEO Y LIMPIEZA ---
const parsearFecha = (fechaStr) => {
    if (!fechaStr) return new Date();
    try {
        // 1. Cambiamos posibles guiones por espacios para homogeneizar
        const limpia = fechaStr.trim().replace('-', ' ');
        // 2. Separamos fecha y hora (asignamos '00:00' por defecto si no hay hora)
        const [fecha, hora = '00:00'] = limpia.split(' ');
        const [dia, mes, anio] = fecha.split('/');
        
        // 3. Si el año viene como '26', lo pasamos a '2026'. Si ya es '2026', lo dejamos igual
        const anioFinal = (anio && anio.length === 2) ? `20${anio}` : anio;
        
        const fechaObj = new Date(`${anioFinal}-${mes}-${dia}T${hora}:00`);
        
        // 4. Comprobación vital: si JS genera un "Invalid Date", devolvemos la fecha actual
        if (isNaN(fechaObj.getTime())) return new Date();
        
        return fechaObj;
    } catch (e) {
        return new Date();
    }
};

const extraerSeguro = (payload, clave, valorRespaldado) => {
    const crudo = payload.mediciones?.[clave];
    if (crudo && String(crudo).trim() !== "") return parseFloat(String(crudo).replace(',', '.'));
    return valorRespaldado;
};

const extraerCaudal = (payload, claves, valorRespaldado) => {
    const listaNombres = Array.isArray(claves) ? claves : [claves];
    for (const clave of listaNombres) {
        const crudo = payload.mediciones?.[clave];
        if (crudo && String(crudo).trim() !== "") {
            const num = parseFloat(String(crudo).replace(',', '.'));
            if (num > 0) return num;
        }
    }
    return valorRespaldado;
};

// --- LÓGICA DE NEGOCIO PRINCIPAL ---
const procesarYGuardarPayload = async (payload) => {
    let embalseId = Number(payload?.embalseId);

    if (!Number.isFinite(embalseId)) {
        embalseId = await MedicionRepository.obtenerPrimerEmbalseId();
        if (!embalseId) throw new Error('No hay embalses creados en la base de datos');
    } else {
        const existe = await MedicionRepository.verificarEmbalseExiste(embalseId);
        if (!existe) {
            embalseId = await MedicionRepository.obtenerPrimerEmbalseId();
            if (!embalseId) throw new Error('No hay embalses creados en la base de datos');
        }
    }

    const fechaParseada = parsearFecha(payload.timestamp);
    const ultimos = await MedicionRepository.obtenerUltimosDatos(embalseId);

    const dataObj = {
        nivel: extraerSeguro(payload, 'NIVEL EMBALSE (m.s.n.m)', ultimos.estadoPrevio.nivel),
        volumen: extraerSeguro(payload, 'VOLUMEN EMBALSADO (hm³)', ultimos.estadoPrevio.volumen),
        precipitacion: extraerSeguro(payload, 'PRECIPITACION (l/m²)', ultimos.estadoPrevio.precipitacion),
        temperatura: extraerSeguro(payload, 'TEMPERATURA (ºC)', ultimos.estadoPrevio.temperatura),
        caudalEntrada: extraerCaudal(payload, 'APORTACION AL EMBALSE (m³/s)', ultimos.respaldoEntrada),
        caudalSalida: extraerCaudal(payload, [
            'CAUDAL DESEMBALSADO (m³/s)',
            'CAUDAL DESEMBALSADO AL RIO (m³/s)'
        ], ultimos.respaldoSalida)
    };

    return MedicionRepository.upsert(embalseId, fechaParseada, dataObj);
};

// --- RUTAS HTTP ---
const obtenerPorRango = async (req, res) => {
    try {
        const { rango, embalseId } = req.query; 
        
        let embalseIdFinal = Number(embalseId);
        if (!Number.isFinite(embalseIdFinal)) {
            embalseIdFinal = await MedicionRepository.obtenerPrimerEmbalseId();
            if (!embalseIdFinal) return res.json([]);
        }

        const fechaLimite = new Date();
        switch (rango) {
            case 'mes': case 'month': fechaLimite.setMonth(fechaLimite.getMonth() - 1); break;
            case 'semana': case 'week': fechaLimite.setDate(fechaLimite.getDate() - 7); break;
            case 'dia': case 'day': default: fechaLimite.setDate(fechaLimite.getDate() - 1); break;
        }

        const mediciones = await MedicionRepository.obtenerPorRango(embalseIdFinal, fechaLimite);
        res.json(mediciones);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Error DB' });
    }
};

const guardar = async (req, res) => {
    try {
        const resultado = await procesarYGuardarPayload(req.body);
        res.status(201).json(resultado);
    } catch (error) {
        res.status(400).json({ error: error.message || "Error al guardar medición" });
    }
};

module.exports = { procesarYGuardarPayload, obtenerPorRango, guardar };