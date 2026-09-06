import { useEffect, useState } from 'react';

/**
 * Read a CSS media query from JS.
 *
 * Use it only when a breakpoint changes which *component* renders — a table
 * becoming cards, a drawer becoming a modal. Anything expressible as a class
 * change belongs in Tailwind's responsive variants instead.
 *
 * @param {string} query e.g. '(min-width: 768px)'
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export default useMediaQuery;
