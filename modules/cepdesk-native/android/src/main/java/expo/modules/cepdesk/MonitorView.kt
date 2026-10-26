package expo.modules.cepdesk

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/** H.264 renders straight to a texture; legacy JPEG still uses the bitmap canvas. */
class MonitorView(context: Context, appContext: AppContext) : ExpoView(context,appContext) {
  override val shouldUseAndroidLayout = true
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
  private val destination = RectF()
  private var stream = ""
  private val texture = TextureView(context)
  private val updated: () -> Unit = {
    texture.visibility = if (MonitorVideo.isVideo(stream)) View.VISIBLE else View.GONE
    invalidate()
  }
  init {
    setWillNotDraw(false)
    texture.visibility = View.GONE
    texture.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
      override fun onSurfaceTextureAvailable(target: SurfaceTexture, width: Int, height: Int) { attachVideo(target) }
      override fun onSurfaceTextureSizeChanged(target: SurfaceTexture, width: Int, height: Int) {}
      override fun onSurfaceTextureUpdated(target: SurfaceTexture) {}
      override fun onSurfaceTextureDestroyed(target: SurfaceTexture): Boolean {
        MonitorVideo.detach(this@MonitorView, target)
        return false
      }
    }
    addView(texture, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }
  private fun attachVideo(target: SurfaceTexture) {
    if (isAttachedToWindow && stream.isNotEmpty()) MonitorVideo.attach(this, stream, Surface(target))
  }
  fun setStream(value: String) {
    if (stream == value) return
    MonitorVideo.detach(this)
    stream = value; updated()
    texture.surfaceTexture?.let { attachVideo(it) }
  }
  override fun onAttachedToWindow() {
    super.onAttachedToWindow(); MonitorFrames.subscribe(updated); updated()
    texture.surfaceTexture?.let { attachVideo(it) }
  }
  override fun onDetachedFromWindow() {
    MonitorFrames.unsubscribe(updated); MonitorVideo.detach(this); super.onDetachedFromWindow()
  }
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    texture.layout(0, 0, width, height)
  }
  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val frame = MonitorFrames.frame?.takeIf { it.stream == stream } ?: return
    val bitmap = frame.bitmap
    val scale = minOf(width.toFloat()/bitmap.width,height.toFloat()/bitmap.height)
    val w = bitmap.width*scale; val h = bitmap.height*scale
    destination.set((width-w)/2,(height-h)/2,(width+w)/2,(height+h)/2)
    canvas.drawBitmap(bitmap,null,destination,paint)
  }
}
