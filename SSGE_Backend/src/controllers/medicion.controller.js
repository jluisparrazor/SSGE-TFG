const MedicionRepository = require('../repositories/medicion.repository');

const TZ_SAIH = 'Europe/Madrid';

const obtenerOffsetMinutos = (zonaHoraria, instanteMs) => {
    const partes = new Intl.DateTimeFormat('en-GB', {
        timeZone: zonaHoraria,
        timeZoneName: 'shortOffset',
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(new Date(instanteMs));

    const tz = partes.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0';
    const match = tz.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
    if (!match) return 0;

    const horas = Number(match[1]);
    const minutos = Number(match[2] || 0);
    const signo = horas >= 0 ? 1 : -1;
    return (Math.abs(horas) * 60 + minutos) * signo;
};

const construirFechaDesdeMadrid = (anio, mes, dia, hora, minuto) => {
    const utcTentativa = Date.UTC(anio, mes - 1, dia, hora, minuto, 0, 0);
    const offsetMin = obtenerOffsetMinutos(TZ_SAIH, utcTentativa);
    return new Date(utcTentativa - offsetMin * 60 * 1000);
};

// --- FUNCIONES DE PARSEO Y LIMPIEZA ---
const parsearFecha = (fechaStr) => {
    if (!fechaStr) return new Date();
    try {
        const valor = String(fechaStr).trim();

        // ISO (por ejemplo, Prisma/REST): se respeta tal cual
        if (valor.includes('T')) {
            const fechaIso = new Date(valor);
            return Number.isNaN(fechaIso.getTime()) ? new Date() : fechaIso;
        }

        // SAIH: dd/mm/yy-hh:mm o dd/mm/yyyy hh:mm
        const match = valor.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})[-\s](\d{2}):(\d{2})$/);
        if (match) {
            const [, dd, mm, yyOrYyyy, hh, min] = match;
            const anio = yyOrYyyy.length === 2 ? Number(`20${yyOrYyyy}`) : Number(yyOrYyyy);
            const fechaMadrid = construirFechaDesdeMadrid(
                anio,
                Number(mm),
                Number(dd),
                Number(hh),
                Number(min)
            );
            return Number.isNaN(fechaMadrid.getTime()) ? new Date() : fechaMadrid;
        }

        // Fallback genérico
        const fechaObj = new Date(valor);
        return Number.isNaN(fechaObj.getTime()) ? new Date() : fechaObj;
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

const construirEstadoBase = (ultimos) => ({
    nivel: ultimos.estadoPrevio.nivel,
    volumen: ultimos.estadoPrevio.volumen,
    precipitacion: ultimos.estadoPrevio.precipitacion,
    temperatura: ultimos.estadoPrevio.temperatura,
    caudalEntrada: ultimos.respaldoEntrada,
    caudalSalida: ultimos.respaldoSalida,
});

const construirRegistroHistorico = (payload, estadoAnterior, embalseId) => {
    const siguienteEstado = {
        nivel: extraerSeguro(payload, 'NIVEL EMBALSE (m.s.n.m)', estadoAnterior.nivel),
        volumen: extraerSeguro(payload, 'VOLUMEN EMBALSADO (hm³)', estadoAnterior.volumen),
        precipitacion: extraerSeguro(payload, 'PRECIPITACION (l/m²)', estadoAnterior.precipitacion),
        temperatura: extraerSeguro(payload, 'TEMPERATURA (ºC)', estadoAnterior.temperatura),
        caudalEntrada: extraerCaudal(payload, 'APORTACION AL EMBALSE (m³/s)', estadoAnterior.caudalEntrada),
        caudalSalida: extraerCaudal(payload, [
            'CAUDAL DESEMBALSADO (m³/s)',
            'CAUDAL DESEMBALSADO AL RIO (m³/s)'
        ], estadoAnterior.caudalSalida),
    };

    return {
        registro: {
            embalseId,
            timestamp: parsearFecha(payload.timestamp),
            ...siguienteEstado,
        },
        siguienteEstado,
    };
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

const procesarYGuardarLote = async ({ embalseId, registros }) => {
    let embalseIdFinal = Number(embalseId);

    if (!Number.isFinite(embalseIdFinal)) {
        embalseIdFinal = await MedicionRepository.obtenerPrimerEmbalseId();
        if (!embalseIdFinal) throw new Error('No hay embalses creados en la base de datos');
    } else {
        const existe = await MedicionRepository.verificarEmbalseExiste(embalseIdFinal);
        if (!existe) {
            embalseIdFinal = await MedicionRepository.obtenerPrimerEmbalseId();
            if (!embalseIdFinal) throw new Error('No hay embalses creados en la base de datos');
        }
    }

    if (!Array.isArray(registros) || registros.length === 0) {
        return 0;
    }

    const ultimos = await MedicionRepository.obtenerUltimosDatos(embalseIdFinal);
    let estadoActual = construirEstadoBase(ultimos);

    const registrosNormalizados = registros.map((payload) => {
        const { registro, siguienteEstado } = construirRegistroHistorico(payload, estadoActual, embalseIdFinal);
        estadoActual = siguienteEstado;
        return registro;
    });

    return MedicionRepository.insertarLote(registrosNormalizados);
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

module.exports = { procesarYGuardarPayload, procesarYGuardarLote, obtenerPorRango, guardar };