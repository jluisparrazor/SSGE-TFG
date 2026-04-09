-- CreateTable
CREATE TABLE "MedicionHistorica" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "nivel" DOUBLE PRECISION NOT NULL,
    "volumen" DOUBLE PRECISION NOT NULL,
    "precipitacion" DOUBLE PRECISION NOT NULL,
    "embalseId" INTEGER NOT NULL,

    CONSTRAINT "MedicionHistorica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedicionHistorica_timestamp_idx" ON "MedicionHistorica"("timestamp");

-- AddForeignKey
ALTER TABLE "MedicionHistorica" ADD CONSTRAINT "MedicionHistorica_embalseId_fkey" FOREIGN KEY ("embalseId") REFERENCES "Embalse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
