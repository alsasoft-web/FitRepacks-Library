import { flushSync } from "react-dom";

export function toggleThemeWithRipple(
  event: React.MouseEvent<HTMLElement>,
  toggleColorScheme: () => void
): void {
  const x = event.clientX;
  const y = event.clientY;

  // 1. Feature detection for View Transition API & respect reduced-motion
  const supportsViewTransition =
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!supportsViewTransition) {
    toggleColorScheme();
    return;
  }

  // 2. Calculate the radius required to cover the entire viewport from click origin
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  // 3. Initiate the View Transition
  const transition = (document as any).startViewTransition(() => {
    // Force React state update synchronously during the transition capture
    flushSync(() => {
      toggleColorScheme();
    });
  });

  // 4. Animate the clipPath overlay once transition is ready
  transition.ready.then(() => {
    const clipPath = [
      `circle(0px at ${x}px ${y}px)`,
      `circle(${endRadius}px at ${x}px ${y}px)`,
    ];

    document.documentElement.animate(
      {
        clipPath: clipPath,
      },
      {
        duration: 500,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        pseudoElement: "::view-transition-new(root)",
      }
    );
  });
}
