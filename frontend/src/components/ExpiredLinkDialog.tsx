/**
 * Dialog shown when the user selects an expired download link.
 */
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";

interface ExpiredLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExpiredLinkDialog({
  isOpen,
  onClose,
}: ExpiredLinkDialogProps) {
  const navigate = useNavigate();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-slate-800 bg-slate-950 p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-100">Link expired</h3>
        <p className="mt-2 text-sm text-slate-300">
          This download link has expired. Capture a new library data file to
          refresh the signed download URLs.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            OK
          </Button>
          <Button
            onClick={() => {
              onClose();
              navigate("/downloads");
            }}
          >
            Go to downloads
          </Button>
        </div>
      </div>
    </div>
  );
}
