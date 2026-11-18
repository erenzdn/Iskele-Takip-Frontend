import type { DocumentCategoryRef } from '../../models';

interface DocumentCategoryChipProps {
  category: Pick<DocumentCategoryRef, 'Name' | 'Color'>;
  onClick?: () => void;
  title?: string;
}

/** Renk noktası + ad; açık/koyu temada okunur kalsın diye metin rengi temadan gelir. */
export function DocumentCategoryChip({ category, onClick, title }: DocumentCategoryChipProps) {
  const className =
    'inline-flex items-center gap-1 max-w-[140px] rounded px-1.5 py-px text-[10px] leading-tight font-medium text-text-primary border';
  const style = { backgroundColor: `${category.Color}1f`, borderColor: `${category.Color}66` };
  const content = (
    <>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: category.Color }} />
      <span className="truncate">{category.Name}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={`${className} hover:brightness-125`}
        style={style}
        title={title ?? category.Name}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        {content}
      </button>
    );
  }
  return (
    <span className={className} style={style} title={title ?? category.Name}>
      {content}
    </span>
  );
}

interface DocumentCategoryChipsProps {
  categories?: DocumentCategoryRef[] | null;
  /** Chip'e tıklayınca (ör. o kategoriye göre filtrele) */
  onChipClick?: (category: DocumentCategoryRef) => void;
  emptyLabel?: string;
}

export default function DocumentCategoryChips({ categories, onChipClick, emptyLabel = '-' }: DocumentCategoryChipsProps) {
  if (!categories || categories.length === 0) {
    return <span className="text-text-secondary">{emptyLabel}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      {categories.map((category) => (
        <DocumentCategoryChip
          key={category.DocumentCategoryId}
          category={category}
          onClick={onChipClick ? () => onChipClick(category) : undefined}
          title={onChipClick ? `"${category.Name}" kategorisine göre filtrele` : undefined}
        />
      ))}
    </span>
  );
}
