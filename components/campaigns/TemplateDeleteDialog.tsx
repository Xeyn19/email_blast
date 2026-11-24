"use client";

import { useEffect, useRef } from "react";

export function TemplateDeleteDialog({
  templateName,
  deleting,
  onCancel,
  onConfirm,
}: {
  templateName: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) onCancel();
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [deleting, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-template-title"
        aria-describedby="delete-template-description"
        className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#171717] p-6 shadow-2xl"
      >
        <h2 id="delete-template-title" className="text-xl font-semibold text-white">
          Delete saved template?
        </h2>
        <p id="delete-template-description" className="mt-3 text-sm leading-6 text-gray-300">
          <strong className="text-white">{templateName}</strong> will disappear
          from new campaigns. Existing campaigns keep their saved email content
          and hosted images, and you can upload a new template with the same name.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="campaign-secondary-button"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            aria-busy={deleting}
            onClick={onConfirm}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete template"}
          </button>
        </div>
      </section>
    </div>
  );
}
