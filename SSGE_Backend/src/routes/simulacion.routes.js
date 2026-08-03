const express = require('express');
const router = express.Router();
const simulacionController = require('../controllers/simulacion.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

const authAdminOperador = [requireAuth, requireRole('ADMIN', 'OPERADOR')];

router.get('/simulacion/reglas-difusas', authAdminOperador, simulacionController.obtenerReglasDifusas);
router.put('/simulacion/reglas-difusas', authAdminOperador, simulacionController.actualizarReglasDifusas);

router.post('/simulacion/ejecutar', authAdminOperador, simulacionController.ejecutarSimulacion);

router.get('/simulaciones', simulacionController.obtenerSimulaciones);
router.get('/simulaciones/:id', simulacionController.obtenerSimulacionPorId);
router.get('/simulaciones/:id/exportar',  simulacionController.exportarSimulacion);

router.delete('/simulaciones/:id', authAdminOperador, simulacionController.eliminarSimulacion);

router.get('/historial-simulacion', simulacionController.obtenerHistorial);

module.exports = router;