/**
 * CrmFacturesHScroll — scroll X visible + hint (Factures desktop only).
 * Ne touche pas au contenu du tableau : wrap autour du scroll container.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export default function CrmFacturesHScroll({ children, depsKey }) {
  const scrollRef = useRef(null);
  const trackRef = useRef(null);
  const dragging = useRef(false);
  const [overflow, setOverflow] = useState(false);
  const [atEnd, setAtEnd] = useState(true);
  const [thumb, setThumb] = useState({ widthPct: 100, leftPct: 0 });

  const sync = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    const can = scrollWidth > clientWidth + 2;
    setOverflow(can);
    const maxScroll = Math.max(1, scrollWidth - clientWidth);
    const widthPct = can ? Math.max(12, (clientWidth / scrollWidth) * 100) : 100;
    const leftPct = can ? (scrollLeft / maxScroll) * (100 - widthPct) : 0;
    setThumb({ widthPct, leftPct });
    setAtEnd(!can || scrollLeft >= maxScroll - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    sync();
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    const table = el.querySelector('table');
    if (table) ro.observe(table);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [sync, depsKey]);

  function onScroll() {
    if (!dragging.current) sync();
  }

  function scrollToRatio(ratio) {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    el.scrollLeft = Math.max(0, Math.min(maxScroll, ratio * maxScroll));
    sync();
  }

  function onTrackPointerDown(e) {
    const track = trackRef.current;
    const el = scrollRef.current;
    if (!track || !el || !overflow) return;
    e.preventDefault();
    const rect = track.getBoundingClientRect();
    const thumbW = (thumb.widthPct / 100) * rect.width;
    const x = e.clientX - rect.left;
    const maxThumbLeft = Math.max(1, rect.width - thumbW);
    let left = x - thumbW / 2;
    left = Math.max(0, Math.min(maxThumbLeft, left));
    scrollToRatio(left / maxThumbLeft);

    dragging.current = true;
    const onMove = (ev) => {
      const r = track.getBoundingClientRect();
      const tw = (thumb.widthPct / 100) * r.width;
      const maxL = Math.max(1, r.width - tw);
      let l = ev.clientX - r.left - tw / 2;
      l = Math.max(0, Math.min(maxL, l));
      scrollToRatio(l / maxL);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div className={`crm-factures-scroll-shell${overflow ? ' is-overflow' : ''}${atEnd ? ' is-at-end' : ''}`}>
      {overflow && (
        <div className="crm-factures-scroll-hint" role="status">
          Faites défiler horizontalement pour voir les autres colonnes →
        </div>
      )}
      <div
        ref={scrollRef}
        className="table-wrap crm-table-scroll-x crm-factures-scroll-x"
        onScroll={onScroll}
      >
        {children}
      </div>
      {overflow && (
        <div className="crm-factures-hscroll" aria-hidden="true">
          <div
            ref={trackRef}
            className="crm-factures-hscroll-track"
            onPointerDown={onTrackPointerDown}
          >
            <div
              className="crm-factures-hscroll-thumb"
              style={{ width: `${thumb.widthPct}%`, left: `${thumb.leftPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
