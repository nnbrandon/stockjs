import { useState } from "react";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";

import AiCommitteeHelpModal from "./AiCommitteeHelpModal";
import styles from "./AiCommitteeHelpModal.module.css";

export default function AiCommitteeHelpButton({
  className,
  ariaLabel = "How does the AI Committee work?",
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className || styles.helpBtn}
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        title="How does this work?"
      >
        <HelpOutlineIcon fontSize="small" />
      </button>
      <AiCommitteeHelpModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
