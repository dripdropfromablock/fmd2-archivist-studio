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
  const isVisibleRef = useRef(false);
  const isHoveringInteractiveRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      isVisibleRef.current = false;
      isHoveringInteractiveRef.current = false;
      setIsVisible(false);
      setIsHoveringInteractive(false);
      setIsPressed(false);
      return;
    }

    let targetX = 0;
    let targetY = 0;
    let ringX = 0;
    let ringY = 0;
    let rafId: number | undefined;
    let lastFrameTime = 0;
    let idleTimer: number | undefined;
    let hasPointerPosition = false;
    let rippleSequence = 0;
    const rippleTimers = new Set<number>();

    const applyPosition = () => {
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
      }
      if (spotlightRef.current && ambientSpotlight) {
        spotlightRef.current.style.background = `radial-gradient(220px circle at ${ringX}px ${ringY}px, color-mix(in srgb, var(--theme-accent) 5%, transparent), transparent 72%)`;
      }
    };

    const animateRing = (frameTime: number) => {
      rafId = undefined;

      // Use elapsed time so the same easing feels consistent on 60 Hz and high-refresh displays.
      const elapsed = lastFrameTime
        ? Math.min(frameTime - lastFrameTime, 50)
        : 1000 / 60;
      const easing = 1 - Math.pow(0.68, elapsed / (1000 / 60));
      const deltaX = targetX - ringX;
      const deltaY = targetY - ringY;
      ringX += deltaX * easing;
      ringY += deltaY * easing;
      applyPosition();

      if (Math.abs(deltaX) > 0.35 || Math.abs(deltaY) > 0.35) {
        lastFrameTime = frameTime;
        rafId = window.requestAnimationFrame(animateRing);
      } else {
        // Snap the last fraction of a pixel to avoid a visible offset after movement stops.
        ringX = targetX;
        ringY = targetY;
        lastFrameTime = 0;
        applyPosition();
      }
    };

    const scheduleAnimation = () => {
      if (rafId === undefined) {
        rafId = window.requestAnimationFrame(animateRing);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;

      // Show the halo at the pointer immediately after entry or after it has faded out.
      if (!hasPointerPosition || !isVisibleRef.current) {
        ringX = targetX;
        ringY = targetY;
        hasPointerPosition = true;
        applyPosition();
      } else {
        scheduleAnimation();
      }

      if (!isVisibleRef.current) {
        isVisibleRef.current = true;
        setIsVisible(true);
      }

      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        isVisibleRef.current = false;
        setIsVisible(false);
        idleTimer = undefined;
      }, 1400);

      const target = e.target as Element | null;
      const interactiveMatch = Boolean(target?.closest?.(INTERACTIVE_SELECTOR));
      if (interactiveMatch !== isHoveringInteractiveRef.current) {
        isHoveringInteractiveRef.current = interactiveMatch;
        setIsHoveringInteractive(interactiveMatch);
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      setIsPressed(true);
      const rippleId = ++rippleSequence;
      const newRipple: ClickRipple = {
        id: rippleId,
        x: e.clientX,
        y: e.clientY,
      };
      setRipples((prev) => [...prev.slice(-3), newRipple]);
      const timer = window.setTimeout(() => {
        rippleTimers.delete(timer);
        setRipples((prev) => prev.filter((r) => r.id !== rippleId));
      }, 380);
      rippleTimers.add(timer);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.button === 0) setIsPressed(false);
    };

    const handleMouseLeave = () => {
      isVisibleRef.current = false;
      setIsVisible(false);
      setIsPressed(false);
    };

    const handleWindowBlur = () => {
      isVisibleRef.current = false;
      setIsVisible(false);
      setIsPressed(false);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      if (rafId !== undefined) window.cancelAnimationFrame(rafId);
      if (idleTimer) window.clearTimeout(idleTimer);
      rippleTimers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('blur', handleWindowBlur);
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
