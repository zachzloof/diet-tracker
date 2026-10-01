import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * How many px of the bottom of the layout viewport the on-screen keyboard covers. iOS lays
 * the keyboard over fixed elements without resizing the page, so a sheet pinned to the
 * bottom pads itself by this much to keep its content scrollable above the keys. Stays 0
 * where the browser or the native shell resizes the page instead.
 */
export function useKeyboardInset(): Ref<number> {
  const inset = ref(0)

  function update(): void {
    const viewport = window.visualViewport
    if (!viewport) return
    const covered = window.innerHeight - viewport.height - viewport.offsetTop
    // Small differences are browser chrome or pinch zoom, not a keyboard.
    inset.value = covered > 80 ? Math.round(covered) : 0
  }

  onMounted(() => {
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    update()
  })
  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', update)
    window.visualViewport?.removeEventListener('scroll', update)
  })

  return inset
}
