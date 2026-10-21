import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface Props {
  tex: string;
  /** Render as a centred display equation (default) or inline. */
  inline?: boolean;
  className?: string;
}

/** KaTeX wrapper. Falls back to the raw TeX source if parsing fails. */
export default function Equation({ tex, inline = false, className = '' }: Props) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        displayMode: !inline,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
      }),
    [tex, inline],
  );
  const Tag = inline ? 'span' : 'div';
  return <Tag className={[inline ? '' : 'text-ink', className].join(' ')} dangerouslySetInnerHTML={{ __html: html }} />;
}
