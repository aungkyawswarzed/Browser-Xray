import { AlertIcon, CheckIcon, InfoIcon } from "./Icons";

interface ToastProps {
  kind: "success" | "error" | "info";
  message: string;
}

export function Toast({ kind, message }: ToastProps) {
  return (
    <div className={`toast ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {kind === "success" ? (
        <CheckIcon size={15} />
      ) : kind === "error" ? (
        <AlertIcon size={15} />
      ) : (
        <InfoIcon size={15} />
      )}
      <span>{message}</span>
    </div>
  );
}
