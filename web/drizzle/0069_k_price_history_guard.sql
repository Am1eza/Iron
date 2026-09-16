-- K-258: price history is permanent business data, but the catalog FK chain
-- (category → sub_category → sku → price_points) is ON DELETE CASCADE, so a
-- single direct `DELETE FROM categories` silently destroys every price this
-- business ever published. The admin routes already compute that impact and
-- make an operator confirm it; nothing protected the database itself, which
-- is the path the audit rated most likely.
--
-- So the refusal lives here, and the confirmed admin paths opt back in with
-- `SET LOCAL ahantime.purge_authorized = 'on'` inside their transaction. The
-- flag is transaction-scoped: it cannot leak into a later statement on a
-- pooled connection.
CREATE FUNCTION refuse_priced_sku_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('ahantime.purge_authorized', true) IS DISTINCT FROM 'on'
     AND EXISTS (SELECT 1 FROM price_points WHERE sku_id = OLD.id) THEN
    RAISE EXCEPTION 'sku % carries published price history', OLD.id
      USING ERRCODE = 'restrict_violation',
            HINT = 'Delete it through the admin catalog routes, which record the impact and authorize the purge.';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER skus_refuse_priced_delete BEFORE DELETE ON skus
FOR EACH ROW EXECUTE FUNCTION refuse_priced_sku_delete();
