import { useEffect, useState } from 'react';

export default function useIsMobile(maxWidth = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= maxWidth : false
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width:${maxWidth}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    setIsMobile(mql.matches);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [maxWidth]);

  return isMobile;
}
