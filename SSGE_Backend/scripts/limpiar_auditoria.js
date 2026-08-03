require('dotenv').config();
const { prisma, pool } = require('../src/lib/prisma');

function restarDias(fecha, dias) {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() - dias);
  return copia;
}

async function limpiarAuditoria() {
  const ahora = new Date();
  const corteInfo = restarDias(ahora, 90);
  const corteError = restarDias(ahora, 365);

  const [borradoInfo, borradoError] = await Promise.all([
    prisma.auditoriaEvento.deleteMany({
      where: {
        estadoHttp: { lt: 400 },
        fechaHora: { lt: corteInfo }
      }
    }),
    prisma.auditoriaEvento.deleteMany({
      where: {
        estadoHttp: { gte: 400 },
        fechaHora: { lt: corteError }
      }
    })
  ]);

  console.log('[auditoria] info eliminados:', borradoInfo.count);
  console.log('[auditoria] error eliminados:', borradoError.count);
  console.log('[auditoria] fecha corte info:', corteInfo.toISOString());
  console.log('[auditoria] fecha corte error:', corteError.toISOString());
}

limpiarAuditoria()
  .catch((error) => {
    console.error('[auditoria] error limpieza:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (pool) await pool.end();
  });