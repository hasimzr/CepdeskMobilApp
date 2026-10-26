package expo.modules.cepdesk

import org.junit.Assert.*
import org.junit.Test

class H264ConfigTest {
  @Test fun extractsBothStartCodeLengthsAfterPacketMetadata() {
    val sps = byteArrayOf(0, 0, 0, 1, 103, 66, 0, 30)
    val pps = byteArrayOf(0, 0, 1, 104, 12, 34)
    val bytes = byteArrayOf(67, 68, 86, 49) + byteArrayOf(0, 0, 1, 9, 16) + sps + pps +
      byteArrayOf(0, 0, 0, 1, 101, 33, 44)
    val result = H264Config.parameterSets(bytes, 4)
    assertArrayEquals(sps, result.first)
    assertArrayEquals(pps, result.second)
  }

  @Test(expected = IllegalStateException::class)
  fun refusesToConfigureFromAPredictiveFrame() {
    H264Config.parameterSets(byteArrayOf(0, 0, 0, 1, 65, 20, 30), 0)
  }
}
