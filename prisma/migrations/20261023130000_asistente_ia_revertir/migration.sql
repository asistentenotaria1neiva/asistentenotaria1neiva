-- Se retira la creación de expedientes sin actos: los actos se eligen siempre al crear el expediente
ALTER TABLE "expedientes" ALTER COLUMN "tipoId" SET NOT NULL;
