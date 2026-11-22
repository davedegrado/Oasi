-- ════════════════════════════════════════════════════════════════════
-- 0012 · Ingresso di un pacchetto restituito a mano dall'amministrazione
-- (es. atleta assente senza disdetta: l'ingresso si scala, la segreteria può restituirlo)
-- ════════════════════════════════════════════════════════════════════
alter table app.lesson_bookings drop constraint if exists lesson_bookings_consumed_by_check;
alter table app.lesson_bookings add constraint lesson_bookings_consumed_by_check
  check (consumed_by in ('booking', 'attendance', 'no_show', 'late_cancel', 'refunded'));
