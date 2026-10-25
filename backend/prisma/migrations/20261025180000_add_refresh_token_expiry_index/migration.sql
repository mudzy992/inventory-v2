-- Supports bounded daily cleanup of expired refresh-token rows.
CREATE INDEX "refresh_tokens_expiresAt_id_idx" ON "refresh_tokens"("expiresAt", "id");
