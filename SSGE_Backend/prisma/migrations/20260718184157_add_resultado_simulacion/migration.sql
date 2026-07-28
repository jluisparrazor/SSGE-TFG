-- CreateTable
CREATE TABLE "ResultadoSimulacion" (
    "id" SERIAL NOT NULL,
    "fechaEjecucion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    "embalseId" INTEGER NOT NULL,
    "parametrosInput" JSONB NOT NULL,
    "proyeccion" JSONB NOT NULL,
    "alertaMaxima" TEXT NOT NULL,
    "duracionMin" INTEGER NOT NULL,

    CONSTRAINT "ResultadoSimulacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultadoSimulacion_embalseId_idx" ON "ResultadoSimulacion"("embalseId");

-- CreateIndex
CREATE INDEX "ResultadoSimulacion_fechaEjecucion_idx" ON "ResultadoSimulacion"("fechaEjecucion");

-- AddForeignKey
ALTER TABLE "ResultadoSimulacion" ADD CONSTRAINT "ResultadoSimulacion_embalseId_fkey" FOREIGN KEY ("embalseId") REFERENCES "Embalse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
