// A drawing preview is not a nesting result. Only engine-imported polygons are
// rendered; uploaded SVG markup, scripts and external references never enter DOM.
export function createImportLayout(library, names = []) {
  const files = [...new Set([...names, ...(library.imports || []).map(item => item.file)])].filter(name => typeof name === 'string' && name);
  const groups = new Map();
  for (const part of library.parts) {
    const file = [...files].sort((a, b) => b.length - a.length).find(name => part.source === name || part.source.startsWith(name + '#')) || part.source.replace(/#[^#]*$/, '');
    if (!groups.has(file)) groups.set(file, []);
    groups.get(file).push(part);
  }
  const sheets = [], placements = [];
  for (const [file, parts] of groups) {
    const id = `import-${sheets.length}`;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const part of parts) {
      const b = part.bounds_mm;
      minX = Math.min(minX, b[0]); maxX = Math.max(maxX, b[2]);
      // Nestbolt uses Cartesian Y-up, including SVG import. Reflect the whole
      // drawing, not each part independently, to keep original relative positions.
      minY = Math.min(minY, -b[3]); maxY = Math.max(maxY, -b[1]);
      placements.push({part_id: part.id, copy_index: 0, sheet_id: id,
        transform: {translation: [0, 0], rotation_radians: Math.PI, mirrored: true}});
    }
    const width = Math.max(1, maxX - minX), height = Math.max(1, maxY - minY), padding = Math.max(width, height) * .04;
    sheets.push({id, stock_id: id, file, width_mm: width, height_mm: height,
      viewBox: [minX - padding, minY - padding, width + padding * 2, height + padding * 2]});
  }
  return {version: 1, units: 'mm', preview: true, sheets, placements};
}