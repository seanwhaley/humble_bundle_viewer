/**
 * Lightweight tooltip rendered via portal for table cells.
 */
import { useState, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Tooltip wrapper that positions content relative to the trigger.
 */
export function Tooltip({
  children,
  content,
  className,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Compute the tooltip anchor point on hover.
  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const root = document.documentElement;
      root.style.setProperty("--tooltip-top", `${rect.top + window.scrollY}px`);
      root.style.setProperty(
        "--tooltip-left",
        `${rect.left + rect.width / 2 + window.scrollX}px`
      );
      setShow(true);
    }
  };
  
  // Always render wrapper to maintain DOM stability and event tracking
  // if (!content) return <>{children}</>;

  return (
    <div 
        ref={triggerRef}
        className={`relative inline-flex items-center ${className || ""}`} 
        onMouseEnter={handleMouseEnter} 
        onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && content && createPortal(
        <div
          className="tooltip-portal absolute px-2 py-1 text-xs text-slate-100 bg-slate-800 border border-slate-700 rounded shadow-xl whitespace-nowrap z-[9999] pointer-events-none animate-in fade-in zoom-in-95 duration-100 -translate-x-1/2 -translate-y-[calc(100%+8px)]"
        >
           {content}
           <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>,
        document.body
      )}
    </div>
  )
}
