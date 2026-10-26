package expo.modules.cepdesk

import kotlin.math.abs
import kotlin.math.roundToInt
object CanvasPagerMath {
  fun translation(start: Float, delta: Float, width: Float, count: Int): Float {
    val minimum = -(count.coerceAtLeast(1) - 1) * width
    val value = start + delta
    return when { value > 0 -> value * 0.22f; value < minimum -> minimum + (value - minimum) * 0.22f; else -> value }
  }
  fun target(position: Float, start: Int, delta: Float, velocity: Float, width: Float, count: Int): Int {
    if (width <= 0 || count <= 1) return 0
    val direction = when { abs(delta) > width * 0.18f -> if (delta < 0) 1 else -1; abs(velocity) > width * 1.15f && abs(delta) > width * 0.03f -> if (velocity < 0) 1 else -1; else -> 0 }
    val nearest = (-position / width).roundToInt()
    return (if (direction != 0) start + direction else nearest).coerceIn((start - 1).coerceAtLeast(0), (start + 1).coerceAtMost(count - 1)).coerceIn(0,count - 1)
  }
  fun validMovement(ax: Float, bx: Float, ay: Float, by: Float, width: Float): Boolean {
    val dx = (ax + bx) / 2; val dy = (ay + by) / 2
    if (abs(dy) > width * 0.04f && abs(dy) > abs(dx) * 1.25f) return false
    if (ax * bx < 0 && abs(ax) > width * 0.025f && abs(bx) > width * 0.025f) return false
    return abs(ax - bx) <= width * 0.28f
  }
}
