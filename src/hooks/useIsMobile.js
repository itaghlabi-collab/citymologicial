import { useEffect, useState } from 'react';

/** Breakpoint aligné sur App.css / inventaire (≤ 768px = mobile). */
export const MOBILE_MAX_WIDTH_MQ = '(max-width: 768px)';

/**
 * Hook léger réutilisable : true si la largeur viewport ≤ 768px.
 * Suit le redimensionnement via matchMedia (pas de double rendu CSS-only).
 */
export function useIsMobile(query = MOBILE_MAX_WIDTH_MQ) {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  ));

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, [query]);

  return isMobile;
}

export default useIsMobile;
