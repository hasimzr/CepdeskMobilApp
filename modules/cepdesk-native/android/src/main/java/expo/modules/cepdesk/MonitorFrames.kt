package expo.modules.cepdesk

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** One latest packet and one decoded frame: slow decoding drops old packets, never grows a queue. */
internal object MonitorFrames {
  data class Frame(val stream: String, val bitmap: Bitmap)
  private data class Packet(val generation: Int, val bytes: ByteArray, val emit: (Map<String,Any>) -> Unit)
  @Volatile var frame: Frame? = null
    private set
  private data class Decoded(val generation: Int, val frame: Frame, val meta: Map<String,Any>, val emit: (Map<String,Any>) -> Unit)
  private val decoded = AtomicReference<Decoded?>(null)
  private val publishing = AtomicBoolean(false)
  private val main = Handler(Looper.getMainLooper())
  private val executor = Executors.newSingleThreadExecutor()
  private val pending = AtomicReference<Packet?>(null)
  private val running = AtomicBoolean(false)
  private val generation = AtomicInteger(0)
  private val listeners = CopyOnWriteArraySet<() -> Unit>()
  fun notifyUpdated() { listeners.forEach { it() } }
  fun subscribe(listener: () -> Unit) { listeners.add(listener) }
  fun unsubscribe(listener: () -> Unit) { listeners.remove(listener) }
  fun clear(stream: String? = null) {
    MonitorVideo.clear(stream)
    if (stream != null && frame?.stream != stream) return
    generation.incrementAndGet(); pending.set(null); decoded.set(null); frame = null
    main.post { listeners.forEach { it() } }
  }
  fun accept(bytes: ByteArray, emit: (Map<String,Any>) -> Unit): Boolean {
    if (MonitorVideo.accept(bytes, emit)) return true
    if (bytes.size < 8 || bytes[0] != 67.toByte() || bytes[1] != 68.toByte() || bytes[2] != 77.toByte() || bytes[3] != 50.toByte()) return false
    if (bytes.size > 2 * 1024 * 1024 + 8192) return true
    pending.set(Packet(generation.get(),bytes,emit)); schedule(); return true
  }
  private fun schedule() {
    if (!running.compareAndSet(false,true)) return
    executor.execute {
      try {
        while (true) {
          val packet = pending.getAndSet(null) ?: break
          try { decode(packet) } catch (_: Exception) { /* Keep the last good bitmap visible. */ }
        }
      } finally {
        running.set(false)
        if (pending.get() != null) schedule()
      }
    }
  }
  private fun decode(packet: Packet) {
    val bytes = packet.bytes
    val length = ((bytes[4].toInt() and 255) shl 24) or ((bytes[5].toInt() and 255) shl 16) or ((bytes[6].toInt() and 255) shl 8) or (bytes[7].toInt() and 255)
    if (length !in 2..8192 || 8 + length + 2 > bytes.size) return
    val meta = JSONObject(String(bytes,8,length,Charsets.UTF_8))
    val stream = meta.getString("stream_id"); if (stream.length !in 1..100) return
    val offset = 8 + length
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes,offset,bytes.size-offset,bounds)
    if (bounds.outWidth !in 1..4096 || bounds.outHeight !in 1..4096 || bounds.outWidth.toLong()*bounds.outHeight > 8_000_000) return
    val bitmap = BitmapFactory.decodeByteArray(bytes,offset,bytes.size-offset) ?: return
    val details = mapOf("stream_id" to stream,"frame_id" to meta.getLong("frame_id"),"width" to bitmap.width,"height" to bitmap.height,"title" to meta.optString("title"),"mode" to meta.getString("mode"),"touch" to meta.optBoolean("touch"),"target_fps" to meta.optInt("target_fps",60),"source_id" to meta.optLong("source_id",1),"capture_fps" to meta.optInt("capture_fps",0),"encode_ms" to meta.optInt("encode_ms",0))
    decoded.set(Decoded(packet.generation,Frame(stream,bitmap),details,packet.emit)); publish()
  }
  private fun publish() {
    if (!publishing.compareAndSet(false,true)) return
    main.post {
      val next = decoded.getAndSet(null)
      if (next != null && generation.get() == next.generation) {
        frame = next.frame
        listeners.forEach { it() }
        next.emit(next.meta)
      }
      publishing.set(false)
      if (decoded.get() != null) publish()
    }
  }
}
