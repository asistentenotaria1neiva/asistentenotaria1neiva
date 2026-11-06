-- Consumo de la API de Claude por llamada: tokens, costo, usuario y escritura
CREATE TABLE "consumo_ia" (
    "id" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "expedienteId" TEXT,
    "plantillaId" TEXT,
    "analisisId" TEXT,
    "proposito" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSalida" INTEGER NOT NULL DEFAULT 0,
    "tokensCacheLectura" INTEGER NOT NULL DEFAULT 0,
    "tokensCacheEscritura" INTEGER NOT NULL DEFAULT 0,
    "costoUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "historico" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "consumo_ia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consumo_ia_creadoEn_idx" ON "consumo_ia"("creadoEn");
CREATE INDEX "consumo_ia_usuarioId_creadoEn_idx" ON "consumo_ia"("usuarioId", "creadoEn");
CREATE INDEX "consumo_ia_expedienteId_idx" ON "consumo_ia"("expedienteId");

-- Histórico: los análisis ya registrados (con tokens) se cargan atribuidos al responsable del
-- expediente. No guardaban la escritura de caché, así que su costo puede quedar algo por debajo.
INSERT INTO "consumo_ia" ("id", "creadoEn", "usuarioId", "expedienteId", "analisisId", "proposito", "modelo",
  "tokensEntrada", "tokensSalida", "tokensCacheLectura", "costoUSD", "historico")
SELECT a."id", a."creadoEn", e."responsableId", a."expedienteId", a."id", a."proposito", a."modelo",
  a."tokensEntrada", a."tokensSalida", a."tokensCacheLectura",
  (a."tokensEntrada" * p.entrada + a."tokensSalida" * p.salida + a."tokensCacheLectura" * p.cache) / 1000000.0,
  true
FROM "analisis_ia" a
JOIN "expedientes" e ON e."id" = a."expedienteId"
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN a."modelo" LIKE 'claude-fable%' THEN 10 WHEN a."modelo" LIKE 'claude-sonnet%' THEN 2 WHEN a."modelo" LIKE 'claude-haiku-5-5%' THEN 0.1 ELSE 4 END AS entrada,
    CASE WHEN a."modelo" LIKE 'claude-fable%' THEN 50 WHEN a."modelo" LIKE 'claude-sonnet%' THEN 10 WHEN a."modelo" LIKE 'claude-haiku-5-5%' THEN 0.5 ELSE 20 END AS salida,
    CASE WHEN a."modelo" LIKE 'claude-fable%' THEN 0.25 WHEN a."modelo" LIKE 'claude-sonnet%' THEN 0.2 WHEN a."modelo" LIKE 'claude-haiku-5-5%' THEN 0.01 ELSE 0.2 END AS cache
) p
WHERE a."tokensEntrada" + a."tokensSalida" + a."tokensCacheLectura" > 0;
