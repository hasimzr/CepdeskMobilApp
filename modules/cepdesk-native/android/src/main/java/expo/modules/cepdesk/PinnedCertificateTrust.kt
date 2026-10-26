package expo.modules.cepdesk

import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.X509TrustManager

/** The certificate is the paired desktop identity, regardless of its current LAN IP. */
class PinnedCertificateTrust(pin: ByteArray) : X509TrustManager {
  private val expected = pin.copyOf()
  init { require(expected.size == 32) { "A complete SHA-256 fingerprint is required" } }
  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
    throw CertificateException("Client certificates not supported")
  }
  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
    if (chain.isEmpty()) throw CertificateException("Missing server certificate")
    verify(chain[0])
  }
  fun verify(certificate: X509Certificate) {
    certificate.checkValidity()
    val actual = MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
    if (!MessageDigest.isEqual(expected, actual)) throw CertificateException("Server certificate fingerprint mismatch")
  }
}
