import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { cx } from '@/lib/cx';

export interface BarcodeLabelProps {
  /** The text to encode, for example an item barcode "GZ100123" or a receipt number. */
  value: string;
  /** Printed under the bars. Defaults to the value. Pass false to hide it. */
  caption?: string | false;
  /** Bar height in barcode units (the SVG scales to its container). */
  barHeight?: number;
  className?: string;
}

/**
 * Code 128 barcode as an SVG. The container is forced to the light theme, so it prints and scans
 * dark on light in either theme. Colors come from CSS (`color: var(--ink)`), not from JsBarcode.
 */
export function BarcodeLabel({ value, caption, barHeight = 64, className }: BarcodeLabelProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !value) return;
    try {
      JsBarcode(svg, value, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: 2,
        height: barHeight,
        lineColor: 'currentColor',
        background: 'transparent',
      });
      // Let CSS size the SVG: keep the drawn size as the viewBox, drop the fixed width and height.
      const w = svg.getAttribute('width');
      const h = svg.getAttribute('height');
      if (w && h) svg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
      svg.removeAttribute('width');
      svg.removeAttribute('height');
    } catch {
      svg.replaceChildren();
    }
  }, [value, barHeight]);

  const text = caption === false ? null : (caption ?? value);
  return (
    <div className={cx('gz-barcode', className)} data-theme="light">
      <svg ref={ref} className="gz-barcode__svg" role="img" aria-label={`Barcode ${value}`} preserveAspectRatio="xMidYMid meet" />
      {text && <div className="gz-barcode__text gz-mono">{text}</div>}
    </div>
  );
}
