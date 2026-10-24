import { useEffect, type ReactNode } from "react";

interface ModalProps {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}

export function Modal({ title, children, actions, onClose }: ModalProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        <div className="modal-content">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}
