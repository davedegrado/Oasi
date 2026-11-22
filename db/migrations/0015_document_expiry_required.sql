-- ════════════════════════════════════════════════════════════════════
-- 0015 · Data di scadenza obbligatoria per tutti i documenti (configurabile)
--   documents.expiryRequired : true = ogni documento caricato deve avere una scadenza,
--                              qualunque sia la tipologia (anche i documenti liberi).
--                              false = solo le tipologie con expiry_required.
-- Valore della piattaforma: false. Oasi Metropolitana: true (seed 0110).
-- ════════════════════════════════════════════════════════════════════
create or replace function app.default_settings() returns jsonb
  language sql immutable
as $$ select '{
  "timezone": "Europe/Rome",
  "booking": { "opensHoursBefore": null, "closesHoursBefore": 0, "cancelHoursBefore": 0, "lateCancelConsumesEntry": true, "noShowConsumesEntry": true },
  "packages": { "consumeOn": "attendance" },
  "makeups": { "creditOn": "declared_in_time", "allowLowerLevel": true, "sameDisciplineOnly": false, "maxPerPlan": null,
               "requestOpensDaysBefore": null, "requestClosesDaysBefore": 0 },
  "competitive": { "certificateRequiredFor": ["competitive", "pre_competitive"], "blockEnrollmentWithoutCertificate": true },
  "documents": { "replacedRetentionDays": null, "expiryReminderDays": 30, "requestReminderDays": 3, "expiryRequired": false },
  "classes": { "categories": [], "maxDisciplines": null },
  "payments": { "methods": ["cash", "bank_transfer"] }
}'::jsonb $$;
