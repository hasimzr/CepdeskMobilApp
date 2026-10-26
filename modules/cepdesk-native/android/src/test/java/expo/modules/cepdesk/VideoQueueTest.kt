package expo.modules.cepdesk

import org.junit.Assert.*
import org.junit.Test

class VideoQueueTest {
  @Test fun gapRequiresANewKeyframe() {
    val queue = VideoQueue<String>()
    assertFalse(queue.offer("p1", "a", 1, 1, false))
    assertTrue(queue.offer("i2", "a", 1, 2, true))
    assertTrue(queue.offer("p3", "a", 1, 3, false))
    assertFalse(queue.offer("p5", "a", 1, 5, false))
    assertNull(queue.peek())
    assertTrue(queue.offer("i6", "a", 1, 6, true))
    assertEquals("i6", queue.peek())
  }

  @Test fun overflowInvalidatesDependentFrames() {
    val queue = VideoQueue<String>(2)
    queue.offer("i1", "a", 1, 1, true)
    queue.offer("p2", "a", 1, 2, false)
    assertFalse(queue.offer("p3", "a", 1, 3, false))
    assertNull(queue.peek())
    assertFalse(queue.offer("p4", "a", 1, 4, false))
    assertTrue(queue.offer("i5", "a", 1, 5, true))
  }

  @Test fun sourceRestartAndSurfaceResetRequireIndependentFrames() {
    val queue = VideoQueue<String>()
    queue.offer("i1", "a", 1, 1, true)
    assertFalse(queue.offer("p2", "a", 2, 2, false))
    assertTrue(queue.offer("i3", "a", 2, 3, true))
    assertEquals("i3", queue.peek())
    queue.reset()
    assertFalse(queue.offer("p4", "a", 2, 4, false))
    assertTrue(queue.offer("i5", "b", 1, 1, true))
    assertEquals("i5", queue.peek())
  }

  @Test fun receivingANewKeyframeWhileDecodingDoesNotRemoveTheNewHead() {
    val queue = VideoQueue<Any>()
    val old = Any(); val replacement = Any()
    queue.offer(old, "a", 1, 1, true)
    queue.offer(replacement, "a", 1, 4, true)
    assertFalse(queue.remove(old))
    assertSame(replacement, queue.peek())
    assertTrue(queue.remove(replacement))
    assertNull(queue.peek())
  }
}
