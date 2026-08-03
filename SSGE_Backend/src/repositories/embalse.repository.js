const { prisma } = require('../lib/prisma');

const INCLUDE_EMBALSE = {
    sensores: true,
    compuertas: true,
    senalesAsignadas: { include: { senal: true } }
};

class EmbalseRepository {
    static async guardar(payload) {
        const embalseId = await prisma.$transaction(async (tx) => {
            const embalse = await tx.embalse.create({
                data: {
                    nombre: payload.nombre,
                    capacidadHm3: payload.capacidadHm3,
                    cotaMaximaM: payload.cotaMaximaM,
                    cotaMinimaM: payload.cotaMinimaM,
                    saihEstacionCodigo: payload.saihEstacionCodigo,
                    saihIdPunto: payload.saihIdPunto,
                    demandaUrbanaMensual: payload.demandaUrbanaMensual,
                    demandaAgrariaMensual: payload.demandaAgrariaMensual,
                    caudalEcologicoMensual: payload.caudalEcologicoMensual,
                    evaporacionMensual: payload.evaporacionMensual,
                    curvaSuperficie: payload.curvaSuperficie,
                    umbralesSequiaAgraria: payload.umbralesSequiaAgraria
                }
            });

            if (Array.isArray(payload.sensores) && payload.sensores.length > 0) {
                await tx.sensor.createMany({
                    data: payload.sensores.map((sensor) => ({ ...sensor, embalseId: embalse.id }))
                });
            }

            if (Array.isArray(payload.compuertas) && payload.compuertas.length > 0) {
                await tx.compuerta.createMany({
                    data: payload.compuertas.map((compuerta) => ({ ...compuerta, embalseId: embalse.id }))
                });
            }

            if (Array.isArray(payload.senalesAsignadas) && payload.senalesAsignadas.length > 0) {
                for (const senal of payload.senalesAsignadas) {
                    const codigo = String(senal?.codigo || senal?.id_sensor || '').trim();
                    const nombreSenal = String(senal?.nombre || senal?.nombre_sensor || '').trim() || codigo;
                    if (!codigo) continue;

                    const senalExistente = await tx.senal.upsert({
                        where: { codigo },
                        update: { nombre: nombreSenal },
                        create: { codigo, nombre: nombreSenal }
                    });

                    await tx.embalseSenal.create({
                        data: {
                            embalseId: embalse.id,
                            senalId: senalExistente.id,
                            alias: nombreSenal,
                            activa: true
                        }
                    });
                }
            }

            return embalse.id;
        });

        return prisma.embalse.findUnique({
            where: { id: embalseId },
            include: INCLUDE_EMBALSE
        });
    }

    static async actualizar(embalseId, payload) {
        const existente = await prisma.embalse.findUnique({ where: { id: embalseId } });
        if (!existente) throw new Error('El embalse no existe');

        await prisma.$transaction(async (tx) => {
            await tx.embalse.update({
                where: { id: embalseId },
                data: {
                    nombre: payload.nombre,
                    capacidadHm3: payload.capacidadHm3,
                    cotaMaximaM: payload.cotaMaximaM,
                    cotaMinimaM: payload.cotaMinimaM,
                    saihEstacionCodigo: payload.saihEstacionCodigo,
                    saihIdPunto: payload.saihIdPunto,
                    demandaUrbanaMensual: payload.demandaUrbanaMensual,
                    demandaAgrariaMensual: payload.demandaAgrariaMensual,
                    caudalEcologicoMensual: payload.caudalEcologicoMensual,
                    evaporacionMensual: payload.evaporacionMensual,
                    curvaSuperficie: payload.curvaSuperficie,
                    umbralesSequiaAgraria: payload.umbralesSequiaAgraria
                }
            });

            await tx.sensor.deleteMany({ where: { embalseId } });
            if (Array.isArray(payload.sensores) && payload.sensores.length > 0) {
                await tx.sensor.createMany({
                    data: payload.sensores.map((sensor) => ({ ...sensor, embalseId }))
                });
            }

            await tx.compuerta.deleteMany({ where: { embalseId } });
            if (Array.isArray(payload.compuertas) && payload.compuertas.length > 0) {
                await tx.compuerta.createMany({
                    data: payload.compuertas.map((compuerta) => ({ ...compuerta, embalseId }))
                });
            }

            await tx.embalseSenal.updateMany({
                where: { embalseId },
                data: { activa: false, fechaBaja: new Date() }
            });

            if (Array.isArray(payload.senalesAsignadas) && payload.senalesAsignadas.length > 0) {
                for (const senal of payload.senalesAsignadas) {
                    const codigo = String(senal?.codigo || senal?.id_sensor || '').trim();
                    const nombreSenal = String(senal?.nombre || senal?.nombre_sensor || '').trim() || codigo;
                    if (!codigo) continue;

                    const senalExistente = await tx.senal.upsert({
                        where: { codigo },
                        update: { nombre: nombreSenal },
                        create: { codigo, nombre: nombreSenal }
                    });

                    await tx.embalseSenal.upsert({
                        where: { embalseId_senalId: { embalseId, senalId: senalExistente.id } },
                        update: { activa: true, fechaBaja: null, alias: nombreSenal },
                        create: { embalseId, senalId: senalExistente.id, alias: nombreSenal, activa: true }
                    });
                }
            }
        });

        return prisma.embalse.findUnique({
            where: { id: embalseId },
            include: INCLUDE_EMBALSE
        });
    }

    static async obtenerTodos() {
        return prisma.embalse.findMany({
            where: { eliminado: false },
            include: INCLUDE_EMBALSE
        });
    }

    static async obtenerPorId(id) {
        const embalse = await prisma.embalse.findUnique({
            where: { id },
            include: INCLUDE_EMBALSE
        });
        return (!embalse || embalse.eliminado) ? null : embalse;
    }

    static async cambiarEstado(embalseId, activo) {
        const embalse = await prisma.embalse.findUnique({ where: { id: embalseId } });
        if (!embalse || embalse.eliminado) throw new Error('Embalse no encontrado o eliminado');
        return prisma.embalse.update({ where: { id: embalseId }, data: { activo } });
    }

    static async eliminarLogico(embalseId) {
        const embalse = await prisma.embalse.findUnique({ where: { id: embalseId } });
        if (!embalse) throw new Error('Embalse no encontrado');
        if (embalse.eliminado) throw new Error('El embalse ya ha sido eliminado');
        return prisma.embalse.update({ where: { id: embalseId }, data: { eliminado: true } });
    }
}

module.exports = EmbalseRepository;