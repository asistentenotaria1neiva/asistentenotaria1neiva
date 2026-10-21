-- Registro de auditoría inmodificable.
-- Ninguna fila de "auditoria" puede actualizarse ni borrarse, ni siquiera por la aplicación.
-- (Un superusuario de PostgreSQL podría desactivar el disparador: por eso además cada fila
--  encadena el hash de la anterior y la cadena se verifica desde el panel de auditoría.)

CREATE OR REPLACE FUNCTION auditoria_bloquear_cambios() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El registro de auditoría es inmodificable (operación % bloqueada)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auditoria_sin_update
  BEFORE UPDATE ON "auditoria"
  FOR EACH ROW EXECUTE FUNCTION auditoria_bloquear_cambios();

CREATE TRIGGER auditoria_sin_delete
  BEFORE DELETE ON "auditoria"
  FOR EACH ROW EXECUTE FUNCTION auditoria_bloquear_cambios();

CREATE TRIGGER auditoria_sin_truncate
  BEFORE TRUNCATE ON "auditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_bloquear_cambios();
