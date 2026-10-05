/**
 * Prose demo page — /prose
 *
 * Renders the single "prose" content-collection entry (content/prose/index.mdx)
 * inside a `.zfb-prose` container so that the --zfb-* prose tokens
 * (vsp-*, hsp-*, text-*, leading-*, code-*) and the :where() flow-space rules
 * in styles/global.css apply to all markdown-generated HTML.
 *
 * `getCollection` is synchronous per zfb ADR-004. The prose collection
 * contains one static entry so we grab index 0; a missing entry renders
 * the existing empty-state message rather than crashing.
 *
 * Layout shell
 * ------------
 * The page is wrapped in `<AppShell>`, which renders the HTML document shell,
 * topbar (panel-open button), sidenav, and main content area.
 */

import { defaultComponents, getCollection } from '@takazudo/zfb/content';
import { AppShell } from '../components/app-shell';

const BASE_PATH = '/';

type ProseFrontmatter = {
  title?: string;
};

export default function ProsePage() {
  const ProseContent = getCollection<ProseFrontmatter>('prose')[0]?.Content;

  return (
    <AppShell
      title="Prose Demo — zfb Example"
      activePath={`${BASE_PATH}prose/`}
    >
      <div class="zfb-prose">
        {ProseContent ? (
          <ProseContent components={{ ...defaultComponents }} />
        ) : (
          <p>No prose content found.</p>
        )}
      </div>
    </AppShell>
  );
}
