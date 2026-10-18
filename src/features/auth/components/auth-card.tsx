import type { ReactNode } from "react";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-[2.6rem] leading-tight">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
      {footer ? <div className="border-t pt-6 text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  );
}
