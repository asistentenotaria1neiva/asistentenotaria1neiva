-- Asistente de IA: el expediente puede crearse sin actos y la IA detecta el tipo de escritura
ALTER TABLE "expedientes" ALTER COLUMN "tipoId" DROP NOT NULL;
