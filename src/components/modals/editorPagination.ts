/**
 * A4 sayfa akışı — yalnızca editör görünümü (belge içeriğine yazılmaz).
 */

export type PageMetrics = {
  pageHeight: number;
  pageContentHeight: number;
  pageGap: number;
  marginTop: number;
  marginBottom: number;
  interPageSpacing: number;
  /**
   * PDF'te bir sayfaya sığan içerik yüksekliği. Chrome yazdırırken sayfa içerik alanını tam
   * piksele YUKARI yuvarlar (ölçüm: 15/15mm → 1009,13px değil 1010px). Sayfa sonundaki satırın
   * hangi sayfaya düşeceği bununla belirlenir; görsel sayfa adımı ise kesin mm değeriyle kalır.
   */
  fragmentainerHeight: number;
};

export type LayoutUnitKind = 'block' | 'table-row' | 'line';

export type LayoutUnit = {
  docPos: number;
  height: number;
  /**
   * ProseMirror köküne göre üst konum (px). Sayfa aralıkları gizliyken ölçülür
   * ("doğal" yerleşim — PDF'in sayfalamadan önceki akışı ile aynı).
   */
  offsetTop: number;
  isPageBreak: boolean;
  kind: LayoutUnitKind;
  /**
   * Aralık, bloğun İÇİNE (içeriğinden önce) mi yerleşir? Paragraf/başlık/madde içinde
   * yerleşince bloğun kenar boşlukları değişmez. Kardeş olarak yerleşen aralıkta (widget,
   * hr…) margin birleşmesi bozulduğundan düzeltme gerekir.
   */
  gapInside?: boolean;
  marginTop?: number;
  marginBottom?: number;
  /** h1–h3: PDF'te "break-after: avoid-page" — başlık sayfa sonunda yalnız kalmaz */
  avoidBreakAfter?: boolean;
  /** Bir bloğun ilk satırı (satır birimlerinde) — bloklar arası kırılım noktası */
  startsBlock?: boolean;
  /**
   * Ekranda görünen (doğal) üst konum. Verilirse offsetTop/height PDF eşdeğeri ölçümdür
   * (ekran ölçeği ≠ %100 iken; bkz. EditorPaginationExtension) ve kırılım KARARI onlarla
   * verilir; eklenecek boşluğun yüksekliği ise görünen konuma göre hesaplanır.
   */
  visualOffsetTop?: number;
};

export type PageGapTarget = {
  docPos: number;
  kind: 'block' | 'table-row' | 'page-break';
  /** Eklenecek boşluk: sayfa sonuna kalan alan + alt kenar + sayfa arası + üst kenar */
  height: number;
};

export type LineRect = {
  offsetTop: number;
  height: number;
};

/**
 * DOM konumlarına dayalı sayfa kırılımı.
 * Yükseklik toplama yerine offsetTop kullanır; liste maddeleri arası margin
 * birikiminden kaynaklanan editör/PDF sapmasını azaltır.
 */
export function computeEditorPageLayout(
  contentExtentPx: number,
  pageContentHeight: number,
  interPageSpacingPx: number,
  minimumPages = 1
): { pageCount: number; minHeightPx: number } {
  if (pageContentHeight <= 0) {
    return { pageCount: 1, minHeightPx: 1 };
  }

  let byContent = 1;
  if (contentExtentPx > pageContentHeight + 0.5) {
    const overflow = contentExtentPx - pageContentHeight;
    const step = pageContentHeight + interPageSpacingPx;
    byContent = 1 + Math.ceil(overflow / step);
  }

  const pageCount = Math.max(minimumPages, byContent);
  const minHeightPx =
    pageCount * pageContentHeight + Math.max(0, pageCount - 1) * interPageSpacingPx;

  return { pageCount, minHeightPx };
}

export function getContentExtent(units: LayoutUnit[]): number {
  const contentUnits = units.filter((unit) => !unit.isPageBreak && unit.height > 0.5);
  if (contentUnits.length === 0) return 0;

  const last = contentUnits[contentUnits.length - 1];
  return last.offsetTop + last.height;
}

export function resolveMinimumPageCount(
  units: LayoutUnit[],
  autoGapCount: number
): number {
  const manualBreaks = units.filter((unit) => unit.isPageBreak).length;
  return Math.max(1, autoGapCount + manualBreaks + 1);
}

/**
 * Bir metin bloğunun satır kutularını ölçer.
 *
 * Blok elemanın getClientRects()'i tek bir kutu döndürür; satırları görmek için içeriğin
 * Range'i kullanılır. Range kutuları yalnızca yazı yüksekliğini (glyph alanı) kapsar; Chrome
 * ise sayfayı satır kutusuna (line-height) göre böler. Bu yüzden ardışık satırların sınırı
 * iki glyph kutusunun ortası, ilk/son satırın sınırı da bloğun içerik kenarı kabul edilir.
 */
export function measureTextLines(element: HTMLElement, editorRoot: HTMLElement): LineRect[] {
  const rootRect = editorRoot.getBoundingClientRect();
  const scrollTop = editorRoot.scrollTop;
  // Kutular BELGE SIRASIYLA toplanır: metin düğümleri (satır satır) ve satır içi görseller.
  // range.selectNodeContents(element).getClientRects() önce kapsayıcı span'lerin tüm satır
  // kutularını, sonra metni verdiğinden sıra bozuluyordu.
  const range = document.createRange();
  const raw: DOMRect[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      range.selectNodeContents(node);
      raw.push(...Array.from(range.getClientRects()));
    } else if ((node as Element).tagName === 'IMG') {
      raw.push((node as Element).getBoundingClientRect());
    }
  }

  const rects = raw
    .filter((rect) => rect.height >= 1 && rect.width > 0)
    .map((rect) => {
      const top = rect.top - rootRect.top + scrollTop;
      return { top, bottom: top + rect.height, left: rect.left, right: rect.right };
    });
  const buckets = groupRectsIntoLines(rects);
  if (buckets.length === 0) return [];

  const style = getComputedStyle(element);
  const elementRect = element.getBoundingClientRect();
  const contentTop =
    elementRect.top - rootRect.top + scrollTop +
    parseFloat(style.borderTopWidth || '0') + parseFloat(style.paddingTop || '0');
  const contentBottom =
    elementRect.bottom - rootRect.top + scrollTop -
    parseFloat(style.borderBottomWidth || '0') - parseFloat(style.paddingBottom || '0');

  // Satır kutusu sınırı: yazı kutusu satır kutusunun içinde her satırda aynı yerde durur
  // (paragraf iskeleti/strut + yazı boyutu). İlk satırdan "yazı üstü − satır üstü", son
  // satırdan "satır altı − yazı altı" payı çıkarılır; iki tahminin ortalaması düzenli
  // satırlarda kesindir (iki yazı kutusunun ortası, ör. 2 satır aralığında 14px yazı, ~0,7px kayar).
  const topInset = buckets[0].top - contentTop;
  const bottomInset = contentBottom - buckets[buckets.length - 1].bottom;
  const boundaries = buckets.slice(1).map((line, index) => {
    const fromBelow = line.top - topInset;
    const fromAbove = buckets[index].bottom + bottomInset;
    return (fromBelow + fromAbove) / 2;
  });

  return buckets.map((_, index) => {
    const top = index === 0 ? contentTop : boundaries[index - 1];
    const bottom = index === buckets.length - 1 ? contentBottom : boundaries[index];
    return { offsetTop: top, height: Math.max(0, bottom - top) };
  });
}

/**
 * Range kutularını (belge sırasıyla) satırlara ayırır. Yeni satır = kutu sola geri döner ve
 * aşağıda başlar. Dikey çakışmaya bakılmaz: satır aralığı 1'in altındaysa (0,7–0,9) ardışık
 * satırların yazı kutuları üst üste biner; çakışmayla gruplamak tüm paragrafı tek "satır"
 * sayıp PDF'in satır satır böldüğü paragrafı bütün olarak taşıyordu.
 */
export function groupRectsIntoLines(
  rects: Array<{ top: number; bottom: number; left: number; right: number }>
): Array<{ top: number; bottom: number }> {
  const lines: Array<{ top: number; bottom: number; right: number }> = [];
  for (const rect of rects) {
    const line = lines[lines.length - 1];
    const wrapsToNewLine = !line || (rect.left < line.right - 1 && rect.top > line.top + 1);
    if (wrapsToNewLine) {
      lines.push({ top: rect.top, bottom: rect.bottom, right: rect.right });
    } else {
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
      line.right = Math.max(line.right, rect.right);
    }
  }
  return lines.map(({ top, bottom }) => ({ top, bottom }));
}

export type PaginationResult = {
  targets: PageGapTarget[];
  pageCount: number;
  /** Aralıklar eklendikten sonra içeriğin bittiği yer (editör köküne göre) */
  contentEnd: number;
};

/**
 * Chrome'un yazdırma (PDF) sayfalamasını doğal yerleşim üzerinde simüle eder ve her
 * sayfa geçişi için gereken TAM boşluğu hesaplar: sonraki birim bir sonraki sayfanın
 * içerik başlangıcına (üst kenar boşluğunun hemen altına) oturur — PDF'teki gibi.
 *
 * Kurallar (PDF ile aynı):
 * - Sayfaya sığmayan birim (satır / blok / tablo satırı) sonraki sayfaya geçer.
 * - Sayfa başındaki birimin üst kenar boşluğu kesilir (unforced break).
 * - h1–h3'ten hemen sonra kırılım olacaksa başlık da sonraki sayfaya taşınır; art arda
 *   başlıklar (Başlık 1 + Başlık 2) zincir olarak birlikte taşınır.
 * - Manuel sayfa sonundan sonra içerik yeni sayfadan başlar.
 */
export function paginateNaturalLayout(
  units: LayoutUnit[],
  pageContentHeight: number,
  interPageSpacingPx: number,
  marginTopPx = 0,
  fragmentainerHeight = pageContentHeight
): PaginationResult {
  const targets: PageGapTarget[] = [];
  if (pageContentHeight <= 0) {
    return { targets, pageCount: 1, contentEnd: 0 };
  }

  const pageStep = pageContentHeight + interPageSpacingPx;
  let pageStart = marginTopPx;
  let pageCount = 1;
  // shift: PDF eşdeğeri akışta, visualShift: ekrandaki akışta eklenen toplam boşluk.
  // Sayfa ızgarası (pageStart + k·pageStep) iki akışta aynıdır.
  let shift = 0;
  let visualShift = 0;
  let contentEnd = 0;
  // Bu sayfaya yerleşen birimler (başlık zinciri için geriye bakılır)
  type Placed = { unit: LayoutUnit; top: number; visualTop: number; siblingBefore: LayoutUnit | null };
  let placed: Placed[] = [];
  let prevSibling: LayoutUnit | null = null;

  const visualTopOf = (unit: LayoutUnit) => (unit.visualOffsetTop ?? unit.offsetTop) + visualShift;

  const gapHeightFor = (
    unit: LayoutUnit,
    top: number,
    nextPageStart: number,
    siblingBefore: LayoutUnit | null
  ) => {
    let height = nextPageStart - top;
    if (!unit.gapInside && unit.kind === 'block') {
      // Kardeş aralık, önceki bloğun alt ve bu bloğun üst boşluğunu ayırır: birleşmiş
      // max(alt, üst) yerine alt + aralık + üst oluşur → küçük olan pay fazladan eklenir.
      // Sonuç: blok kenarlığı tam sayfa başında (PDF sayfa başındaki üst boşluğu keser).
      height -= Math.min(siblingBefore?.marginBottom ?? 0, unit.marginTop ?? 0);
    }
    return Math.max(0, height);
  };

  for (const unit of units) {
    if (unit.isPageBreak) {
      const top = unit.offsetTop + shift;
      const visualTop = visualTopOf(unit);
      const nextPageStart = pageStart + pageStep * Math.max(1, Math.ceil((top - pageStart + 0.5) / pageStep));
      const height = Math.max(0, nextPageStart - top);
      const visualHeight = Math.max(0, nextPageStart - visualTop);
      targets.push({ docPos: unit.docPos, kind: 'page-break', height: visualHeight });
      shift += height - unit.height;
      visualShift += visualHeight - unit.height;
      pageCount += Math.round((nextPageStart - pageStart) / pageStep);
      pageStart = nextPageStart;
      placed = [];
      prevSibling = null;
      continue;
    }

    if (unit.height <= 0.5) continue;

    let top = unit.offsetTop + shift;
    let visualTop = visualTopOf(unit);
    const relativeTop = top - pageStart;
    const overflows = relativeTop + unit.height > fragmentainerHeight + 0.01;

    if (overflows && relativeTop > 0.5) {
      let breakAt: Placed = { unit, top, visualTop, siblingBefore: prevSibling };
      const isBlockBoundary = unit.kind !== 'line' || unit.startsBlock;
      if (isBlockBoundary) {
        // break-after: avoid-page — kırılımı, sayfa başını boşaltmadan başlık(lar)ın önüne al
        for (let index = placed.length - 1; index >= 0; index--) {
          const candidate = placed[index];
          if (!candidate.unit.avoidBreakAfter || candidate.top - pageStart <= 0.5) break;
          if (targets.some((t) => t.docPos === candidate.unit.docPos)) break;
          breakAt = candidate;
        }
      }

      const nextPageStart = pageStart + pageStep;
      const height = gapHeightFor(breakAt.unit, breakAt.top, nextPageStart, breakAt.siblingBefore);
      const visualHeight = gapHeightFor(breakAt.unit, breakAt.visualTop, nextPageStart, breakAt.siblingBefore);
      const breakUnit = breakAt.unit;
      targets.push({
        docPos: breakUnit.docPos,
        kind: breakUnit.kind === 'table-row' ? 'table-row' : 'block',
        height: visualHeight,
      });
      // Gerçek kayma = kırılan birimin vardığı yer − eski yeri. Kardeş aralıkta bu, aralık
      // yüksekliğinden "birleşmeyen pay" kadar fazladır; aralık yüksekliğini toplamak sonraki
      // tüm sayfaları birkaç px kaydırıyordu.
      const displacement = Math.max(height, nextPageStart - breakAt.top);
      const visualDisplacement = Math.max(visualHeight, nextPageStart - breakAt.visualTop);
      shift += displacement;
      visualShift += visualDisplacement;
      top += displacement;
      visualTop += visualDisplacement;
      pageStart = nextPageStart;
      pageCount += 1;
      // Taşınan başlıklar yeni sayfanın ilk birimleri
      const movedFrom = placed.indexOf(breakAt);
      placed = movedFrom >= 0
        ? placed.slice(movedFrom).map((p) => ({ ...p, top: p.top + displacement, visualTop: p.visualTop + visualDisplacement }))
        : [];
    }

    // Sayfadan uzun birim (dev görsel/satır): PDF onu sayfalara böler; editör bölemez,
    // yalnızca kapladığı sayfaları sayarız.
    while (top + unit.height > pageStart + fragmentainerHeight + 0.01 && unit.height > fragmentainerHeight) {
      pageStart += pageStep;
      pageCount += 1;
    }

    // Yükseklik farkı (ekran ↔ PDF) en fazla birkaç kesirli pikseldir; son sayfa dolgusu için yeterli
    contentEnd = Math.max(contentEnd, visualTop + unit.height);
    placed.push({ unit, top, visualTop, siblingBefore: prevSibling });
    if (unit.kind !== 'line' || unit.startsBlock) prevSibling = unit;
  }

  return { targets, pageCount, contentEnd };
}

/** Chrome yazdırma: sayfa içerik alanı tam piksele yukarı yuvarlanır (bkz. PageMetrics). */
export function pdfFragmentainerHeight(pageContentHeight: number): number {
  return Math.ceil(pageContentHeight - 0.001);
}

export function parseCssLengthToPx(value: string, context: HTMLElement): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.height = trimmed;
  context.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  context.removeChild(probe);
  return px;
}

export function readPageMetrics(paper: HTMLElement): PageMetrics {
  const styles = getComputedStyle(paper);
  const pageHeight = parseCssLengthToPx(styles.getPropertyValue('--page-height'), paper);
  const pageGap = parseCssLengthToPx(styles.getPropertyValue('--page-gap'), paper) || 16;
  const marginTop = parseCssLengthToPx(styles.getPropertyValue('--page-margin-top'), paper);
  const marginBottom = parseCssLengthToPx(styles.getPropertyValue('--page-margin-bottom'), paper);
  const pageContentHeight = Math.max(1, pageHeight - marginTop - marginBottom);
  const interPageSpacing = marginBottom + pageGap + marginTop;

  return {
    pageHeight,
    pageContentHeight,
    pageGap,
    marginTop,
    marginBottom,
    interPageSpacing,
    fragmentainerHeight: pdfFragmentainerHeight(pageContentHeight),
  };
}

export function getTopLevelBlockPos(
  doc: { childCount: number; child: (i: number) => { nodeSize: number } },
  index: number
): number {
  let pos = 1;
  for (let i = 0; i < index; i++) {
    pos += doc.child(i).nodeSize;
  }
  return pos;
}

export function dedupeGapTargets(targets: PageGapTarget[]): PageGapTarget[] {
  const seen = new Set<string>();
  const result: PageGapTarget[] = [];

  for (const target of targets.sort((a, b) => a.docPos - b.docPos)) {
    const key = `${target.kind}:${target.docPos}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(target);
  }

  return result;
}

export function findTableRowNodeRange(
  doc: {
    resolve: (pos: number) => {
      depth: number;
      before: (d: number) => number;
      node: (d: number) => { type: { name: string }; nodeSize: number };
    };
  },
  rowPos: number
): { from: number; to: number } | null {
  const $pos = doc.resolve(rowPos);

  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'tableRow') {
      const from = $pos.before(depth);
      return { from, to: from + node.nodeSize };
    }
  }

  return null;
}

export function gapTargetsEqual(a: PageGapTarget[], b: PageGapTarget[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (target, index) =>
      target.docPos === b[index]?.docPos &&
      target.kind === b[index]?.kind &&
      Math.abs(target.height - (b[index]?.height ?? 0)) < 0.5
  );
}

/** ProseMirror köküne göre eleman konumunu ölçer */
export function measureElementLayout(
  element: HTMLElement,
  editorRoot: HTMLElement
): { offsetTop: number; height: number } {
  const rootRect = editorRoot.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    offsetTop: rect.top - rootRect.top + editorRoot.scrollTop,
    height: Math.max(element.offsetHeight, rect.height),
  };
}
