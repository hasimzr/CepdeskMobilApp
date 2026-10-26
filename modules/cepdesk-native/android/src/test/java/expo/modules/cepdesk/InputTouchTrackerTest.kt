package expo.modules.cepdesk

import org.junit.Assert.*
import org.junit.Test

class InputTouchTrackerTest {
  @Test fun ctrlRemainsDownWhenSecondFingerTapsC() {
    val events = mutableListOf<Map<String,Any>>()
    val tracker = InputTouchTracker { events.add(it) }
    tracker.down(1,InputTouchTracker.Target("keyboard",29),0f,0f,0)
    tracker.down(2,InputTouchTracker.Target("keyboard",46),30f,0f,10)
    tracker.up(2,20); tracker.up(1,30)
    assertEquals(listOf(29,46,46,29),events.map { it["code"] })
    assertEquals(listOf(true,true,false,false),events.map { it["down"] })
  }
  @Test fun leftButtonAndPadAreIndependentAndReleaseDoesNotClickAgain() {
    val events = mutableListOf<Map<String,Any>>()
    val tracker = InputTouchTracker { events.add(it) }
    tracker.down(7,InputTouchTracker.Target("mouse",272),0f,100f,0)
    tracker.down(9,InputTouchTracker.Target("mouse",pad=true),10f,10f,5)
    tracker.move(mapOf(7 to Pair(0f,100f),9 to Pair(40f,30f)),10)
    tracker.up(9,20); tracker.up(7,30)
    assertEquals(listOf("key","move","key"),events.map { it["action"] })
    assertEquals(30f,events[1]["x"]); assertEquals(20f,events[1]["y"])
    assertEquals(false,events.last()["down"])
  }
  @Test fun cancelReleasesAllKeysAndTwoPadFingersScroll() {
    val events = mutableListOf<Map<String,Any>>()
    val tracker = InputTouchTracker { events.add(it) }
    tracker.down(1,InputTouchTracker.Target("keyboard",42),0f,0f,0)
    tracker.down(2,InputTouchTracker.Target("mouse",pad=true),10f,10f,5)
    tracker.down(3,InputTouchTracker.Target("mouse",pad=true),30f,10f,10)
    tracker.move(mapOf(2 to Pair(10f,40f),3 to Pair(30f,40f)),20)
    assertEquals("scroll",events.last()["action"])
    tracker.cancel(30)
    assertEquals(42,events.last()["code"]); assertEquals(false,events.last()["down"])
    assertEquals(3,events.size)
  }
  @Test fun monitorTapUsesImageCoordinatesAndTwoFingersNeverClick() {
    val events = mutableListOf<Map<String,Any>>()
    val tracker = InputTouchTracker { events.add(it) }
    val target = InputTouchTracker.Target("monitor",monitor=true,left=50f,top=25f,width=100f,height=100f)
    tracker.down(1,target,75f,50f,0); tracker.up(1,30)
    assertEquals("monitor.tap",events.single()["action"])
    assertEquals(.25f,events.single()["x"]); assertEquals(.25f,events.single()["y"])
    events.clear()
    tracker.down(2,target,75f,50f,50); tracker.down(3,target,100f,50f,60)
    tracker.move(mapOf(2 to Pair(75f,80f),3 to Pair(100f,80f)),70)
    tracker.up(2,80); tracker.up(3,90)
    assertEquals(listOf("monitor.scroll"),events.map { it["action"] })
    assertEquals(30f,events.single()["dy"])
  }
}
