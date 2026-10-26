package expo.modules.cepdesk

import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

class PinnedCertificateTrustTest {
  private fun certificate(): X509Certificate {
    val stream = javaClass.getResourceAsStream("/pinned.pem")!!
    return stream.use { CertificateFactory.getInstance("X.509").generateCertificate(it) as X509Certificate }
  }
  @Test fun acceptsExactlyThePinnedCertificate() {
    val cert = certificate()
    val pin = MessageDigest.getInstance("SHA-256").digest(cert.encoded)
    val trust = PinnedCertificateTrust(pin)
    trust.checkServerTrusted(arrayOf(cert), "RSA")
    trust.verify(cert)
    assertEquals(0, trust.acceptedIssuers.size)
  }
  @Test(expected = CertificateException::class) fun rejectsAnotherFingerprint() {
    PinnedCertificateTrust(ByteArray(32)).checkServerTrusted(arrayOf(certificate()), "RSA")
  }
  @Test(expected = CertificateException::class) fun rejectsAnEmptyCertificateChain() {
    PinnedCertificateTrust(ByteArray(32)).checkServerTrusted(emptyArray(), "RSA")
  }
  @Test(expected = IllegalArgumentException::class) fun rejectsIncompletePin() {
    PinnedCertificateTrust(ByteArray(31))
  }
  @Test fun callerCannotMutateTheTrustedIdentity() {
    val cert = certificate()
    val pin = MessageDigest.getInstance("SHA-256").digest(cert.encoded)
    val trust = PinnedCertificateTrust(pin)
    pin.fill(0)
    trust.verify(cert)
  }
}
