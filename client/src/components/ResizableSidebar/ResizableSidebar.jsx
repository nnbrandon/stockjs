import sidebarStyles from "./ResizableSidebar.module.css";

export default function ResizableSidebar({
  width,
  isResizing,
  onResizeStart,
  collapsed,
  collapsedClassName,
  collapsedContent,
  panelClassName,
  ariaLabel,
  children,
}) {
  if (collapsed) {
    return (
      <aside className={collapsedClassName} aria-hidden={false}>
        {collapsedContent}
      </aside>
    );
  }

  return (
    <div
      className={sidebarStyles.wrap}
      style={{ width }}
      data-resizing={isResizing || undefined}
    >
      <div
        className={sidebarStyles.handle}
        onMouseDown={onResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={width}
        aria-valuemin={280}
        aria-valuemax={640}
      />
      <aside
        className={`${sidebarStyles.panel} ${panelClassName || ""}`}
        aria-label={ariaLabel}
      >
        {children}
      </aside>
    </div>
  );
}
