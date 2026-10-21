import React, { useEffect, useRef, useState } from 'react';

interface ClickRipple {
  id: number;
  x: number;
  y: number;
}

interface InteractiveCursorOverlayProps {
  enabled?: boolean;
  ambientSpotlight?: boolean;
}

const INTERACTIVE_SELECTOR =
  'button, a, select, input, textarea, label, [role="button"], [role="switch"], [role="option"], [role="listbox"], .manga-card-interactive';

export const InteractiveCursorOverlay: React.FC<InteractiveCursorOverlayProps> = ({
  enabled = true,
  ambientSpotlight = true,
}) => {
  const ringRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  const [isVisible, setIsVisible] = useState(false);
  const [isHoveringInteractive, setIsHoveringInteractive] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<ClickRipple[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let rafId = 0;
    let idleTimer: number | undefined;
    let hasMoved = false;

    const animateRing = () => {
      // Gentle, responsive interpolation so it never lags far behind the cursor
      ringX += (mouseX - ringX) * 0.28;
      ringY += (mouseY - ringY) * 0.28;

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
      }
      if (spotlightRef.current && ambientSpotlight) {
        spotlightRef.current.style.background = `radial-gradient(220px circle at ${ringX}px ${ringY}px, color-mix(in srgb, var(--theme-accent) 5%, transparent), transparent 72%)`;
      }

      rafId = window.requestAnimationFrame(animateRing);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (!hasMoved) {
        hasMoved = true;
        ringX = mouseX;
        ringY = mouseY;
      }
      setIsVisible(true);

      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        setIsVisible(false);
      }, 1400);

      const target = e.target as Element | null;
      const interactiveMatch = Boolean(target?.closest?.(INTERACTIVE_SELECTOR));
      setIsHoveringInteractive(interactiveMatch);
    };

    const handleMouseDown = (e: MouseEvent) => {
      setIsPressed(true);
      const rippleId = Date.now() + Math.random();
      const newRipple: ClickRipple = {
        id: rippleId,
        x: e.clientX,
        y: e.clientY,
      };
      setRipples((prev) => [...prev.slice(-3), newRipple]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== rippleId));
      }, 380);
    };

    const handleMouseUp = () => {
      setIsPressed(false);
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
    };

    rafId = window.requestAnimationFrame(animateRing);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown, { passive: true });
    window.addEventListener('mouseup', handleMouseUp, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.cancelAnimationFrame(rafId);
      if (idleTimer) window.clearTimeout(idleTimer);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [enabled, ambientSpotlight]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden hidden sm:block"
    >
      {/* Ultra-Subtle Ambient Pointer Sheen */}
      {ambientSpotlight && (
        <div
          ref={spotlightRef}
          className={`pointer-events-none fixed inset-0 transition-opacity duration-500 ${
            isVisible ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Soft Micro Click Ripples */}
      {ripples.map((r) => (
        <span
          key={r.id}
          style={{ left: `${r.x}px`, top: `${r.y}px` }}
          className="pointer-events-none fixed -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border border-indigo-400/35 animate-cursor-ripple"
        />
      ))}

      {/* Delicate Trailing Halo Ring (Fades out when cursor is stationary) */}
      <div
        ref={ringRef}
        className={`pointer-events-none fixed top-0 left-0 -ml-2.5 -mt-2.5 w-5 h-5 rounded-full transition-opacity duration-300 will-change-transform ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className={`w-full h-full rounded-full border transition-all duration-200 ease-out ${
            isPressed
              ? 'scale-85 border-indigo-400/50 bg-indigo-500/10'
              : isHoveringInteractive
              ? 'scale-125 border-indigo-400/40 bg-indigo-500/[0.06]'
              : 'scale-100 border-indigo-400/18 bg-transparent'
          }`}
        />
      </div>
    </div>
  );
};
