package expo.modules.cepdesk
import org.junit.Assert.*
import org.junit.Test
class CanvasPagerMathTest {
  @Test fun draggingTracksTheFingerOneToOneBetweenPages() {
    assertEquals(-460f, CanvasPagerMath.translation(-360f,-100f,360f,4),0.001f)
    assertEquals(-240f, CanvasPagerMath.translation(-360f,120f,360f,4),0.001f)
  }
  @Test fun edgesResistOverscroll() {
    assertEquals(22f,CanvasPagerMath.translation(0f,100f,360f,3),0.001f)
    assertEquals(-742f,CanvasPagerMath.translation(-720f,-100f,360f,3),0.001f)
  }
  @Test fun releasesSettleByDistanceOrVelocityWithoutSkippingPages() {
    assertEquals(2,CanvasPagerMath.target(-470f,1,-110f,0f,360f,4))
    assertEquals(1,CanvasPagerMath.target(-390f,1,-30f,0f,360f,4))
    assertEquals(2,CanvasPagerMath.target(-390f,1,-30f,-600f,360f,4))
    assertEquals(2,CanvasPagerMath.target(-1000f,1,-640f,-1000f,360f,4))
    assertEquals(0,CanvasPagerMath.target(100f,0,100f,1000f,360f,4))
  }
  @Test fun pinchAndVerticalMotionCannotChangePages() {
    assertTrue(CanvasPagerMath.validMovement(-90f,-100f,4f,6f,360f))
    assertFalse(CanvasPagerMath.validMovement(-90f,100f,0f,0f,360f))
    assertFalse(CanvasPagerMath.validMovement(5f,6f,80f,70f,360f))
  }
}
