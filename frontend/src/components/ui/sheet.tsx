/**
 * Simple slide-over sheet for secondary content.
 */
import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
}

/**
 * Slide-over panel with backdrop and scroll locking.
 */
export function Sheet({ isOpen, onClose, children, title }: SheetProps) {
  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
       {/* Backdrop */}
       <div 
          className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" 
            onClick={onClose} 
       />
       {/* Panel */}
       <div className="relative z-50 w-full max-w-3xl h-full bg-background border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between p-6 border-b">
             <div className="text-xl font-semibold tracking-tight">{title}</div>
             <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5"/>
             </Button>
          </div>
          <div className="flex-1 overflow-auto p-6">
             {children}
          </div>
       </div>
    </div>
  )
}
