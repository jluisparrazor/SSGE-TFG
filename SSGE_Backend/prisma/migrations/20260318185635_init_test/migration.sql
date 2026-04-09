-- CreateTable
CREATE TABLE "Embalse" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "capacidadHm3" DOUBLE PRECISION NOT NULL,
    "cotaMaximaM" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Embalse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sensor" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "valorActual" DOUBLE PRECISION NOT NULL,
    "embalseId" INTEGER NOT NULL,

    CONSTRAINT "Sensor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compuerta" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "estadoAperturaPorcentaje" DOUBLE PRECISION NOT NULL,
    "caudalSalidaActual" DOUBLE PRECISION NOT NULL,
    "embalseId" INTEGER NOT NULL,

    CONSTRAINT "Compuerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialSimulacion" (
    "id" SERIAL NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventoDisparador" TEXT NOT NULL,
    "accionAutomatica" TEXT NOT NULL,
    "embalseId" INTEGER NOT NULL,

    CONSTRAINT "HistorialSimulacion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Sensor" ADD CONSTRAINT "Sensor_embalseId_fkey" FOREIGN KEY ("embalseId") REFERENCES "Embalse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compuerta" ADD CONSTRAINT "Compuerta_embalseId_fkey" FOREIGN KEY ("embalseId") REFERENCES "Embalse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialSimulacion" ADD CONSTRAINT "HistorialSimulacion_embalseId_fkey" FOREIGN KEY ("embalseId") REFERENCES "Embalse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
