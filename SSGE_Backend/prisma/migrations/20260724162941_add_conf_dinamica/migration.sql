-- AlterTable
ALTER TABLE "Embalse" ADD COLUMN     "caudalEcologicoMensual" JSONB,
ADD COLUMN     "curvaSuperficie" JSONB,
ADD COLUMN     "demandaAgrariaMensual" JSONB,
ADD COLUMN     "demandaUrbanaMensual" DOUBLE PRECISION,
ADD COLUMN     "evaporacionMensual" JSONB,
ADD COLUMN     "umbralesSequiaAgraria" JSONB;
