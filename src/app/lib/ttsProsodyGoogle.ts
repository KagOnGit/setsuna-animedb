export function toGoogleSSML(text: string) {
  let s = text
    .replace(/\u2026/g, "...")
    .replace(/—/g, " - ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  s = s.replace(/\.{3,}/g, '<break time="300ms"/>');

  s = s.replace(/\b([A-Za-z])-(?=[A-Za-z])/g, (_m, g1) => {
    return `<say-as interpret-as="characters">${String(g1).toUpperCase()}</say-as><break time="120ms"/>`;
  });

  s = s
    .replace(/\b(Hmph|Ahem|Tch)\b/gi, '<emphasis level="moderate">$1</emphasis>')
    .replace(/\b(my dear|darling|pet)\b/gi, '<emphasis level="reduced">$1</emphasis>');

  return (opts?: { rate?: number; pitchSt?: string }) => {
    const rate = opts?.rate ?? 1.1;
    const pitchSt = opts?.pitchSt ?? "+2.0";
    return `<speak><prosody rate="${rate}" pitch="${pitchSt}">${s}</prosody></speak>`;
  };
}

