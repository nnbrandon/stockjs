import { useState } from "react";
import IconButton from "@mui/material/IconButton";
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
      <IconButton
        className={className || styles.helpBtn}
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        title="How does this work?"
        size="small"
      >
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
      <AiCommitteeHelpModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
