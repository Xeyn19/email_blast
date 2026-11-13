alter table public.email_templates
  add column if not exists default_subject text,
  add column if not exists default_preview_text text;

alter table public.email_templates
  drop constraint if exists email_templates_default_subject_length_check,
  drop constraint if exists email_templates_default_preview_text_length_check;

alter table public.email_templates
  add constraint email_templates_default_subject_length_check
    check (
      default_subject is null
      or length(btrim(default_subject)) between 1 and 120
    ),
  add constraint email_templates_default_preview_text_length_check
    check (
      default_preview_text is null
      or length(default_preview_text) <= 160
    );
