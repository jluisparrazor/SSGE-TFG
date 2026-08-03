const { prisma } = require('../lib/prisma');

const obtenerHistorialGlobal = async (req, res) => {
    try {
        // 1. Extraemos el nuevo campo 'usuario'
        const { limite = 200, fechaInicio, fechaFin, nivel, usuario } = req.query; 
        const where = {};

        if (fechaInicio || fechaFin) {
            where.fechaHora = {};
            if (fechaInicio) where.fechaHora.gte = new Date(fechaInicio);
            if (fechaFin) {
                const fin = new Date(fechaFin);
                fin.setHours(23, 59, 59, 999);
                where.fechaHora.lte = fin;
            }
        }

        if (nivel) {
            if (nivel === 'ERROR') where.estadoHttp = { gte: 400 };
            else if (nivel === 'INFO') where.estadoHttp = { lt: 400 };
        }

        // 2. Filtro de usuario (búsqueda parcial insensible a mayúsculas/minúsculas)
        if (usuario) {
            where.actorUsername = {
                contains: usuario,
                mode: 'insensitive' // Esto hace que 'Admin' y 'admin' sean iguales
            };
        }

        const registros = await prisma.auditoriaEvento.findMany({
            where,
            orderBy: { fechaHora: 'desc' },
            take: Number(limite)
        });

        res.json(registros);
    } catch (error) {
        console.error(' Error al obtener auditoría global:', error);
        res.status(500).json({ error: 'Error al consultar el historial de auditoría' });
    }
};

const obtenerHistorialUsuario = async (req, res) => {
    try {
        const actorId = Number(req.params.id);

        const registros = await prisma.auditoriaEvento.findMany({
            where: { actorId: actorId },
            orderBy: { fechaHora: 'desc' },
            take: 50 // Limitamos a las últimas 50 acciones del usuario para el modal
        });

        res.json(registros);
    } catch (error) {
        console.error(`Error al obtener auditoría del usuario ${req.params.id}:`, error);
        res.status(500).json({ error: 'Error al consultar la auditoría del usuario' });
    }
};

module.exports = { obtenerHistorialGlobal, obtenerHistorialUsuario };