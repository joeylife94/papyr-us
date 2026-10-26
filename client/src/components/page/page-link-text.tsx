import { Fragment } from 'react';
import { splitPageLinks } from '@shared/page-links';
import { PageLinkChip } from './page-link-chip';

/** Plain text with its page link tokens shown as chips (#103 E6). */
export function PageLinkText({ text, focusable = true }: { text: string; focusable?: boolean }) {
  return (
    <>
      {splitPageLinks(text).map((segment, index) =>
        segment.type === 'text' ? (
          <Fragment key={index}>{segment.text}</Fragment>
        ) : (
          <PageLinkChip key={index} pageId={segment.pageId} focusable={focusable} />
        )
      )}
    </>
  );
}
