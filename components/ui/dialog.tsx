"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * Sheets and dialogs (brief §4.5, §4.8, §5.2, §5.6).
 *
 *   Sheet          create / invite / publish forms. Right-side panel from 1024 px, full
 *                  screen below. Warns before closing with unsaved changes; autosaves nothing.
 *   Dialog         a short focused task (decline reason, manual search request).
 *   ConfirmDialog  every irreversible action: what will happen, as a list, then one button.
 *
 * All three are modal (focus trapped, Escape closes and returns focus to the trigger,
 * titled for assistive tech). Forms inside them are ordinary server-posted forms.
 */

const overlay = "anim-fade fixed inset-0 z-50 bg-navy/50";

type DirtyCtx = { markDirty: () => void };
const Dirty = createContext<DirtyCtx>({ markDirty: () => {} });

/** Wrap a form's fields so the Sheet knows they were touched. */
export function useMarkDirty() {
  return useContext(Dirty).markDirty;
}

export interface SheetProps {
  /** The button that opens it. */
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Start open (e.g. after a validation bounce, so the form is not lost). */
  defaultOpen?: boolean;
  /** Width from 1024 px. */
  size?: "md" | "lg";
}

/**
 * Right-side sheet. Any `input`/`change` inside marks it dirty; closing a dirty sheet
 * shows an inline "Discard changes?" bar instead of closing (brief §4.5, §13 rule 7).
 */
export function Sheet({ trigger, title, description, children, defaultOpen = false, size = "md" }: SheetProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const markDirty = useCallback(() => setDirty(true), []);

  const requestClose = (next: boolean) => {
    if (next) {
      setOpen(true);
      return;
    }
    if (dirty) {
      setConfirming(true);
      return;
    }
    setOpen(false);
  };
  const discard = () => {
    setConfirming(false);
    setDirty(false);
    setOpen(false);
  };

  return (
    <D.Root open={open} onOpenChange={requestClose}>
      <D.Trigger asChild>{trigger}</D.Trigger>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          onInput={markDirty}
          onChange={markDirty}
          className={cn(
            "anim-sheet bg-surface border-subtle fixed z-50 flex flex-col shadow-lg focus:outline-none",
            "inset-0 lg:inset-y-0 lg:right-0 lg:left-auto lg:border-l",
            size === "lg" ? "lg:w-[40rem]" : "lg:w-[30rem]",
          )}
        >
          <header className="border-subtle flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="min-w-0">
              <D.Title className="text-h2 text-text-primary font-serif">{title}</D.Title>
              {description ? (
                <D.Description className="text-text-muted text-body-sm mt-1">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close asChild>
              <Button variant="tertiary" size="icon" aria-label="Close">
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </D.Close>
          </header>
          {confirming && (
            <div
              role="alert"
              className="bg-attention-bg text-attention-fg border-attention-border text-body-sm flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3"
            >
              <span>You have changes that are not saved. Close and lose them?</span>
              <span className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} autoFocus>
                  Keep editing
                </Button>
                <Button variant="destructive" size="sm" onClick={discard}>
                  Discard changes
                </Button>
              </span>
            </div>
          )}
          <Dirty.Provider value={{ markDirty }}>
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </Dirty.Provider>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/**
 * Body + footer layout for a form inside a Sheet or Dialog: fields scroll, the footer
 * stays put with Cancel bottom-left (tertiary) and the one primary bottom-right.
 */
export function SheetForm({
  action,
  method = "post",
  children,
  submit,
  cancelLabel = "Cancel",
  hidden,
  id,
}: {
  action: string;
  method?: "post" | "get";
  children: ReactNode;
  /** The primary submit, e.g. <SubmitButton>Create partner</SubmitButton>. */
  submit: ReactNode;
  cancelLabel?: string;
  hidden?: Record<string, string>;
  id?: string;
}) {
  return (
    <form id={id} method={method} action={action} className="flex min-h-0 flex-1 flex-col">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
      <footer className="border-subtle bg-surface flex flex-col-reverse gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <D.Close asChild>
          <Button variant="tertiary" type="button">
            {cancelLabel}
          </Button>
        </D.Close>
        <div className="flex flex-col sm:flex-row [&>*]:w-full sm:[&>*]:w-auto">{submit}</div>
      </footer>
    </form>
  );
}

export interface DialogProps {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state, for callers that close it after an action. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Centred dialog from 640 px; full width at the bottom of the screen below. */
export function Dialog({ trigger, title, description, children, defaultOpen, open, onOpenChange }: DialogProps) {
  return (
    <D.Root defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange}>
      <D.Trigger asChild>{trigger}</D.Trigger>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          className={cn(
            "anim-dialog bg-surface border-subtle fixed z-50 flex max-h-[90dvh] flex-col border shadow-lg focus:outline-none",
            "rounded-t-card inset-x-0 bottom-0",
            "sm:rounded-card sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[32rem] sm:-translate-x-1/2 sm:-translate-y-1/2",
          )}
        >
          <header className="flex items-start justify-between gap-4 px-5 pt-5">
            <div className="min-w-0">
              <D.Title className="text-h2 text-text-primary font-serif">{title}</D.Title>
              {description ? (
                <D.Description className="text-text-secondary text-body mt-1">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close asChild>
              <Button variant="tertiary" size="icon" aria-label="Close">
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </D.Close>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export interface ConfirmDialogProps {
  /** Label of the button that opens the dialog. */
  triggerLabel: ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerClassName?: string;
  title: string;
  /** Exactly what will happen, one consequence per line ("Capture AUD $1,694.00 on Visa ••4417"). */
  consequences: ReactNode[];
  /** Who is told, e.g. "Dana Partner and ops@ are emailed." */
  notifies?: ReactNode;
  confirmLabel: string;
  /** destructive fills danger inside the dialog only (brief §4.4). */
  tone?: "primary" | "destructive";
  /** The form the confirm button posts. */
  action: string;
  hidden?: Record<string, string>;
  /** Extra fields shown above the consequences (a reason, a note). */
  children?: ReactNode;
  pendingLabel?: string;
  /** Single-key shortcut the ops queue presses for the focused row ("a", "d"). */
  shortcut?: string;
}

/** Irreversible actions (brief §5.6): the consequences listed, then one button that does it. */
export function ConfirmDialog(p: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <Dialog
      title={p.title}
      trigger={
        <Button
          variant={p.triggerVariant ?? (p.tone === "destructive" ? "destructive" : "primary")}
          size={p.triggerSize}
          className={p.triggerClassName}
          data-shortcut={p.shortcut}
          aria-keyshortcuts={p.shortcut}
        >
          {p.triggerLabel}
        </Button>
      }
    >
      <form
        ref={formRef}
        method="post"
        action={p.action}
        onSubmit={(e) => {
          if (busy) e.preventDefault();
          else setBusy(true);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {p.hidden && Object.entries(p.hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {p.children}
          <div>
            <p className="text-text-primary text-body-sm font-semibold">This will:</p>
            <ul className="text-text-secondary text-body mt-1 list-disc space-y-1 pl-5">
              {p.consequences.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
          {p.notifies && <p className="text-text-muted text-body-sm">{p.notifies}</p>}
        </div>
        <footer className="border-subtle flex flex-col-reverse gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <D.Close asChild>
            <Button variant="tertiary" type="button" disabled={busy}>
              Go back
            </Button>
          </D.Close>
          <Button
            type="submit"
            variant={p.tone === "destructive" ? "destructive-solid" : "primary"}
            loading={busy}
            className="w-full sm:w-auto"
          >
            {p.confirmLabel}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

export { D as DialogPrimitive };
