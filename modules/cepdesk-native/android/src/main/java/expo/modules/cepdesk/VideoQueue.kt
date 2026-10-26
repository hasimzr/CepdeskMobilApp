package expo.modules.cepdesk

/** Dropping a predictive frame also invalidates its successors, until the next IDR. */
internal class VideoQueue<T>(private val limit: Int = 4) {
  private val packets = ArrayDeque<T>()
  private var stream = ""
  private var videoId = -1L
  private var lastFrame = -1L
  private var needsKey = true

  @Synchronized fun reset() {
    packets.clear(); stream = ""; videoId = -1; lastFrame = -1; needsKey = true
  }

  @Synchronized fun offer(value: T, streamId: String, encoderId: Long, frameId: Long, key: Boolean): Boolean {
    if (stream != streamId || videoId != encoderId || (lastFrame >= 0 && frameId != lastFrame + 1)) {
      packets.clear(); needsKey = true
    }
    stream = streamId; videoId = encoderId; lastFrame = frameId
    if (packets.size >= limit) { packets.clear(); needsKey = true }
    if (needsKey && !key) return false
    needsKey = false; packets.addLast(value); return true
  }

  @Synchronized fun peek(): T? = packets.firstOrNull()
  @Synchronized fun remove(value: T): Boolean {
    if (packets.firstOrNull() !== value) return false
    packets.removeFirst(); return true
  }
}
