package expo.modules.cepdesk

import android.content.Context
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewGroup
import android.graphics.Rect
import android.view.animation.DecelerateInterpolator
import com.facebook.react.uimanager.events.NativeGestureUtil
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import expo.modules.kotlin.viewevent.EventDispatcher
import kotlin.math.abs
import kotlin.math.roundToInt

/** React children stay mounted in a horizontal strip. Motion/settling runs on
 * Android's UI thread, without JS per-frame updates or page replacement. */
class CanvasPagerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  val onPageSelected by EventDispatcher()
  val onInputTouch by EventDispatcher()
  private var inputGesture = false
  private val inputTouches = InputTouchTracker { onInputTouch(it) }
  private fun inputTarget(view: View, x: Int, y: Int): InputTouchTracker.Target? {
    if (view.visibility != View.VISIBLE || !view.isShown) return null
    val bounds = Rect()
    if (!view.getGlobalVisibleRect(bounds) || !bounds.contains(x,y)) return null
    if (view is ViewGroup) for (index in view.childCount - 1 downTo 0) inputTarget(view.getChildAt(index),x,y)?.let { return it }
    val id = view.getTag(com.facebook.react.R.id.view_tag_native_id) as? String ?: return null
    val parts = id.split(":")
    return when (parts.firstOrNull()) {
      "cepdesk-key" -> if (parts.size == 3) parts[2].toIntOrNull()?.let { InputTouchTracker.Target(parts[1],it) } else null
      "cepdesk-monitor" -> if (parts.size == 2) {
        val location = IntArray(2); val origin = IntArray(2)
        view.getLocationOnScreen(location); getLocationOnScreen(origin)
        InputTouchTracker.Target(parts[1],monitor=true,left=(location[0]-origin[0]).toFloat(),top=(location[1]-origin[1]).toFloat(),width=view.width.coerceAtLeast(1).toFloat(),height=view.height.coerceAtLeast(1).toFloat())
      } else null
      "cepdesk-pad" -> if (parts.size == 2) InputTouchTracker.Target(parts[1],pad=true) else null
      "cepdesk-surface" -> if (parts.size == 2) InputTouchTracker.Target(parts[1]) else null
      else -> null
    }
  }
  private fun target(event: MotionEvent, index: Int): InputTouchTracker.Target? {
    val origin = IntArray(2); getLocationOnScreen(origin)
    val rootOrigin = IntArray(2); rootView.getLocationOnScreen(rootOrigin)
    return inputTarget(this,(origin[0]-rootOrigin[0]+event.getX(index)).toInt(),(origin[1]-rootOrigin[1]+event.getY(index)).toInt())
  }
  private var count = 1
  private var desired = 0
  private var lastPropPage = -1
  private var current = 0
  private var generation = 0
  private var intercepting = false
  private var dragging = false
  private var cancelled = false
  private var pointerA = -1; private var pointerB = -1
  private var ax = 0f; private var bx = 0f; private var ay = 0f; private var by = 0f
  private var base = 0f; private var delta = 0f; private var startPage = 0
  private var tracker: VelocityTracker? = null
  var pagingEnabled = true
  init { clipChildren = true; clipToPadding = true }
  private val strip: View? get() = if (childCount > 0) getChildAt(0) else null
  fun setPage(value: Int) {
    if (lastPropPage == value) return
    lastPropPage = value; desired = value
    post { if (!dragging) settle(desired, true) }
  }
  fun setCount(value: Int) {
    val next = value.coerceAtLeast(1); if (next == count) return
    count = next; desired = desired.coerceIn(0,count - 1)
    post { if (!dragging && current >= count) settle(desired, false) }
  }
  override fun onViewAdded(child: View) { super.onViewAdded(child); post { settle(desired, false) } }
  // Child bounds are calculated by React Native/Yoga, not LinearLayout.
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) { }
  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) { super.onSizeChanged(w,h,oldw,oldh); if (w > 0 && w != oldw) post { settle(desired,false) } }
  private fun settle(target: Int, animated: Boolean) {
    val view = strip ?: return; if (width <= 0) return
    val index = target.coerceIn(0,count - 1); desired = index
    val epoch = ++generation; view.animate().cancel()
    val finish = {
      if (generation == epoch) { current = index; view.translationX = -index * width.toFloat(); onPageSelected(mapOf("index" to index)) }
    }
    if (!animated || abs(view.translationX + index * width) < 1) { finish(); return }
    view.animate().translationX(-index * width.toFloat()).setDuration(210).setInterpolator(DecelerateInterpolator(1.5f)).withEndAction(finish).start()
  }
  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    val action = event.actionMasked
    if (action == MotionEvent.ACTION_DOWN) { inputTouches.cancel(event.eventTime); inputGesture = false }
    val starting = action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_POINTER_DOWN
    val hit = if (starting) target(event,event.actionIndex) else null
    if (!inputGesture && hit != null && !intercepting) {
      // Cancel an earlier outside touch before taking over the whole pointer stream.
      if (action != MotionEvent.ACTION_DOWN) {
        val cancel = MotionEvent.obtain(event); cancel.action = MotionEvent.ACTION_CANCEL
        super.dispatchTouchEvent(cancel); cancel.recycle()
      }
      inputGesture = true
    }
    if (inputGesture) {
      parent?.requestDisallowInterceptTouchEvent(true)
      when (action) {
        MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> if (hit != null) inputTouches.down(event.getPointerId(event.actionIndex),hit,event.getX(event.actionIndex),event.getY(event.actionIndex),event.eventTime)
        MotionEvent.ACTION_MOVE -> inputTouches.move((0 until event.pointerCount).associate { event.getPointerId(it) to Pair(event.getX(it),event.getY(it)) },event.eventTime)
        MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> inputTouches.up(event.getPointerId(event.actionIndex),event.eventTime)
        MotionEvent.ACTION_CANCEL -> inputTouches.cancel(event.eventTime)
      }
      if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) { inputGesture = false; parent?.requestDisallowInterceptTouchEvent(false) }
      return true
    }
    if (pagingEnabled && (event.pointerCount == 2 || intercepting)) {
      requestDisallowInterceptTouchEvent(false)
    }
    return super.dispatchTouchEvent(event)
  }
  override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
    if (!pagingEnabled) return false
    if (intercepting) return true
    if (event.pointerCount != 2 || event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) return false
    generation++; strip?.animate()?.cancel()
    pointerA = event.getPointerId(0); pointerB = event.getPointerId(1)
    ax = event.getX(0); bx = event.getX(1); ay = event.getY(0); by = event.getY(1)
    base = strip?.translationX ?: -current * width.toFloat(); delta = 0f
    startPage = if (width > 0) (-base / width).roundToInt().coerceIn(0,count - 1) else current
    tracker?.recycle(); tracker = VelocityTracker.obtain(); tracker?.addMovement(event)
    cancelled = false; dragging = true; intercepting = true
    parent?.requestDisallowInterceptTouchEvent(true)
    NativeGestureUtil.notifyNativeGestureStarted(this,event)
    return true
  }
  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!intercepting) return super.onTouchEvent(event)
    tracker?.addMovement(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_POINTER_DOWN -> if (event.pointerCount > 2) cancelled = true
      MotionEvent.ACTION_MOVE -> if (dragging && !cancelled) {
        val a = event.findPointerIndex(pointerA); val b = event.findPointerIndex(pointerB)
        if (a < 0 || b < 0 || event.pointerCount != 2) cancelled = true
        else {
          val adx = event.getX(a) - ax; val bdx = event.getX(b) - bx
          if (!CanvasPagerMath.validMovement(adx,bdx,event.getY(a)-ay,event.getY(b)-by,width.toFloat())) cancelled = true
          else { delta = (adx + bdx) / 2; strip?.translationX = CanvasPagerMath.translation(base,delta,width.toFloat(),count) }
        }
      }
      MotionEvent.ACTION_POINTER_UP -> if (dragging) finishDrag(false)
      MotionEvent.ACTION_UP -> { if (dragging) finishDrag(false); releaseGesture(event) }
      MotionEvent.ACTION_CANCEL -> { if (dragging) finishDrag(true); releaseGesture(event) }
    }
    return true
  }
  private fun finishDrag(cancel: Boolean) {
    dragging = false
    tracker?.computeCurrentVelocity(1000)
    val velocity = ((tracker?.getXVelocity(pointerA) ?: 0f) + (tracker?.getXVelocity(pointerB) ?: 0f)) / 2
    val target = if (cancel || cancelled) startPage else CanvasPagerMath.target(strip?.translationX ?: base,startPage,delta,velocity,width.toFloat(),count)
    settle(target,true)
  }
  private fun releaseGesture(event: MotionEvent) {
    intercepting = false; tracker?.recycle(); tracker = null
    parent?.requestDisallowInterceptTouchEvent(false)
    NativeGestureUtil.notifyNativeGestureEnded(this,event)
  }
  override fun onDetachedFromWindow() { inputTouches.cancel(android.os.SystemClock.uptimeMillis()); inputGesture = false; generation++; strip?.animate()?.cancel(); tracker?.recycle(); tracker = null; super.onDetachedFromWindow() }
}
