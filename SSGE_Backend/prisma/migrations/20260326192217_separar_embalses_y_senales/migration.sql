-- AlterTable
ALTER TABLE "Embalse" ADD COLUMN     "cotaMinimaM" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MedicionHistorica" ADD COLUMN     "embalseSenalId" INTEGER;

-- CreateTable
CREATE TABLE "Senal" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT,
    "descripcion" TEXT,
    "tipoDato" TEXT NOT NULL DEFAULT 'float',
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Senal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbalseSenal" (
    "id" SERIAL NOT NULL,
    "embalseId" INTEGER NOT NULL,
    "senalId" INTEGER NOT NULL,
    "alias" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "fechaAlta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaBaja" TIMESTAMP(3),

    CONSTRAINT "EmbalseSenal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Senal_codigo_key" ON "Senal"("codigo");

-- CreateIndex
CREATE INDEX "EmbalseSenal_embalseId_idx" ON "EmbalseSenal"("embalseId");

-- CreateIndex
CREATE INDEX "EmbalseSenal_senalId_idx" ON "EmbalseSenal"("senalId");

-- CreateIndex
CREATE INDEX "EmbalseSenal_activa_idx" ON "EmbalseSenal"("activa");

-- CreateIndex
CREATE UNIQUE INDEX "EmbalseSenal_embalseId_senalId_key" ON "EmbalseSenal"("embalseId", "senalId");

-- CreateIndex
CREATE INDEX "MedicionHistorica_embalseSenalId_idx" ON "MedicionHistorica"("embalseSenalId");

-- AddForeignKey
ALTER TABLE "EmbalseSenal" ADD CONSTRAINT "EmbalseSenal_embalseId_fkey" FOREIGN KEY ("embalseId") REFERENCES "Embalse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbalseSenal" ADD CONSTRAINT "EmbalseSenal_senalId_fkey" FOREIGN KEY ("senalId") REFERENCES "Senal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicionHistorica" ADD CONSTRAINT "MedicionHistorica_embalseSenalId_fkey" FOREIGN KEY ("embalseSenalId") REFERENCES "EmbalseSenal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
