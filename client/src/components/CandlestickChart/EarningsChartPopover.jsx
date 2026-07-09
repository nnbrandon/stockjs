import { useEffect, useLayoutEffect, useRef, useState } from "react";
import IconButton from "@mui/material/IconButton";
import EarningsDetailContent from "../EarningsDetail/EarningsDetailContent";
import styles from "./EarningsChartPopover.module.css";

const closeBtnSx = {
  position: "absolute",
  top: 8,
  right: 8,
  padding: "2px",
  fontSize: 16,
  lineHeight: 1,
  color: "var(--palette-text-disabled)",
  "&:hover": {
    color: "var(--palette-text-primary)",
    backgroundColor: "transparent",
  },
};

export default function EarningsChartPopover({
  earning,
  anchor,
  containerRef,
  onClose,
}) {
  const popoverRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!anchor || !containerRef?.current || !popoverRef.current) return;

    const container = containerRef.current.getBoundingClientRect();
    const popover = popoverRef.current.getBoundingClientRect();
    const margin = 8;

    let left = anchor.clientX - container.left - popover.width / 2;
    let top = anchor.clientY - container.top - popover.height - margin;

    left = Math.max(
      margin,
      Math.min(left, container.width - popover.width - margin),
    );
    if (top < margin) {
      top = anchor.clientY - container.top + margin;
    }

    setPos({ top, left });
  }, [anchor, containerRef, earning]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e) => {
      if (popoverRef.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  if (!earning) return null;

  return (
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label="Earnings report details"
    >
      <IconButton sx={closeBtnSx} onClick={onClose} aria-label="Close">
        ×
      </IconButton>
      <EarningsDetailContent
        date={earning.date}
        reportedDate={earning.reportedDate}
        epsActual={earning.epsActual}
        epsEstimate={earning.epsEstimate}
        epsDifference={earning.epsDifference}
        surprisePercent={earning.surprisePercent}
        revenueActual={earning.revenueActual}
        netIncomeActual={earning.netIncomeActual}
      />
    </div>
  );
}
