package expo.modules.cepdesk

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PasswordProofTest {
  private fun fixture(): JSONObject = JSONObject(javaClass.getResourceAsStream("/password-proof.json")!!.bufferedReader().use { it.readText() })
  @Test fun pbkdf2MatchesIndependentVectorsIncludingUtf8() {
    assertEquals("120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b", PasswordProof.hex(PasswordProof.derive("password", "salt".toByteArray(), 1)))
    assertEquals("ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43", PasswordProof.hex(PasswordProof.derive("password", "salt".toByteArray(), 2)))
    assertEquals("1cf86b3c8d8fa75a740f499959c506aea31e3b356e75c584bb4f9b1d99974151", PasswordProof.hex(PasswordProof.derive("Türkçe parola 123!", ByteArray(32), 600000)))
  }
  @Test fun verifiesServerAndReturnsExpectedClientProof() {
    val f = fixture()
    assertEquals(f.getString("clientProof"), PasswordProof.verify(f.getString("password"), f.getJSONObject("hello").toString(), f.getString("nonce"), f.getString("name"), "ab".repeat(32)))
  }
  @Test(expected = IllegalArgumentException::class) fun wrongPasswordCannotProduceClientProof() {
    val f = fixture()
    PasswordProof.verify("wrong-password-long", f.getJSONObject("hello").toString(), f.getString("nonce"), f.getString("name"), "ab".repeat(32))
  }
  @Test(expected = IllegalArgumentException::class) fun rejectsAnotherTlsCertificate() {
    val f = fixture()
    PasswordProof.verify(f.getString("password"), f.getJSONObject("hello").toString(), f.getString("nonce"), f.getString("name"), "cd".repeat(32))
  }
  @Test(expected = IllegalArgumentException::class) fun rejectsReplayFromAnotherClientNonce() {
    val f = fixture()
    PasswordProof.verify(f.getString("password"), f.getJSONObject("hello").toString(), "33".repeat(32), f.getString("name"), "ab".repeat(32))
  }
  @Test(expected = IllegalArgumentException::class) fun rejectsDeviceNameTampering() {
    val f = fixture()
    PasswordProof.verify(f.getString("password"), f.getJSONObject("hello").toString(), f.getString("nonce"), "Other phone", "ab".repeat(32))
  }
  @Test(expected = IllegalArgumentException::class) fun rejectsUnboundedWorkFactor() {
    val f = fixture(); val hello = f.getJSONObject("hello").put("iterations", Int.MAX_VALUE)
    PasswordProof.verify(f.getString("password"), hello.toString(), f.getString("nonce"), f.getString("name"), "ab".repeat(32))
  }
}
