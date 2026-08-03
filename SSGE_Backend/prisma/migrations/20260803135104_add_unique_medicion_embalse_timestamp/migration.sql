/*
  Warnings:

  - A unique constraint covering the columns `[embalseId,timestamp]` on the table `MedicionHistorica` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "MedicionHistorica_embalseId_timestamp_key" ON "MedicionHistorica"("embalseId", "timestamp");
