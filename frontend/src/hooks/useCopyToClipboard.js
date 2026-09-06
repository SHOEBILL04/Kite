import { useEffect, useState } from 'react';

/**
 * Copy-to-clipboard with a short acknowledgement, keyed so a list of copyable
 * rows can share one hook and still light up only the row that was copied.
 *
 *   const { copiedKey, copy } = useCopyToClipboard();
 *   <Button icon={copiedKey === id ? Check : Copy} onClick={() => copy(text, id)} />
 *
 * @param {number} [resetAfterMs]
 * @returns {{copiedKey: any, copy: (text: string, key?: any) => Promise<void>}}
 */
export function useCopyToClipboard(resetAfterMs = 1600) {
  const [copiedKey, setCopiedKey] = useState(null);

  useEffect(() => {
    if (copiedKey === null) return undefined;
    const timer = setTimeout(() => setCopiedKey(null), resetAfterMs);
    return () => clearTimeout(timer);
  }, [copiedKey, resetAfterMs]);

  const copy = async (text, key = text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
    } catch {
      // Clipboard permission denied, or an insecure origin. The text stays
      // selectable on the page, so there is nothing to recover from.
    }
  };

  return { copiedKey, copy };
}

export default useCopyToClipboard;
