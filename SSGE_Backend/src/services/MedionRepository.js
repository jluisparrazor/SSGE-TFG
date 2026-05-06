const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const url = new URL(process.env.DATABASE_URL);
// Configuración de la conexión a PostgreSQL usando pg
const pool = new Pool({
    user: url.username,
    password: url.password,
    host: url.hostname,
    port: parseInt(url.port || '5432', 10),
    database: url.pathname.slice(1)
});
// Configuración de Prisma con el adaptador de PostgreSQL
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });


class MedionRepository {

    // Método privado para parsear la fecha del formato "dd/MM/yy-HH:mm"
    static _parsearFecha(fechaStr) {
        try {
        const [fecha, hora] = fechaStr.split('-');
        const [dia, mes, anioCorto] = fecha.split('/');
        
        // hora ya viene como "22:00", así que solo le añadimos un ":00" para los segundos
        return new Date(`20${anioCorto}-${mes}-${dia}T${hora}:00`); 
        } catch (e) {
        return new Date();
        }
    }

    // Método para obtener mediciones por rango de tiempo
    static async obtenerPorRango(rango, embalseId, limite = 500){
        const fechaLimite = new Date();

        switch (rango) {
            case 'mes':
            case 'month':
                fechaLimite.setMonth(fechaLimite.getMonth() - 1);
                break;
            case 'semana':
            case 'week':
                fechaLimite.setDate(fechaLimite.getDate() - 7);
                break;
            case 'dia':
            case 'day':
            default:
                fechaLimite.setDate(fechaLimite.getDate() - 1);
                break;
        }

        let embalseIdFinal = embalseId;
        if (!embalseIdFinal) {
            const embalse = await prisma.embalse.findFirst({ orderBy: { id: 'asc' } });
            if (!embalse) return [];
            embalseIdFinal = embalse.id;
        }
        
        return await prisma.medicionHistorica.findMany({
            where: {
                embalseId: embalseIdFinal,
                timestamp: { gte: fechaLimite }
            },
            orderBy: { timestamp: 'desc' },
            take: limite
        });
    }

    // Método para guardar una nueva medición
    static async guardar(payload) {
        let embalseId = Number(payload?.embalseId);
        if (!Number.isFinite(embalseId)) {
            const embalse = await prisma.embalse.findFirst({ orderBy: { id: 'asc' } });
            if (!embalse) {
                throw new Error('No hay embalses creados en la base de datos');
            }
            embalseId = embalse.id;
        } else {
            const embalseExiste= await prisma.embalse.findUnique({ where: { id: embalseId } });
            if (!embalseExiste) {
                const embalseFallback = await prisma.embalse.findFirst({ orderBy: { id: 'asc' } });
                if (!embalseFallback) {
                    throw new Error('No hay embalses creados en la base de datos');
                }
                embalseId = embalseFallback.id;
            }
        }

        const fechaParseada = this._parsearFecha(payload.timestamp);

        //Comprobar si ya existe una medición para ese timestamp y embalse
        const registroExistente = await prisma.medicionHistorica.findFirst({
            where: {
                embalseId,
                timestamp: fechaParseada
            }
        });

        // Si existe, actualizamos el registro existente
        const estadoPrevio = await prisma.medicionHistorica.findFirst({
            where: { embalseId: embalseId },
            orderBy: { timestamp: 'desc' }
        }) || {nivel: 0, volumen: 0, precipitacion: 0, temperatura: 0};

        const ultimoEntrada = await prisma.medicionHistorica.findFirst({
            where: { embalseId: embalseId, caudalSalida: { gt: 0 } },
            orderBy: { timestamp: 'desc' }
        });
        const ultimoSalida = await prisma.medicionHistorica.findFirst({
            where: { embalseId: embalseId, caudalEntrada: { gt: 0 } },
            orderBy: { timestamp: 'desc' }
        });

        const respaldoEntrada = ultimoEntrada ? ultimoEntrada.caudalEntrada : 0;
        const respaldoSalida = ultimoSalida ? ultimoSalida.caudalSalida : 0;

        // DEBUG: mostrar qué campos de caudal vieron en el payload
        const hayAportacion = payload.mediciones['APORTACION AL EMBALSE (m³/s)'];
        const hayDesembalse = payload.mediciones['CAUDAL DESEMBALSADO (m³/s)'];
        const hayDesembalseRio = payload.mediciones['CAUDAL DESEMBALSADO AL RIO (m³/s)'];

        if (embalseId === 2 && (hayAportacion || hayDesembalse || hayDesembalseRio)) { 
            console.log(`\n[DEBUG] ${payload.timestamp} - Siles:`, {
                aportacion: hayAportacion || '(vacío)',
                desembalse: hayDesembalse || '(vacío)',
                desembalse_rio: hayDesembalseRio || '(vacío)'
            });
        }

        //Extracción segura de los caudales, con respaldo en caso de datos faltantes o mal formateados
        const extraerSeguro = (clave, valorRespaldado) => {
            const crudo = payload.mediciones[clave];
            if (crudo && crudo.trim() !== "") return parseFloat(crudo.replace(',', '.'));
            return valorRespaldado;
        };

        const extraerCaudal = (clave, valorRespaldado) => {
            const listaNombres = Array.isArray(clave) ? clave : [clave];

            for (const clave of listaNombres) {
                const crudo = payload.mediciones[clave];
                if (crudo && crudo.trim() !== "") {
                    const num = parseFloat(crudo.replace(',', '.'));
                    if (num > 0) return num;
                }
            }
            //Si es 0 vacio, arrastra el último > 0 histórico, o el respaldo si no hay histórico
            return valorRespaldado;
        };

        const dataObj = {
            nivel: extraerSeguro('NIVEL EMBALSE (m.s.n.m)', estadoPrevio.nivel),
            volumen: extraerSeguro('VOLUMEN EMBALSADO (hm³)', estadoPrevio.volumen),
            precipitacion: extraerSeguro('PRECIPITACION (l/m²)', estadoPrevio.precipitacion),
            temperatura: extraerSeguro('TEMPERATURA (ºC)', estadoPrevio.temperatura),
            caudalEntrada: extraerCaudal('APORTACION AL EMBALSE (m³/s)', respaldoEntrada),
            caudalSalida: extraerCaudal([
                'CAUDAL DESEMBALSADO (m³/s)',
                'CAUDAL DESEMBALSADO AL RIO (m³/s)'
            ], respaldoSalida),
            embalseId
        };

        if (registroExistente) {
            return await prisma.medicionHistorica.update({
                where: { id: registroExistente.id },
                data: dataObj
            });
        } else {
            dataObj.timestamp = fechaParseada;
            return await prisma.medicionHistorica.create({
                data: dataObj
            });
        }
    }

}

module.exports = MedionRepository;