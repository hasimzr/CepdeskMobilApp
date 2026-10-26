package expo.modules.cepdesk

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/** Bounded PCM queue avoids accumulating latency on a slow phone/network. */
class PhoneAudioPlayer(private val onError: () -> Unit) {
  @Volatile private var running = false
  private var track: AudioTrack? = null
  private var worker: Thread? = null
  private val queue = ArrayBlockingQueue<ByteArray>(8)
  @Synchronized fun start() {
    stop()
    val minimum = AudioTrack.getMinBufferSize(24000, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT)
    check(minimum > 0) { "Telefon bu ses biçimini desteklemiyor." }
    val output = AudioTrack.Builder().setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
      .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(24000).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).build())
      .setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(maxOf(minimum * 2, 7680)).build()
    if (output.state != AudioTrack.STATE_INITIALIZED) { output.release(); error("Telefon ses çıkışı açılamadı.") }
    track = output; running = true; output.play()
    worker = Thread({
      try {
        while (running && !Thread.currentThread().isInterrupted) {
          val bytes = queue.poll(100, TimeUnit.MILLISECONDS) ?: continue
          var offset = 0
          while (running && offset < bytes.size) { val n = output.write(bytes, offset, bytes.size - offset); if (n <= 0) { if (running) { running = false; onError() }; break }; offset += n }
        }
      } catch (_: InterruptedException) { } catch (_: Exception) { if (running) { running = false; onError() } }
    }, "CepDesk-phone-audio").apply { start() }
  }
  fun enqueue(bytes: ByteArray) {
    if (!running || bytes.isEmpty() || bytes.size > 8192 || bytes.size % 4 != 0) return
    if (!queue.offer(bytes)) { queue.poll(); queue.offer(bytes) }
  }
  @Synchronized fun stop() {
    running = false
    val output = track
    try { output?.pause(); output?.flush(); output?.stop() } catch (_: Exception) { }
    worker?.interrupt(); try { worker?.join(500) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
    worker = null; queue.clear(); output?.release(); track = null
  }
}
