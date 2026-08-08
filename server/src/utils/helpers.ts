/** Helper: safely get a single string from Express req.params or req.query */
function getStr(val: any): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val[0] || '';
  return '';
}