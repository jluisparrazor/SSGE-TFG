const express = require('express');
const router = express.Router();
const medicionController = require('../controllers/medicion.controller');

// Ruta pública de lectura de mediciones
router.get('/', medicionController.obtenerPorRango);
router.post('/', medicionController.guardar);

module.exports = router;