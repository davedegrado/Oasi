-- ════════════════════════════════════════════════════════════════════
-- 0013 · Finestra dei recuperi in giorni (prima era in ore)
--   makeups.requestOpensDaysBefore  : si chiede a partire da N giorni prima (null = senza limite)
--   makeups.requestClosesDaysBefore : ...fino a N giorni prima (0 = fino all'inizio della lezione)
-- Un giorno = 24 ore prima dell'inizio della lezione.
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
  "documents": { "replacedRetentionDays": null, "expiryReminderDays": 30, "requestReminderDays": 3 },
  "classes": { "categories": [], "maxDisciplines": null },
  "payments": { "methods": ["cash", "bank_transfer"] }
}'::jsonb $$;

-- Valori già salvati in ore: convertiti in giorni (arrotondando per eccesso) e tolti i vecchi
update app.tenant_settings set settings = jsonb_set(
    jsonb_set(settings #- '{makeups,requestOpensHoursBefore}' #- '{makeups,requestClosesHoursBefore}',
      '{makeups,requestOpensDaysBefore}',
      case when jsonb_typeof(settings -> 'makeups' -> 'requestOpensHoursBefore') = 'number'
           then to_jsonb(ceil((settings -> 'makeups' ->> 'requestOpensHoursBefore')::numeric / 24)::int) else 'null'::jsonb end),
    '{makeups,requestClosesDaysBefore}',
    to_jsonb(ceil(coalesce((settings -> 'makeups' ->> 'requestClosesHoursBefore')::numeric, 0) / 24)::int))
where settings -> 'makeups' ? 'requestOpensHoursBefore' or settings -> 'makeups' ? 'requestClosesHoursBefore';
