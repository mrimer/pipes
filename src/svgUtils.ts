const SVG_NS = 'http://www.w3.org/2000/svg';

/** Build an SVG element from string attributes and optional children. No HTML parsing. */
export function svgEl(
  tag: string,
  attrs: Record<string, string | number>,
  children: SVGElement[] = [],
): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.appendChild(c);
  return el;
}

/** Build a sized svg root element with children. */
export function svgRoot(size: number, children: SVGElement[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  for (const c of children) svg.appendChild(c);
  return svg;
}
