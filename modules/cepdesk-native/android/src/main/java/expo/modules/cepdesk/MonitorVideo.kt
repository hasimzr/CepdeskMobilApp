package expo.modules.cepdesk

import android.graphics.SurfaceTexture
import android.media.MediaCodec
import android.media.MediaCodecList
import android.media.MediaFormat
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.view.Surface
import org.json.JSONObject
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** All codec operations run on one worker; video pixels never cross the JS bridge. */
internal object MonitorVideo {
  private data class Packet(
    val stream: String, val videoId: Long, val frameId: Long, val key: Boolean,
    val width: Int, val height: Int, val bytes: ByteArray, val offset: Int,
    val meta: Map<String, Any>, val emit: (Map<String, Any>) -> Unit, val generation: Int
  )
  private val thread = HandlerThread("CepDesk-video").apply { start() }
  private val worker = Handler(thread.looper)
  private val main = Handler(Looper.getMainLooper())
  private val scheduled = AtomicBoolean(false)
  private val generation = AtomicInteger(0)
  private val queue = VideoQueue<Packet>()
  @Volatile private var activeStream = ""
  private var owner: Any? = null
  private var surface: Surface? = null
  private var surfaceStream = ""
  private var codec: MediaCodec? = null
  private var codecStream = ""
  private var codecVideoId = -1L
  private var lastInput = -1L
  private val rendered = LinkedHashMap<Long, Packet>()
  private val info = MediaCodec.BufferInfo()

  fun isVideo(stream: String) = stream.isNotEmpty() && activeStream == stream

  fun attach(view: Any, stream: String, target: Surface) {
    worker.post {
      val replacing = surface != null || codec != null
      releaseCodec(); surface?.release()
      if (replacing) queue.reset()
      owner = view; surface = target; surfaceStream = stream
      schedule()
    }
  }

  fun detach(view: Any, texture: SurfaceTexture? = null) {
    worker.post {
      if (owner === view) {
        releaseCodec(); surface?.release(); surface = null; owner = null; queue.reset()
      }
      // TextureView transfers ownership here so it cannot disappear during decode.
      texture?.release()
    }
  }

  fun clear(stream: String? = null) {
    if (stream != null && activeStream != stream) return
    generation.incrementAndGet(); activeStream = ""; queue.reset()
    worker.post { releaseCodec() }
    main.post { MonitorFrames.notifyUpdated() }
  }

  fun accept(bytes: ByteArray, emit: (Map<String, Any>) -> Unit): Boolean {
    if (bytes.size < 8 || !bytes.copyOfRange(0, 4).contentEquals(byteArrayOf(67, 68, 86, 49))) return false
    // Recognized malformed video must never be forwarded to the PCM audio player.
    if (bytes.size > 2 * 1024 * 1024 + 8192) return true
    try {
      val length = ((bytes[4].toInt() and 255) shl 24) or ((bytes[5].toInt() and 255) shl 16) or
        ((bytes[6].toInt() and 255) shl 8) or (bytes[7].toInt() and 255)
      if (length !in 2..8192 || 8 + length >= bytes.size) return true
      val json = JSONObject(String(bytes, 8, length, Charsets.UTF_8))
      val stream = json.getString("stream_id")
      val width = json.getInt("width"); val height = json.getInt("height")
      val videoId = json.getLong("video_id"); val frameId = json.getLong("frame_id")
      if (stream.length !in 1..100 || json.getString("codec") != "h264" ||
        width !in 2..1920 || height !in 2..1920 || width % 2 != 0 || height % 2 != 0 ||
        videoId < 1 || frameId < 1) return true
      val meta = json.keys().asSequence().associateWith { json.get(it) }
      val packet = Packet(stream, videoId, frameId, json.getBoolean("keyframe"), width, height,
        bytes, 8 + length, meta, emit, generation.get())
      if (activeStream != stream) {
        activeStream = stream
        main.post { MonitorFrames.notifyUpdated() }
      }
      queue.offer(packet, stream, videoId, frameId, packet.key)
      schedule()
    } catch (_: Exception) { /* Keep the last rendered image on malformed input. */ }
    return true
  }

  private fun schedule() {
    if (scheduled.compareAndSet(false, true)) worker.post(pump)
  }

  private val pump = object : Runnable {
    override fun run() {
      try {
        drain()
        val packet = queue.peek()
        if (packet != null && surface != null) {
          if (packet.generation != generation.get() || packet.stream != surfaceStream) {
            queue.remove(packet)
          } else {
            if (codec == null || codecStream != packet.stream || codecVideoId != packet.videoId ||
              (lastInput >= 0 && packet.frameId != lastInput + 1)) {
              releaseCodec()
              if (packet.key) configure(packet) else queue.remove(packet)
            }
            val decoder = codec
            if (decoder != null && queue.peek() === packet) {
              val index = decoder.dequeueInputBuffer(0)
              if (index >= 0) {
                val buffer = decoder.getInputBuffer(index) ?: error("Video tamponu alınamadı.")
                val size = packet.bytes.size - packet.offset
                if (buffer.capacity() < size) error("Video karesi çözme tamponundan büyük.")
                // The receive thread may have reset the queue while we acquired a buffer.
                if (queue.remove(packet)) {
                  buffer.clear(); buffer.put(packet.bytes, packet.offset, size)
                  val pts = packet.frameId * 33_333L
                  rendered[pts] = packet
                  while (rendered.size > 16) rendered.remove(rendered.keys.first())
                  decoder.queueInputBuffer(index, 0, size, pts, 0)
                  lastInput = packet.frameId
                } else {
                  decoder.queueInputBuffer(index, 0, 0, 0, 0)
                }
              }
            }
          }
        }
        drain()
      } catch (error: Exception) {
        val packet = queue.peek() ?: rendered.values.lastOrNull()
        releaseCodec(); queue.reset()
        if (packet != null) main.post {
          if (generation.get() == packet.generation && activeStream == packet.stream)
            packet.emit(packet.meta + ("error" to "Video çözülemedi: ${error.message ?: "codec hatası"}"))
        }
      }
      scheduled.set(false)
      if (surface != null && (codec != null || queue.peek() != null) && scheduled.compareAndSet(false, true))
        worker.postDelayed(this, 5)
    }
  }

  private fun configure(packet: Packet) {
    val (sps, pps) = H264Config.parameterSets(packet.bytes, packet.offset)
    val format = MediaFormat.createVideoFormat("video/avc", packet.width, packet.height).apply {
      setByteBuffer("csd-0", ByteBuffer.wrap(sps))
      setByteBuffer("csd-1", ByteBuffer.wrap(pps))
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 2 * 1024 * 1024)
      setInteger(MediaFormat.KEY_PRIORITY, 0)
      if (Build.VERSION.SDK_INT >= 30) setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
    }
    val candidates = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.filter {
      !it.isEncoder && it.supportedTypes.any { type -> type.equals("video/avc", true) } &&
        runCatching { it.getCapabilitiesForType("video/avc").isFormatSupported(format) }.getOrDefault(false)
    }.sortedBy {
      val hardware = if (Build.VERSION.SDK_INT >= 29) it.isHardwareAccelerated
        else !it.name.startsWith("OMX.google.") && !it.name.startsWith("c2.android.")
      if (hardware) 0 else 1
    }
    var failure: Exception? = null
    for (candidate in candidates) {
      var decoder: MediaCodec? = null
      try {
        decoder = MediaCodec.createByCodecName(candidate.name)
        decoder.configure(format, surface, null, 0)
        decoder.setOnFrameRenderedListener({ current, pts, _ ->
          if (codec === current) {
            val frame = rendered.remove(pts)
            if (frame != null) main.post {
              if (generation.get() == frame.generation && activeStream == frame.stream)
                frame.emit(frame.meta)
            }
          }
        }, worker)
        decoder.start()
        codec = decoder; codecStream = packet.stream; codecVideoId = packet.videoId
        return
      } catch (e: Exception) { failure = e; runCatching { decoder?.release() } }
    }
    throw failure ?: IllegalStateException("Cihazda uygun H.264 çözücüsü bulunamadı.")
  }

  private fun drain() {
    val decoder = codec ?: return
    repeat(16) {
      val index = decoder.dequeueOutputBuffer(info, 0)
      if (index >= 0) decoder.releaseOutputBuffer(index, info.size > 0)
      else if (index != MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) return
    }
  }

  private fun releaseCodec() {
    val decoder = codec; codec = null
    runCatching { decoder?.stop() }; runCatching { decoder?.release() }
    codecStream = ""; codecVideoId = -1; lastInput = -1; rendered.clear()
  }
}
