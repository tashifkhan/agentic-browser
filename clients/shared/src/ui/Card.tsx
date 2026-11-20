import type { HTMLAttributes, ReactNode } from "react";

/** Surface with a hairline border. Add `title`/`actions` for a header row. */
export function Card({
  title,
  actions,
  padded = true,
  children,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & { title?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={`ab-card${className ? ` ${className}` : ""}`} {...rest}>
      {(title || actions) && (
        <header className="card__head">
          {title && <h3 className="card__title">{title}</h3>}
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className={padded ? "card__body" : undefined}>{children}</div>
    </section>
  );
}
