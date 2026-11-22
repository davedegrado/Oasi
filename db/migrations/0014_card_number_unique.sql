-- ════════════════════════════════════════════════════════════════════
-- 0014 · Numero di tessera associativa: lo assegna l'amministrazione,
--        unico nella struttura (senza distinzione tra maiuscole e minuscole)
-- ════════════════════════════════════════════════════════════════════
create unique index if not exists member_admin_card_unique
  on app.member_admin (tenant_id, lower(card_number)) where card_number is not null;
