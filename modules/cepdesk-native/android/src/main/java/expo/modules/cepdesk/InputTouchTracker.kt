package expo.modules.cepdesk

/** Each pointer keeps the control where it started until that pointer lifts. */
internal class InputTouchTracker(private val emit: (Map<String, Any>) -> Unit) {
  data class Target(val surface: String, val code: Int? = null, val pad: Boolean = false, val monitor: Boolean = false, val left: Float = 0f, val top: Float = 0f, val width: Float = 1f, val height: Float = 1f)
  private data class Finger(val target: Target, var x: Float, var y: Float)
  private data class Pad(var x: Float, var y: Float, var count: Int, var max: Int, var distance: Float, val start: Long, var dragged: Boolean)
  private val fingers = mutableMapOf<Int, Finger>()
  private val pads = mutableMapOf<String, Pad>()
  private fun key(surface: String, code: Int, down: Boolean) = emit(mapOf("surface" to surface, "action" to "key", "code" to code, "down" to down))
  fun down(id: Int, target: Target, x: Float, y: Float, time: Long) {
    if (fingers.containsKey(id)) return
    if (target.code != null && fingers.values.none { it.target.surface == target.surface && it.target.code == target.code }) key(target.surface, target.code, true)
    fingers[id] = Finger(target, x, y)
    if (target.code?.let { it in 272..274 } == true) pads.values.forEach { it.dragged = true }
    if (target.pad || target.monitor) sample(target.surface, time, false)
  }
  fun move(points: Map<Int, Pair<Float, Float>>, time: Long) {
    for ((id, point) in points) fingers[id]?.let { it.x = point.first; it.y = point.second }
    for (surface in pads.keys.toList()) sample(surface, time, true)
  }
  fun up(id: Int, time: Long, cancel: Boolean = false) {
    val finger = fingers.remove(id) ?: return
    val target = finger.target
    if (target.code != null && fingers.values.none { it.target.surface == target.surface && it.target.code == target.code }) key(target.surface, target.code, false)
    if (target.pad || target.monitor) {
      val remaining = fingers.values.count { it.target.surface == target.surface && (it.target.pad || it.target.monitor) }
      if (remaining > 0) sample(target.surface, time, false)
      else {
        val pad = pads.remove(target.surface)
        if (!cancel && pad != null && !pad.dragged && pad.max <= 2 && pad.distance < 10 && time - pad.start < 350) {
          if (target.monitor) {
            if (pad.max == 1) emit(mapOf("surface" to target.surface, "action" to "monitor.tap", "x" to ((finger.x-target.left)/target.width).coerceIn(0f,1f), "y" to ((finger.y-target.top)/target.height).coerceIn(0f,1f)))
          } else { val code = if (pad.max == 2) 273 else 272; key(target.surface, code, true); key(target.surface, code, false) }
        }
      }
    }
  }
  fun cancel(time: Long) { for (id in fingers.keys.toList()) up(id, time, true); pads.clear() }
  private fun sample(surface: String, time: Long, moving: Boolean) {
    val touches = fingers.values.filter { it.target.surface == surface && (it.target.pad || it.target.monitor) }
    if (touches.isEmpty()) return
    val x = touches.map { it.x }.average().toFloat(); val y = touches.map { it.y }.average().toFloat()
    val pad = pads[surface]
    if (pad == null) { pads[surface] = Pad(x,y,touches.size,touches.size,0f,time,fingers.values.any { it.target.code?.let { it in 272..274 } == true }); return }
    if (moving && pad.count == touches.size) {
      val dx = x - pad.x; val dy = y - pad.y
      pad.distance += kotlin.math.abs(dx) + kotlin.math.abs(dy)
      val target = touches.first().target
      if (target.monitor) {
        if (touches.size == 2) emit(mapOf("surface" to surface, "action" to "monitor.scroll", "x" to ((x-target.left)/target.width).coerceIn(0f,1f), "y" to ((y-target.top)/target.height).coerceIn(0f,1f), "dx" to dx, "dy" to dy))
      } else if (touches.size <= 2) emit(mapOf("surface" to surface, "action" to if (touches.size == 1) "move" else "scroll", "x" to dx, "y" to dy))
    }
    pad.x = x; pad.y = y; pad.count = touches.size; pad.max = maxOf(pad.max, touches.size)
  }
}
