import { Label } from "@/components/ui/label";

/**
 * The card-and-label pair the settings-shaped screens are built from.
 *
 * Lived inside `ProfileScreen` until the admin tools moved out of it and needed the
 * same shapes; one definition rather than two that drift.
 */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card rounded-[20px] p-5">
      <h2 className="t-title">{title}</h2>
      {description && (
        <p className="t-caption mt-1 text-[var(--text-2)]">{description}</p>
      )}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="t-label text-[var(--text-1)]">{label}</Label>
      {children}
      {hint && <p className="t-caption text-[var(--text-2)]">{hint}</p>}
    </div>
  );
}
