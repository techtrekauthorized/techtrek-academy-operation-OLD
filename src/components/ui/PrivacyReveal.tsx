"use client";

import { type ReactNode, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, cn } from "@/components/ui/primitives";

type PrivacyRevealProps = {
  children: ReactNode | ((visible: boolean, controls: { hideButton: ReactNode }) => ReactNode);
  viewLabel: string;
  hideLabel: string;
  viewAriaLabel: string;
  hideAriaLabel: string;
  hiddenMessage?: string;
  protectContent?: boolean;
  buttonPlacement?: "overlay" | "below";
  contentClassName?: string;
  showVisibleControl?: boolean;
  onHide?: () => void;
};

export function PrivacyReveal({
  children,
  viewLabel,
  hideLabel,
  viewAriaLabel,
  hideAriaLabel,
  hiddenMessage = "Sensitive data is hidden",
  protectContent = true,
  buttonPlacement = "overlay",
  contentClassName,
  showVisibleControl = true,
  onHide,
}: PrivacyRevealProps) {
  const [visible, setVisible] = useState(false);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const hidden = !visible;

  const toggle = () => {
    setVisible(current => {
      const next = !current;
      if (!next) {
        onHide?.();
        window.requestAnimationFrame(() => buttonContainerRef.current?.querySelector("button")?.focus());
      }
      return next;
    });
  };
  const hideButton = <Button type="button" variant="secondary" aria-label={hideAriaLabel} onClick={toggle}>
    <EyeOff size={14}/>
    {hideLabel}
  </Button>;
  const content = typeof children === "function" ? children(visible, { hideButton }) : children;

  if (!protectContent) {
    return <div className={contentClassName}>
      {content}
      <div ref={buttonContainerRef} className="mt-3 flex justify-center">
        <Button type="button" variant="secondary" aria-label={visible ? hideAriaLabel : viewAriaLabel} onClick={toggle}>
          {visible ? hideLabel : viewLabel}
        </Button>
      </div>
    </div>;
  }

  return <div className={cn("relative", contentClassName)}>
    <div
      aria-hidden={hidden}
      inert={hidden ? true : undefined}
      className={cn(
        "transition duration-200",
        hidden && "pointer-events-none select-none opacity-55 blur-2xl"
      )}
    >
      {content}
    </div>
    {buttonPlacement === "overlay" && hidden ? <div ref={buttonContainerRef} className="absolute inset-x-0 top-24 z-20 flex justify-center px-4 sm:top-32">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 text-center shadow-xl backdrop-blur">
        <Eye size={22} className="mx-auto mb-2 text-red-700"/>
        <p className="mb-3 text-sm font-semibold text-slate-700">{hiddenMessage}</p>
        <Button type="button" aria-label={viewAriaLabel} onClick={toggle}>{viewLabel}</Button>
      </div>
    </div> : showVisibleControl ? <div ref={buttonContainerRef} className="mb-4 flex justify-center">
      <Button type="button" variant="secondary" aria-label={visible ? hideAriaLabel : viewAriaLabel} onClick={toggle}>
        {visible ? <EyeOff size={14}/> : <Eye size={14}/>}
        {visible ? hideLabel : viewLabel}
      </Button>
    </div> : null}
  </div>;
}
