import { useApp } from "../store/app";

export function Toast() {
  const toast = useApp((s) => s.toast);
  return (
    <div className="toast-host" aria-live="polite">
      {toast && (
        <div key={toast.id} className="toast">
          {toast.text}
        </div>
      )}
    </div>
  );
}
