const ELLIPSIS = "...";

let measureCanvas: HTMLCanvasElement | null = null;

function measureTextWidth(text: string, font: string): number {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

function truncateCharsMiddle(
  text: string,
  maxWidth: number,
  measure: (s: string) => number
): string {
  if (measure(text) <= maxWidth) return text;
  let front = Math.ceil(text.length / 2);
  let back = Math.floor(text.length / 2);
  while (front + back > 0) {
    const candidate = text.slice(0, front) + ELLIPSIS + text.slice(text.length - back);
    if (measure(candidate) <= maxWidth) return candidate;
    if (front > back) front--;
    else if (back > 0) back--;
    else front--;
  }
  return ELLIPSIS;
}

export function truncatePathMiddle(
  path: string,
  maxWidth: number,
  font: string
): string {
  const measure = (s: string) => measureTextWidth(s, font);
  if (measure(path) <= maxWidth) return path;

  const segments = path.split("\\");
  if (segments.length <= 1) {
    return truncateCharsMiddle(path, maxWidth, measure);
  }

  // UNCパス（\\server\share\...）は先頭に空セグメントが連続するため、最初の非空
  // セグメントまでをまとめてルートとして扱う（["", "", "server"] → "\\\\server"）。
  // ドライブパス（C:\...）では非空の1セグメント目がそのままルートになる。
  let rootEnd = 0;
  while (rootEnd < segments.length - 1 && segments[rootEnd] === "") rootEnd++;
  const rootSegments = segments.slice(0, rootEnd + 1);
  const basename = segments[segments.length - 1];
  const middle = segments.slice(rootEnd + 1, segments.length - 1);

  if (basename === "" || rootEnd >= segments.length - 1 || middle.length === 0) {
    // ルートと末尾の間に省略できるセグメントが無い場合、"..." を挿入すると
    // 実在しないセグメントを隠しているように見えてしまうため、通常の文字単位の
    // 中央省略にフォールバックする。
    return truncateCharsMiddle(path, maxWidth, measure);
  }

  const build = (frontCount: number, backCount: number) => {
    const front = [...rootSegments, ...middle.slice(0, frontCount)].join("\\");
    const back = [...middle.slice(middle.length - backCount), basename].join("\\");
    return `${front}\\${ELLIPSIS}\\${back}`;
  };

  let frontCount = 0;
  let backCount = 0;
  while (frontCount + backCount < middle.length) {
    const widthIfFront = measure(build(frontCount + 1, backCount));
    const widthIfBack = measure(build(frontCount, backCount + 1));
    const canFront = widthIfFront <= maxWidth;
    const canBack = widthIfBack <= maxWidth;
    if (!canFront && !canBack) break;
    if (canFront && (!canBack || widthIfFront <= widthIfBack)) {
      frontCount++;
    } else {
      backCount++;
    }
  }

  const result = build(frontCount, backCount);
  if (measure(result) <= maxWidth) return result;
  return truncateCharsMiddle(result, maxWidth, measure);
}
