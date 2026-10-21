-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMINISTRADOR', 'REVISOR', 'DIGITADOR');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('ACTIVO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "EstadoDispositivo" AS ENUM ('PENDIENTE', 'APROBADO', 'REVOCADO');

-- CreateEnum
CREATE TYPE "EstadoAprobacion" AS ENUM ('PENDIENTE_APROBACION', 'APROBADA', 'RETIRADA');

-- CreateEnum
CREATE TYPE "EstadoExpediente" AS ENUM ('BORRADOR', 'EN_REVISION', 'DEVUELTO', 'APROBADA', 'FIRMADA', 'ARCHIVADA');

-- CreateEnum
CREATE TYPE "Confianza" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- CreateEnum
CREATE TYPE "NivelObservacion" AS ENUM ('CRITICA', 'ADVERTENCIA', 'INFORMATIVA');

-- CreateEnum
CREATE TYPE "EstadoObservacion" AS ENUM ('ABIERTA', 'CORREGIDA', 'JUSTIFICADA', 'DESCARTADA');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "nombreCompleto" TEXT NOT NULL,
    "correo" TEXT,
    "hashContrasena" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'ACTIVO',
    "totpSecretoCifrado" TEXT,
    "totpActivo" BOOLEAN NOT NULL DEFAULT false,
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMP(3),
    "debeCambiarContrasena" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcceso" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispositivos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "huella" TEXT,
    "estado" "EstadoDispositivo" NOT NULL DEFAULT 'PENDIENTE',
    "ipRegistro" TEXT,
    "agenteUsuario" TEXT,
    "aprobadoPorId" TEXT,
    "aprobadoEn" TIMESTAMP(3),
    "ultimoAcceso" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispositivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "dispositivoId" TEXT,
    "ip" TEXT,
    "agenteUsuario" TEXT,
    "remota" BOOLEAN NOT NULL DEFAULT false,
    "segundoFactorOk" BOOLEAN NOT NULL DEFAULT false,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaActividad" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "revocadaEn" TIMESTAMP(3),
    "motivoRevocacion" TEXT,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_escritura" (
    "id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "prioridad" TEXT NOT NULL,
    "esBloque" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "descripcion" TEXT,
    "normas" TEXT,

    CONSTRAINT "tipos_escritura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantillas" (
    "id" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "estado" "EstadoAprobacion" NOT NULL DEFAULT 'PENDIENTE_APROBACION',
    "nombreArchivo" TEXT NOT NULL,
    "archivo" BYTEA NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "notas" TEXT,
    "cargadaPorId" TEXT,
    "aprobadaPorId" TEXT,
    "aprobadaEn" TIMESTAMP(3),
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plantillas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "esquemas_formulario" (
    "id" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "estado" "EstadoAprobacion" NOT NULL DEFAULT 'PENDIENTE_APROBACION',
    "esquema" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "esquemas_formulario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instrucciones_ia" (
    "id" TEXT NOT NULL,
    "tipoId" TEXT,
    "proposito" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "estado" "EstadoAprobacion" NOT NULL DEFAULT 'PENDIENTE_APROBACION',
    "contenido" TEXT NOT NULL,
    "motivo" TEXT,
    "creadoPorId" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instrucciones_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expedientes" (
    "id" TEXT NOT NULL,
    "numeroInterno" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "actos" JSONB NOT NULL,
    "estado" "EstadoExpediente" NOT NULL DEFAULT 'BORRADOR',
    "datos" JSONB NOT NULL DEFAULT '{}',
    "responsableId" TEXT NOT NULL,
    "revisorId" TEXT,
    "comentarioRevision" TEXT,
    "numeroEscritura" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "enviadoRevisionEn" TIMESTAMP(3),
    "aprobadoEn" TIMESTAMP(3),

    CONSTRAINT "expedientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparecientes" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "tipoPersona" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "datos" JSONB NOT NULL,

    CONSTRAINT "comparecientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inmuebles" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "matricula" TEXT,
    "cedulaCatastral" TEXT,
    "direccion" TEXT,
    "datos" JSONB NOT NULL,

    CONSTRAINT "inmuebles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "tipoDocumental" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "rutaCifrada" TEXT NOT NULL,
    "subidoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analisis_ia" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "proposito" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "versionInstruccion" TEXT,
    "estado" TEXT NOT NULL,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSalida" INTEGER NOT NULL DEFAULT 0,
    "tokensCacheLectura" INTEGER NOT NULL DEFAULT 0,
    "duracionMs" INTEGER,
    "error" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analisis_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datos_extraidos" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "analisisId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "documentoId" TEXT,
    "pagina" INTEGER,
    "fragmento" TEXT,
    "confianza" "Confianza" NOT NULL,
    "revisionManual" BOOLEAN NOT NULL DEFAULT false,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "valorFinal" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "datos_extraidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observaciones" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nivel" "NivelObservacion" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "campo" TEXT,
    "evidencia" JSONB,
    "estado" "EstadoObservacion" NOT NULL DEFAULT 'ABIERTA',
    "justificacion" TEXT,
    "falsaAlarma" BOOLEAN,
    "resueltaPorId" TEXT,
    "resueltaEn" TIMESTAMP(3),
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borradores" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "plantillasUsadas" JSONB NOT NULL,
    "rutaDocxCifrada" TEXT NOT NULL,
    "rutaPdfCifrada" TEXT,
    "hashSha256" TEXT NOT NULL,
    "generadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "borradores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correcciones" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "campo" TEXT,
    "valorIA" TEXT,
    "valorCorregido" TEXT,
    "motivo" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correcciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" BIGSERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "dispositivoId" TEXT,
    "ip" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT,
    "entidadId" TEXT,
    "detalle" JSONB,
    "hashAnterior" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "severidad" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "datos" JSONB,
    "atendida" BOOLEAN NOT NULL DEFAULT false,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion" (
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "actualizadoPor" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "limite_peticiones" (
    "clave" TEXT NOT NULL,
    "conteo" INTEGER NOT NULL,
    "ventanaFin" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "limite_peticiones_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_usuario_key" ON "usuarios"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivos_tokenHash_key" ON "dispositivos"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_tokenHash_key" ON "sesiones"("tokenHash");

-- CreateIndex
CREATE INDEX "sesiones_usuarioId_idx" ON "sesiones"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_tipoId_version_key" ON "plantillas"("tipoId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "esquemas_formulario_tipoId_version_key" ON "esquemas_formulario"("tipoId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "instrucciones_ia_tipoId_proposito_version_key" ON "instrucciones_ia"("tipoId", "proposito", "version");

-- CreateIndex
CREATE UNIQUE INDEX "expedientes_numeroInterno_key" ON "expedientes"("numeroInterno");

-- CreateIndex
CREATE INDEX "expedientes_estado_idx" ON "expedientes"("estado");

-- CreateIndex
CREATE INDEX "expedientes_responsableId_idx" ON "expedientes"("responsableId");

-- CreateIndex
CREATE INDEX "comparecientes_numeroDocumento_idx" ON "comparecientes"("numeroDocumento");

-- CreateIndex
CREATE INDEX "inmuebles_matricula_idx" ON "inmuebles"("matricula");

-- CreateIndex
CREATE INDEX "datos_extraidos_expedienteId_campo_idx" ON "datos_extraidos"("expedienteId", "campo");

-- CreateIndex
CREATE INDEX "observaciones_expedienteId_estado_idx" ON "observaciones"("expedienteId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "borradores_expedienteId_version_key" ON "borradores"("expedienteId", "version");

-- CreateIndex
CREATE INDEX "correcciones_tipoId_campo_idx" ON "correcciones"("tipoId", "campo");

-- CreateIndex
CREATE UNIQUE INDEX "auditoria_hash_key" ON "auditoria"("hash");

-- CreateIndex
CREATE INDEX "auditoria_fecha_idx" ON "auditoria"("fecha");

-- CreateIndex
CREATE INDEX "auditoria_usuarioId_idx" ON "auditoria"("usuarioId");

-- CreateIndex
CREATE INDEX "auditoria_accion_idx" ON "auditoria"("accion");

-- CreateIndex
CREATE INDEX "alertas_atendida_creadaEn_idx" ON "alertas"("atendida", "creadaEn");

-- AddForeignKey
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "dispositivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "tipos_escritura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_cargadaPorId_fkey" FOREIGN KEY ("cargadaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_aprobadaPorId_fkey" FOREIGN KEY ("aprobadaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esquemas_formulario" ADD CONSTRAINT "esquemas_formulario_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "tipos_escritura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrucciones_ia" ADD CONSTRAINT "instrucciones_ia_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "tipos_escritura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "tipos_escritura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_revisorId_fkey" FOREIGN KEY ("revisorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparecientes" ADD CONSTRAINT "comparecientes_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inmuebles" ADD CONSTRAINT "inmuebles_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analisis_ia" ADD CONSTRAINT "analisis_ia_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datos_extraidos" ADD CONSTRAINT "datos_extraidos_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datos_extraidos" ADD CONSTRAINT "datos_extraidos_analisisId_fkey" FOREIGN KEY ("analisisId") REFERENCES "analisis_ia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datos_extraidos" ADD CONSTRAINT "datos_extraidos_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observaciones" ADD CONSTRAINT "observaciones_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observaciones" ADD CONSTRAINT "observaciones_resueltaPorId_fkey" FOREIGN KEY ("resueltaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borradores" ADD CONSTRAINT "borradores_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correcciones" ADD CONSTRAINT "correcciones_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correcciones" ADD CONSTRAINT "correcciones_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
