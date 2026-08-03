require('dotenv').config();
const { prisma, pool } = require('../src/lib/prisma');

async function limpiarMedicionesHistoricas() {
  const ahora = new Date();

  // 1) Borrado duro de datos muy antiguos (> 365 días)
  const borradoAntiguo = await prisma.medicionHistorica.deleteMany({
    where: {
      timestamp: {
        lt: new Date(ahora.getTime() - 365 * 24 * 60 * 60 * 1000),
      },
    },
  });

  // 2) Compactación de tramo intermedio (90-365 días): 1 punto por hora y embalse
  const compactacion = await prisma.$executeRawUnsafe(`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY "embalseId", date_trunc('hour', "timestamp")
          ORDER BY "timestamp" DESC, id DESC
        ) AS rn
      FROM "MedicionHistorica"
      WHERE "timestamp" >= (now() - interval '365 days')
        AND "timestamp" <  (now() - interval '90 days')
    )
    DELETE FROM "MedicionHistorica" m
    USING ranked r
    WHERE m.id = r.id
      AND r.rn > 1;
  `);

  console.log('[mediciones] eliminados >365 días:', borradoAntiguo.count);
  console.log('[mediciones] eliminados por compactación 90-365 días:', Number(compactacion));
}

limpiarMedicionesHistoricas()
  .catch((error) => {
    console.error('[mediciones] error limpieza:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (pool) await pool.end();
  });