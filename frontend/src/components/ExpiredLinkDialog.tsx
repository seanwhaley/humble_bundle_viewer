/**
 * Dialog shown when the user selects an expired download link.
 */
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import {
  DIALOG_ACTION_ROW_END_CLASS,
  DIALOG_BACKDROP_CLASS,
  DIALOG_DESCRIPTION_CLASS,
  DIALOG_PANEL_CLASS,
  DIALOG_SCRIM_CLASS,
  DIALOG_TITLE_CLASS,
} from "../styles/roles";

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
    <div className={DIALOG_SCRIM_CLASS}>
      <div className={DIALOG_BACKDROP_CLASS} onClick={onClose} />
      <div className={DIALOG_PANEL_CLASS}>
        <h3 className={DIALOG_TITLE_CLASS}>Link expired</h3>
        <p className={DIALOG_DESCRIPTION_CLASS}>
          This download link has expired. Capture a new library data file to
          refresh the signed download URLs.
        </p>
        <div className={DIALOG_ACTION_ROW_END_CLASS}>
          <Button variant="ghost" onClick={onClose}>
            OK
          </Button>
          <Button
            onClick={() => {
              onClose();
              navigate("/library/other-downloads");
            }}
          >
            Go to downloads
          </Button>
        </div>
      </div>
    </div>
  );
}
