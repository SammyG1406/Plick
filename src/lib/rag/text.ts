export const STOPWORDS = new Set(
  `a about above after again against all am an and any are aren as at be because been
   before being below between both but by can cannot could couldn did didn do does
   doesn doing don down during each few for from further had hadn has hasn have haven
   having he her here hers herself him himself his how i if in into is isn it its
   itself just let ll me more most mustn my myself no nor not of off on once only or
   other ought our ours ourselves out over own re same shan she should shouldn so some
   such than that the their theirs them themselves then there these they this those
   through to too under until up ve very was wasn we were weren what when where which
   while who whom why will with won would wouldn you your yours yourself yourselves
   also using used use e.g i.e etc via within upon among across`
    .split(/\s+/)
    .filter(Boolean),
);

export function tokenise(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 2 && !STOPWORDS.has(t),
  );
}

/** ~4 chars per token is close enough for chunk sizing; we never bill on it. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function snippet(text: string, max = 240): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** Min-max scale to 0..1 so heterogeneous scores can be fused additively. */
export function minMax(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) return values.map(() => (max > 0 ? 1 : 0));
  return values.map((v) => (v - min) / (max - min));
}
