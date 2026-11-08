-- 0007 — Documenti firmati a mano
--
-- Nella piattaforma non si firma nulla: i moduli (iscrizione, liberatorie, consensi)
-- vengono firmati a mano e caricati come file. Si elimina la firma elettronica
-- introdotta in 0006: ogni documento ha sempre un file; per le tipologie che lo
-- richiedono si registra solo che il file caricato è un documento firmato.

begin;

update app.document_types set signature_mode = 'upload_signed' where signature_mode = 'electronic';
alter table app.document_types drop constraint if exists document_types_signature_mode_check;
alter table app.document_types add constraint document_types_signature_mode_check check (signature_mode in ('none', 'upload_signed'));
alter table app.document_types drop column if exists template_text;

-- I documenti "firmati nell'app" non hanno file: non possono restare (nessun ambiente in produzione li contiene)
delete from app.document_events where document_id in (select id from app.documents where file_path is null);
update app.documents set replaces_document_id = null where replaces_document_id in (select id from app.documents where file_path is null);
delete from app.documents where file_path is null;

alter table app.documents drop constraint if exists documents_signature_method_check;
alter table app.documents drop constraint if exists documents_check1; -- "file oppure firma elettronica" (resta documents_check: percorso del file nella cartella della palestra)
alter table app.documents alter column file_path set not null;
alter table app.documents add constraint documents_signature_method_check check (signature_method in ('upload_signed'));
alter table app.documents drop column if exists signed_at;
alter table app.documents drop column if exists signed_by;
alter table app.documents drop column if exists signer_name;

alter table app.document_events drop constraint if exists document_events_action_check;
alter table app.document_events add constraint document_events_action_check
  check (action in ('uploaded', 'approved', 'rejected', 'replacement_requested', 'replaced', 'viewed', 'downloaded'));

commit;
