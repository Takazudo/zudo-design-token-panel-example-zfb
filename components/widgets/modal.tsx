"use client";

/**
 * ModalDemo — button-triggered native <dialog> with open/close animation.
 *
 * Plain CSS mirror of zfb-tailwind/components/widgets/modal.tsx.
 *
 * DEMO-GRADE ONLY. This component deliberately omits:
 *   - Focus trap / tabindex cycling
 *   - Scroll lock
 *   - Focus restoration on close
 *   - ARIA live-region announcements
 * It uses `inert` on the page's <main> element to prevent interaction with
 * background content while open. The native <dialog>.showModal() call
 * hoists the element to the top layer, so it is NOT affected by <main inert>.
 *
 * Token consumption (via global.css .zfb-modal* classes):
 *   .zfb-modal__trigger → color-primary (bg), bg (text), spacing-sm, radius
 *   .zfb-modal          → color-surface (bg), fg (text), spacing-lg (padding), radius
 *                                easing-modal (open/close transition)
 *   .zfb-modal::backdrop → color-mix overlay (G4 row 6)
 *
 * Open/close animation rules live in global.css — no scoped <style> needed.
 */

import { getScope, signal, type Ref } from '@takazudo/zfb/zudo-react';
import { Island } from '@takazudo/zfb';

export function ModalInner() {
  const scope = getScope();
  const isOpen = signal(false);
  const dialogRef: Ref<HTMLDialogElement> = { current: null };
  scope.effect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen.value) return;
    const main = document.querySelector('main');
    const wasInert = main?.inert ?? false;
    dialog.showModal();
    if (main) main.inert = true;
    return () => {
      dialog.close();
      if (main) main.inert = wasInert;
    };
  });
  scope.onActivate(() => {
    const dialog = dialogRef.current!;
    const cancel = (event: Event) => { event.preventDefault(); isOpen.value = false; };
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') isOpen.value = false; };
    dialog.addEventListener('cancel', cancel);
    document.addEventListener('keydown', keydown);
    return () => {
      dialog.removeEventListener('cancel', cancel);
      document.removeEventListener('keydown', keydown);
    };
  });

  return (
    <>
      <button
        type="button"
        class="zfb-modal__trigger"
        on:click={() => { isOpen.value = true; }}
      >
        Open Modal
      </button>

      {/* reason: dialog lives outside <main> in DOM order so inert on main
          does not block the dialog; showModal() moves it to the top layer */}
      <dialog ref={dialogRef} class="zfb-modal">
        <div class="zfb-modal__panel-inner">
          <div class="zfb-modal__header">
            <h2 class="zfb-section-h3">Modal Dialog</h2>
            <button
              type="button"
              class="zfb-modal__close"
              on:click={() => { isOpen.value = false; }}
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
          <p class="zfb-body-text">
            This modal opens via button click and closes via the close button or{' '}
            <kbd>Escape</kbd>.
          </p>
          <p class="zfb-muted-text">
            Open/close animation uses{' '}
            <code>easing-modal</code> →{' '}
            <code>--zfb-easing-modal</code>. Backdrop uses{' '}
            <code>color-mix(in srgb, var(--zfb-bg) 80%, transparent)</code>{' '}
            (reason: no overlay token in this wave).
          </p>
          <div>
            <button
              type="button"
              class="zfb-modal__trigger"
              on:click={() => { isOpen.value = false; }}
            >
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function ModalDemo() {
  return (
    <Island when="visible" ssrFallback={null}>
      <ModalInner />
    </Island>
  );
}
