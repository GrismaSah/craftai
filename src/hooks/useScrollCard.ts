import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useScrollEntrance(
  selector: string,
  options?: {
    stagger?: number;
    y?: number;
    duration?: number;
    triggerStart?: string;
  }
) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const {
      stagger = 0.08,
      y = 40,
      duration = 0.6,
      triggerStart = 'top 75%',
    } = options || {};

    const elements = containerRef.current.querySelectorAll(selector);
    if (elements.length === 0) return;

    gsap.set(elements, { opacity: 0, y });

    const trigger = ScrollTrigger.create({
      trigger: containerRef.current,
      start: triggerStart,
      once: true,
      onEnter: () => {
        gsap.to(elements, {
          opacity: 1,
          y: 0,
          duration,
          stagger,
          ease: 'power3.out',
        });
      },
    });

    return () => {
      trigger.kill();
    };
  }, [selector, options]);

  return containerRef;
}
