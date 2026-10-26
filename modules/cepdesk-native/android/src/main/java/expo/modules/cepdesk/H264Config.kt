package expo.modules.cepdesk

/** Extract Annex-B parameter sets for Android's csd-0 / csd-1 decoder configuration. */
internal object H264Config {
  fun parameterSets(bytes: ByteArray, offset: Int): Pair<ByteArray, ByteArray> {
    var sps: ByteArray? = null
    var pps: ByteArray? = null
    var start = -1
    var payload = -1
    var i = offset
    fun collect(end: Int) {
      if (start < 0 || payload >= end) return
      when (bytes[payload].toInt() and 31) {
        7 -> sps = bytes.copyOfRange(start, end)
        8 -> pps = bytes.copyOfRange(start, end)
      }
    }
    while (i + 2 < bytes.size) {
      val prefix = when {
        i + 3 < bytes.size && bytes[i] == 0.toByte() && bytes[i + 1] == 0.toByte() &&
          bytes[i + 2] == 0.toByte() && bytes[i + 3] == 1.toByte() -> 4
        bytes[i] == 0.toByte() && bytes[i + 1] == 0.toByte() && bytes[i + 2] == 1.toByte() -> 3
        else -> 0
      }
      if (prefix > 0) { collect(i); start = i; payload = i + prefix; i += prefix }
      else i++
    }
    collect(bytes.size)
    return Pair(sps ?: error("H.264 SPS başlığı eksik."), pps ?: error("H.264 PPS başlığı eksik."))
  }
}
