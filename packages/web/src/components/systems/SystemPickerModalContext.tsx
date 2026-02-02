"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { SystemTemplatePicker } from "@/src/components/systems/SystemTemplatePicker";

interface SystemPickerModalContextValue {
  openSystemPicker: () => void;
  closeSystemPicker: () => void;
  isSystemPickerOpen: boolean;
}

const SystemPickerModalContext = createContext<SystemPickerModalContextValue | null>(null);

export function useSystemPickerModal() {
  const context = useContext(SystemPickerModalContext);
  if (!context) {
    throw new Error("useSystemPickerModal must be used within SystemPickerModalProvider");
  }
  return context;
}

interface SystemPickerModalProviderProps {
  children: ReactNode;
}

export function SystemPickerModalProvider({ children }: SystemPickerModalProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const openSystemPicker = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeSystemPicker = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <SystemPickerModalContext.Provider
      value={{ openSystemPicker, closeSystemPicker, isSystemPickerOpen: isOpen }}
    >
      {children}
    </SystemPickerModalContext.Provider>
  );
}

export function SystemPickerModalContent() {
  const { isSystemPickerOpen, closeSystemPicker } = useSystemPickerModal();

  if (!isSystemPickerOpen) return null;

  return (
    <div className="absolute inset-0 z-40 bg-background">
      <Button
        variant="ghost"
        size="icon"
        onClick={closeSystemPicker}
        className="absolute top-4 right-4 z-50 h-10 w-10 rounded-full bg-muted/80 hover:bg-muted"
      >
        <X className="h-5 w-5" />
      </Button>
      <div className="p-8 h-full flex flex-col overflow-hidden">
        <SystemTemplatePicker showHeader={true} className="flex-1" />
      </div>
    </div>
  );
}
