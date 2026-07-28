const { prisma } = require('../lib/prisma');

class EmbalseRepository {
    static parseNumero(valor, fallback = null){
        if ( valor === null || valor === undefined || valor === '' ) return fallback;
        const numero = parseFloat(String(valor).replace(',', '.').trim());
        return Number.isFinite(numero) ? numero : fallback;
    }

    static normalizarNombreSensor(tipo) {
        return `Sensor de ${tipo}`;
    }

    static async guardar(payload) {
        const nombre = String(payload?.nombre || '').trim();
        const capacidadHm3 = this.parseNumero(payload?.capacidadHm3);
        const cotaMaximaM = this.parseNumero(payload?.cotaMaximaM);
        const cotaMinimaM = this.parseNumero(payload?.cotaMinimaM);
        
        if (!nombre) {
            throw new Error('El nombre del embalse es obligatorio');
        }

        if (!Number.isFinite(capacidadHm3) || capacidadHm3 <= 0) {
            throw new Error('La capacidad del embalse debe ser un número mayor a 0');
        }

        if (!Number.isFinite(cotaMaximaM) || !Number.isFinite(cotaMinimaM)) {
            throw new Error('Las cotas máxima y mínima son obligatorias');
        }

        if (cotaMinimaM >= cotaMaximaM) {
            throw new Error('La cota mínima debe ser menor que la cota máxima');
        }

        const saihEstacionCodigo = payload?.saihEstacionCodigo ? String(payload.saihEstacionCodigo).trim() : null;
        const saihIdPunto = payload?.saihIdPunto ? String(payload.saihIdPunto).trim() : null;

        const demandaUrbanaMensual = this.parseNumero(payload?.demandaUrbanaMensual);
        const demandaAgrariaMensual = payload?.demandaAgrariaMensual ? payload.demandaAgrariaMensual : null;
        const caudalEcologicoMensual = payload?.caudalEcologicoMensual ? payload.caudalEcologicoMensual : null;
        const evaporacionMensual = payload?.evaporacionMensual ? payload.evaporacionMensual : null;
        const curvaSuperficie = payload?.curvaSuperficie ? payload.curvaSuperficie : null;
        const umbralesSequiaAgraria = payload?.umbralesSequiaAgraria ? payload.umbralesSequiaAgraria : null;

        const sensores = Array.isArray(payload?.sensores) ? payload.sensores : [];
        const compuertas = Array.isArray(payload?.compuertas) ? payload.compuertas : [];
        const senalesAsignadas = Array.isArray(payload?.senalesAsignadas) ? payload.senalesAsignadas : [];

        //
        const nuevoEmbalse = await prisma.$transaction(async (tx) => {
            const embalse = await tx.embalse.create({
                data: {
                    nombre,
                    capacidadHm3,
                    cotaMaximaM,
                    cotaMinimaM,
                    saihEstacionCodigo,
                    saihIdPunto,
                    demandaUrbanaMensual,
                    demandaAgrariaMensual,
                    caudalEcologicoMensual,
                    evaporacionMensual,
                    curvaSuperficie,
                    umbralesSequiaAgraria
                }
            });

            if (sensores.length > 0) {
                await tx.sensor.createMany({
                    data: sensores.map((sensor) =>{
                        const tipo = String(sensor?.tipo || '').trim();
                        const valorActual = this.parseNumero(sensor?.valorActual, 0);

                        if (!tipo) {
                            throw new Error('El tipo de sensor es obligatorio');
                        }

                        return {
                            tipo,
                            valorActual,
                            embalseId: embalse.id
                        };
                    })
                });
            }

            if (compuertas.length > 0) {
                await tx.compuerta.createMany({
                    data: compuertas.map((compuerta, indice) => {
                        const nombreCompuerta = String(compuerta?.nombre || '').trim() || `Compuerta ${indice + 1}`;
                        const cotaTomaM = this.parseNumero(compuerta?.cotaTomaM, null);
                        const estadoAperturaPorcentaje = this.parseNumero(compuerta?.estadoAperturaPorcentaje, 0);
                        const caudalSalidaActual = this.parseNumero(compuerta?.caudalSalidaActual, 0);

                        return {
                            nombre: nombreCompuerta,
                            cotaTomaM,
                            estadoAperturaPorcentaje,
                            caudalSalidaActual,
                            embalseId: embalse.id
                        };
                    })
                });
            }

            if (senalesAsignadas.length > 0) {
                for (const senal of senalesAsignadas) {
                    const codigo = String(senal?.codigo || senal?.id_sensor || '').trim();
                    const nombreSenal = String(senal?.nombre || senal?.nombre_sensor || '').trim() || codigo;

                    if (!codigo) continue;

                    const senalExistente = await tx.senal.upsert({
                        where: { codigo },
                        update: { nombre: nombreSenal },
                        create: { codigo, nombre: nombreSenal }
                    });

                    await tx.embalseSenal.upsert({
                        where: {
                            embalseId_senalId: {
                                embalseId: embalse.id,
                                senalId: senalExistente.id
                            }
                        },
                        update: {
                            activa: true,
                            fechaBaja: null
                        },
                        create: {
                            embalseId: embalse.id,
                            senalId: senalExistente.id,
                            alias: nombreSenal
                        }
                    });
                }
            }

            return tx.embalse.findUnique({
                where: { id: embalse.id },
                include: {
                    sensores: true,
                    compuertas: true,
                    senalesAsignadas: {
                        include: {
                            senal: true
                        }
                    }
                }
            });
        });

        return nuevoEmbalse;
    }

    static async actualizar(embalseId, payload) {
        const existente = await prisma.embalse.findUnique({
            where: { id: embalseId }
        });

        if (!existente) {
            throw new Error('El embalse no existe');
        }

        const nombre = String(payload?.nombre || '').trim();
        const capacidadHm3 = this.parseNumero(payload?.capacidadHm3);
        const cotaMaximaM = this.parseNumero(payload?.cotaMaximaM);
        const cotaMinimaM = this.parseNumero(payload?.cotaMinimaM);

        if (!nombre) {
            throw new Error('El nombre del embalse es obligatorio');
        }

        if (!Number.isFinite(capacidadHm3) || capacidadHm3 <= 0) {
            throw new Error('La capacidad del embalse debe ser un número mayor a 0');
        }

        if (!Number.isFinite(cotaMaximaM) || !Number.isFinite(cotaMinimaM)) {
            throw new Error('Las cotas máxima y mínima son obligatorias');
        }

        if (cotaMinimaM >= cotaMaximaM) {
            throw new Error('La cota mínima debe ser menor que la cota máxima');
        }

        const saihEstacionCodigo = payload?.saihEstacionCodigo ? String(payload.saihEstacionCodigo).trim() : null;
        const saihIdPunto = payload?.saihIdPunto ? String(payload.saihIdPunto).trim() : null;

        const demandaUrbanaMensual = this.parseNumero(payload?.demandaUrbanaMensual);
        const demandaAgrariaMensual = payload?.demandaAgrariaMensual ? payload.demandaAgrariaMensual : null;
        const caudalEcologicoMensual = payload?.caudalEcologicoMensual ? payload.caudalEcologicoMensual : null;
        const evaporacionMensual = payload?.evaporacionMensual ? payload.evaporacionMensual : null;
        const curvaSuperficie = payload?.curvaSuperficie ? payload.curvaSuperficie : null;
        const umbralesSequiaAgraria = payload?.umbralesSequiaAgraria ? payload.umbralesSequiaAgraria : null;

        const sensores = Array.isArray(payload?.sensores) ? payload.sensores : [];
        const compuertas = Array.isArray(payload?.compuertas) ? payload.compuertas : [];
        const senalesAsignadas = Array.isArray(payload?.senalesAsignadas) ? payload.senalesAsignadas : [];

        return prisma.$transaction(async (tx) => {
            await tx.embalse.update({
            where: { id: embalseId },
            data: {
                nombre,
                capacidadHm3,
                cotaMaximaM,
                cotaMinimaM,
                saihEstacionCodigo,
                saihIdPunto,
                demandaUrbanaMensual,
                demandaAgrariaMensual,
                caudalEcologicoMensual,
                evaporacionMensual,
                curvaSuperficie,
                umbralesSequiaAgraria
            },
            });

            await tx.sensor.deleteMany({ where: { embalseId } });
            if (sensores.length > 0) {
            await tx.sensor.createMany({
                data: sensores.map((sensor) => {
                const tipo = String(sensor?.tipo || '').trim();
                const valorActual = this.parseNumero(sensor?.valorActual, 0);

                if (!tipo) {
                    throw new Error('El tipo de sensor es obligatorio');
                }

                return {
                    tipo,
                    valorActual,
                    embalseId,
                };
                }),
            });
            }

            await tx.compuerta.deleteMany({ where: { embalseId } });
            if (compuertas.length > 0) {
            await tx.compuerta.createMany({
                data: compuertas.map((compuerta, indice) => {
                const nombreCompuerta = String(compuerta?.nombre || '').trim() || 'Compuerta ' + (indice + 1);
                const cotaTomaM = this.parseNumero(compuerta?.cotaTomaM, null);
                const estadoAperturaPorcentaje = this.parseNumero(compuerta?.estadoAperturaPorcentaje, 0);
                const caudalSalidaActual = this.parseNumero(compuerta?.caudalSalidaActual, 0);

                if (estadoAperturaPorcentaje < 0 || estadoAperturaPorcentaje > 100) {
                    throw new Error('La apertura debe estar entre 0 y 100');
                }

                if (caudalSalidaActual < 0) {
                    throw new Error('El caudal de salida no puede ser negativo');
                }

                if (cotaTomaM !== null && (cotaTomaM < cotaMinimaM || cotaTomaM > cotaMaximaM)) {
                    throw new Error('La cota de toma de compuerta debe estar dentro del rango del embalse');
                }

                return {
                    nombre: nombreCompuerta,
                    cotaTomaM,
                    estadoAperturaPorcentaje,
                    caudalSalidaActual,
                    embalseId,
                };
                }),
            });
            }

            await tx.embalseSenal.updateMany({
            where: { embalseId },
            data: { activa: false, fechaBaja: new Date() },
            });

            for (const senal of senalesAsignadas) {
            const codigo = String(senal?.codigo || senal?.id_sensor || '').trim();
            const nombreSenal = String(senal?.nombre || senal?.nombre_sensor || '').trim() || codigo;
            if (!codigo) continue;

            const senalExistente = await tx.senal.upsert({
                where: { codigo },
                update: { nombre: nombreSenal },
                create: { codigo, nombre: nombreSenal },
            });

            await tx.embalseSenal.upsert({
                where: {
                embalseId_senalId: {
                    embalseId,
                    senalId: senalExistente.id,
                },
                },
                update: {
                activa: true,
                fechaBaja: null,
                alias: nombreSenal,
                },
                create: {
                embalseId,
                senalId: senalExistente.id,
                alias: nombreSenal,
                activa: true,
                },
            });
            }

            return tx.embalse.findUnique({
            where: { id: embalseId },
            include: {
                sensores: true,
                compuertas: true,
                senalesAsignadas: {
                include: { senal: true },
                },
            },
            });
        });
    }

    static async obtenerTodos() {
        return prisma.embalse.findMany({
            where: { eliminado: false },
            include: {
                sensores: true,
                compuertas: true,
                senalesAsignadas: {
                    include: { senal: true }
                }
            }
        });
    }

    static async obtenerPorId(id) {
        const embalse = await prisma.embalse.findUnique({
            where: { id: parseInt(id) },
            include: {
                sensores: true,
                compuertas: true,
                senalesAsignadas: {
                    include: { senal: true }
                }
            }
        });

        if (!embalse || embalse.eliminado) {
            return null;
        }

        return embalse;
    }

    static async cambiarEstado(embalseId, activo) {
        const embalse = await prisma.embalse.findUnique({
            where: { id: parseInt(embalseId) }
        });

        if (!embalse || embalse.eliminado) {
            throw new Error('Embalse no encontrado o eliminado');
        }

        return prisma.embalse.update({
            where: { id: parseInt(embalseId) },
            data: { activo: Boolean(activo) }
        });
    }

    static async eliminarLogico(embalseId) {
        const embalse = await prisma.embalse.findUnique({
            where: { id: parseInt(embalseId) }
        });

        if (!embalse) {
            throw new Error('Embalse no encontrado');
        }

        if (embalse.eliminado) {
            throw new Error('El embalse ya ha sido eliminado');
        }

        return prisma.embalse.update({
            where: { id: parseInt(embalseId) },
            data: { eliminado: true }
        });
    }
}

module.exports = EmbalseRepository;