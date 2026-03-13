import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

type AlertDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "warning" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

const toneClasses = {
  default: "border-border/70",
  warning: "border-amber-500/40",
  danger: "border-destructive/40",
};

export function AlertDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
  children,
}: AlertDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, onCancel, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-6 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close dialog backdrop"
        onClick={() => {
          if (!busy) {
            onCancel();
          }
        }}
      />
      <dialog
        open
        aria-labelledby="alert-dialog-title"
        className={cn(
          "relative z-10 w-full max-w-xl rounded-xl border bg-card/95 p-0 shadow-2xl",
          toneClasses[tone],
        )}
      >
        <div className="space-y-3 border-b border-border/60 px-6 py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
            Action Required
          </p>
          <h3
            id="alert-dialog-title"
            className="text-2xl font-black uppercase tracking-tight rw-text"
          >
            {title}
          </h3>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {children ? <div className="px-6 py-5">{children}</div> : null}

        <div className="flex justify-end gap-3 border-t border-border/60 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
