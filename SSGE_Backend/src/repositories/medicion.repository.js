const { prisma } = require('../lib/prisma');

class MedicionRepository {
    static async obtenerPrimerEmbalseId() {
        const embalse = await prisma.embalse.findFirst({ orderBy: { id: 'asc' } });
        return embalse ? embalse.id : null;
    }

    static async verificarEmbalseExiste(id) {
        const embalse = await prisma.embalse.findUnique({ where: { id } });
        return !!embalse;
    }

    static async obtenerPorRango(embalseId, fechaLimite, limite = 500) {
        return prisma.medicionHistorica.findMany({
            where: {
                embalseId: embalseId,
                timestamp: { gte: fechaLimite }
            },
            orderBy: { timestamp: 'desc' },
            take: limite
        });
    }

    static async obtenerUltimosDatos(embalseId) {
        // Ejecutamos las tres consultas en paralelo para ganar velocidad
        const [estadoPrevio, ultimoEntrada, ultimoSalida] = await Promise.all([
            prisma.medicionHistorica.findFirst({ where: { embalseId }, orderBy: { timestamp: 'desc' } }),
            prisma.medicionHistorica.findFirst({ where: { embalseId, caudalEntrada: { gt: 0 } }, orderBy: { timestamp: 'desc' } }),
            prisma.medicionHistorica.findFirst({ where: { embalseId, caudalSalida: { gt: 0 } }, orderBy: { timestamp: 'desc' } })
        ]);

        return {
            estadoPrevio: estadoPrevio || { nivel: 0, volumen: 0, precipitacion: 0, temperatura: 0 },
            respaldoEntrada: ultimoEntrada ? ultimoEntrada.caudalEntrada : 0,
            respaldoSalida: ultimoSalida ? ultimoSalida.caudalSalida : 0
        };
    }

    static async upsert(embalseId, timestamp, dataObj) {
        return prisma.medicionHistorica.upsert({
            where: {
            embalseId_timestamp: { embalseId, timestamp }
            },
            update: dataObj,
            create: { ...dataObj, embalseId, timestamp }
        });
    }
    
}

module.exports = MedicionRepository;