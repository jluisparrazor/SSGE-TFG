const express = require('express');
const router = express.Router();
const AuditoriaController = require('../controllers/auditoria.controller');

// Obtener todo el historial de auditoría
router.get('/', AuditoriaController.obtenerHistorialGlobal);

// Obtener el historial específico de un usuario (para tu modal)
router.get('/usuario/:id', AuditoriaController.obtenerHistorialUsuario);

module.exports = router;
