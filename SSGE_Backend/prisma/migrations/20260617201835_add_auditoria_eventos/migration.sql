-- CreateTable
CREATE TABLE "AuditoriaEvento" (
    "id" SERIAL NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metodo" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "estadoHttp" INTEGER NOT NULL,
    "actorId" INTEGER,
    "actorUsername" TEXT,
    "actorRol" "RolUsuario",
    "ip" TEXT,
    "userAgent" TEXT,
    "detalle" TEXT,

    CONSTRAINT "AuditoriaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditoriaEvento_fechaHora_idx" ON "AuditoriaEvento"("fechaHora");

-- CreateIndex
CREATE INDEX "AuditoriaEvento_actorId_idx" ON "AuditoriaEvento"("actorId");

-- CreateIndex
CREATE INDEX "AuditoriaEvento_metodo_endpoint_idx" ON "AuditoriaEvento"("metodo", "endpoint");
