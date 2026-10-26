package expo.modules.cepdesk

import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.X509TrustManager
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject
import org.json.JSONArray

/** Provisional identity, restricted to password handshake by the transport.
 * Locks to the first observed certificate even before the password proof is checked. */
class PairingCertificateTrust : X509TrustManager {
  private var observed: ByteArray? = null
  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) { throw CertificateException("Client certificates not supported") }
  @Synchronized override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
    if (chain.isEmpty()) throw CertificateException("Missing server certificate")
    chain[0].checkValidity()
    val actual = MessageDigest.getInstance("SHA-256").digest(chain[0].encoded)
    val previous = observed
    if (previous != null && !MessageDigest.isEqual(previous, actual)) throw CertificateException("Pairing certificate changed")
    observed = actual
  }
  @Synchronized fun fingerprint(): String = PasswordProof.hex(observed ?: error("TLS bağlantısı kurulmadı."))
}
object PasswordProof {
  fun hex(value: ByteArray): String = value.joinToString("") { "%02x".format(it.toInt() and 255) }
  private fun bytes(value: String): ByteArray {
    require(value.matches(Regex("[a-f0-9]{64}"))) { "Geçersiz parola doğrulaması." }
    return value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
  }
  fun nonce(): String = hex(ByteArray(32).also { SecureRandom().nextBytes(it) })
  // RFC 8018 PBKDF2, one SHA-256 block. Mac supports Android API 24, unlike
  // SecretKeyFactory PBKDF2WithHmacSHA256 (API 26). Password encoding is UTF-8.
  fun derive(password: String, salt: ByteArray, iterations: Int): ByteArray {
    val passwordBytes = password.toByteArray(Charsets.UTF_8)
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(passwordBytes, "HmacSHA256"))
    passwordBytes.fill(0)
    var block = mac.doFinal(salt + byteArrayOf(0, 0, 0, 1))
    val result = block.copyOf()
    repeat(iterations - 1) {
      val next = mac.doFinal(block)
      block.fill(0); block = next
      for (i in result.indices) result[i] = (result[i].toInt() xor block[i].toInt()).toByte()
    }
    block.fill(0)
    return result
  }
  fun verify(password: String, raw: String, nonce: String, name: String, fingerprint: String): String {
    require(password.codePointCount(0, password.length) >= 12 && password.toByteArray(Charsets.UTF_8).size <= 256) { "Parola en az 12 karakter olmalı." }
    val hello = JSONObject(raw)
    require(hello.getInt("iterations") == 600000) { "Parola protokolü uyumsuz." }
    require(hello.getString("fingerprint") == fingerprint) { "Bilgisayar sertifikası doğrulanamadı." }
    val transcript = hello.getString("transcript")
    val parts = JSONArray(transcript)
    require(parts.length() == 6 && parts.getString(0) == "cepdesk-password-v1" &&
      parts.getString(1) == hello.getString("server_id") && parts.getString(2) == fingerprint &&
      parts.getString(3) == nonce && parts.getString(4) == hello.getString("nonce") && parts.getString(5) == name) { "Parola doğrulaması bağlantıyla uyuşmuyor." }
    bytes(nonce); bytes(hello.getString("nonce"))
    val key = derive(password, bytes(hello.getString("salt")), 600000)
    try {
      val mac = Mac.getInstance("HmacSHA256")
      mac.init(SecretKeySpec(key, "HmacSHA256"))
      val expected = mac.doFinal("server:$transcript".toByteArray(Charsets.UTF_8))
      require(MessageDigest.isEqual(expected, bytes(hello.getString("proof")))) { "Parola yanlış veya bilgisayar doğrulanamadı." }
      return hex(mac.doFinal("client:$transcript".toByteArray(Charsets.UTF_8)))
    } finally { key.fill(0) }
  }
}
