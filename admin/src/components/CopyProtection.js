/**
 * CopyProtection.js
 *
 * Global wrapper that prevents copy/cut/contextmenu actions anywhere in the
 * admin dashboard. Applied once at the App level.
 *
 * Copy prevention is a deterrent — it does not replace server-side access
 * controls and encryption. It reduces casual data extraction and satisfies
 * the "no copy action" dashboard policy.
 */
import { useEffect } from 'react';

export function CopyProtectionProvider({ children }) {
  useEffect(() => {
    const stop = (e) => {
      // Allow copy only inside input fields (so admins can fill forms)
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
    };

    const stopContextMenu = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
    };

    document.addEventListener('copy',        stop);
    document.addEventListener('cut',         stop);
    document.addEventListener('contextmenu', stopContextMenu);

    // CSS-level selection prevention (injected globally)
    const style = document.createElement('style');
    style.id = 'mobo-copy-protection';
    style.textContent = `
      .mobo-protected,
      .MuiTableBody-root,
      .MuiTableCell-root,
      .MuiTypography-root:not(input):not(textarea) {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
      }
      /* Allow selection in inputs/textareas for usability */
      input, textarea, [contenteditable] {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.removeEventListener('copy',        stop);
      document.removeEventListener('cut',         stop);
      document.removeEventListener('contextmenu', stopContextMenu);
      const el = document.getElementById('mobo-copy-protection');
      if (el) el.remove();
    };
  }, []);

  return children;
}

export default CopyProtectionProvider;
