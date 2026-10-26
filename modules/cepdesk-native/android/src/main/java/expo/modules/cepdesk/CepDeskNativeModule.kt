package expo.modules.cepdesk

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.*
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.*

/** Saved connections pin the certificate. First pairing authenticates the observed
 * certificate using password proofs before any credentials or application data are sent. */
class CepDeskNativeModule : Module() {
  @Volatile private var pairingTrust: PairingCertificateTrust? = null
  @Volatile private var authenticated = false
  private val workspaceLock = Any()
  private val phoneAudio = PhoneAudioPlayer { sendEvent("onAudio", mapOf("state" to "error")) }
  private var socket: WebSocket? = null
  private var client: OkHttpClient? = null
  @Volatile private var session = ""
  private var discovery: NsdManager.DiscoveryListener? = null
  private var nsd: NsdManager? = null
  private var multicast: WifiManager.MulticastLock? = null

  override fun definition() = ModuleDefinition {
    Name("CepDeskNative")
    Events("onTransport", "onDiscovery", "onAudio", "onMonitorFrame")
    View(CanvasPagerView::class) {
      Events("onPageSelected", "onInputTouch")
      Prop("page") { view: CanvasPagerView, page: Int -> view.setPage(page) }
      Prop("count") { view: CanvasPagerView, count: Int -> view.setCount(count) }
      Prop("pagingEnabled") { view: CanvasPagerView, enabled: Boolean -> view.pagingEnabled = enabled }
    }
    View(MonitorView::class) {
      Prop("streamId") { view: MonitorView, id: String -> view.setStream(id) }
    }
    AsyncFunction("clearMonitorFrame") { id: String -> MonitorFrames.clear(id) }
    AsyncFunction("connect") { url: String, fingerprint: String, id: String ->
      require(url.startsWith("wss://")) { "Yalnızca şifreli WebSocket desteklenir." }
      val normalized = fingerprint.replace(":", "").lowercase()
      require(normalized.isEmpty() || normalized.matches(Regex("[a-f0-9]{64}"))) { "SHA-256 parmak izi 64 onaltılık karakter olmalı." }
      closeTransport()
      session = id
      val provisional = if (normalized.isEmpty()) PairingCertificateTrust() else null
      pairingTrust = provisional
      authenticated = provisional == null
      val expected = normalized.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
      val trust: X509TrustManager = provisional ?: PinnedCertificateTrust(expected)
      val context = SSLContext.getInstance("TLS")
      context.init(null, arrayOf(trust), null)
      val newClient = OkHttpClient.Builder()
        .sslSocketFactory(context.socketFactory, trust)
        .hostnameVerifier { _, sslSession ->
          // Identity follows the pinned key/certificate, independent of a DHCP address change.
          try {
            val cert = sslSession.peerCertificates[0] as X509Certificate
            trust.checkServerTrusted(arrayOf(cert), cert.publicKey.algorithm)
            true
          } catch (_: Exception) { false }
        }
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .pingInterval(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .build()
      client = newClient
      socket = newClient.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
        private fun emit(state: String, extra: Map<String, Any?> = emptyMap()) {
          if (session == id) sendEvent("onTransport", mapOf("session" to id, "state" to state) + extra)
        }
        override fun onOpen(webSocket: WebSocket, response: Response) { emit("open") }
        override fun onMessage(webSocket: WebSocket, bytes: okio.ByteString) {
          if (session != id || !authenticated) return
          val packet = bytes.toByteArray()
          if (!MonitorFrames.accept(packet) { frame -> if (session == id) sendEvent("onMonitorFrame",frame) }) phoneAudio.enqueue(packet)
        }
        override fun onMessage(webSocket: WebSocket, text: String) {
          if (text.length > 1024 * 1024) { webSocket.close(1009, "Message limit"); emit("error", mapOf("code" to "PAYLOAD_LIMIT")); return }
          emit("message", mapOf("text" to text))
        }
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { if (session == id) { phoneAudio.stop(); MonitorFrames.clear() }; webSocket.close(code, reason); emit("closed") }
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { if (session == id) { phoneAudio.stop(); MonitorFrames.clear() }; emit("closed") }
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
          if (session == id) { phoneAudio.stop(); MonitorFrames.clear() }
          // Deliberately do not forward exception messages, headers, credentials, or payloads.
          val tls = generateSequence(t as Throwable?) { it.cause }.any { it is SSLException || it is CertificateException }
          emit("error", mapOf("code" to if (tls) "CERTIFICATE" else "CONNECTION"))
        }
      })
    }
    AsyncFunction("readWorkspace") {
      synchronized(workspaceLock) {
        val context = appContext.reactContext ?: error("Android context unavailable")
        val storage = android.util.AtomicFile(java.io.File(context.filesDir, "cepdesk-workspace.json"))
        try { storage.readFully().toString(Charsets.UTF_8) } catch (_: java.io.FileNotFoundException) { null }
      }
    }
    AsyncFunction("writeWorkspace") { raw: String ->
      org.json.JSONObject(raw)
      synchronized(workspaceLock) {
        val context = appContext.reactContext ?: error("Android context unavailable")
        val storage = android.util.AtomicFile(java.io.File(context.filesDir, "cepdesk-workspace.json"))
        val stream = storage.startWrite()
        try { stream.write(raw.toByteArray(Charsets.UTF_8)); storage.finishWrite(stream) }
        catch (error: Exception) { storage.failWrite(stream); throw error }
      }
    }
    AsyncFunction("startAudioPlayback") { check(authenticated && socket != null) { "Önce bağlanın." }; phoneAudio.start() }
    AsyncFunction("stopAudioPlayback") { phoneAudio.stop() }
    AsyncFunction("pairingNonce") { PasswordProof.nonce() }
    AsyncFunction("passwordProof") { password: String, hello: String, nonce: String, name: String, id: String ->
      val trust = pairingTrust ?: error("Parola eşleştirmesi başlatılmadı.")
      val proof = PasswordProof.verify(password, hello, nonce, name, trust.fingerprint())
      check(session == id && pairingTrust === trust) { "Bağlantı değişti; tekrar deneyin." }
      authenticated = true
      proof
    }
    AsyncFunction("send") { text: String ->
      if (!authenticated) {
        val message = org.json.JSONObject(text)
        require(message.getString("method") == "password.hello") { "Önce bilgisayar parolayla doğrulanmalı." }
      }
      require(text.toByteArray(Charsets.UTF_8).size <= 256 * 1024) { "İstek boyut sınırı." }
      check(socket?.send(text) == true) { "Bağlantı açık değil." }
    }
    AsyncFunction("disconnect") { closeTransport() }
    AsyncFunction("discover") { startDiscovery() }
    AsyncFunction("stopDiscovery") { stopDiscovery() }
    OnDestroy { closeTransport(); stopDiscovery() }
  }

  private fun closeTransport() {
    MonitorFrames.clear()
    phoneAudio.stop()
    session = ""
    pairingTrust = null; authenticated = false
    socket?.cancel(); socket = null
    client?.connectionPool?.evictAll()
    client?.dispatcher?.executorService?.shutdown()
    client = null
  }
  private fun startDiscovery() {
    stopDiscovery()
    val context = appContext.reactContext ?: error("Android context unavailable")
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    multicast = wifi.createMulticastLock("cepdesk-discovery").apply { setReferenceCounted(false); acquire() }
    val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    nsd = manager
    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(type: String) { sendEvent("onDiscovery", mapOf("state" to "started")) }
      override fun onServiceFound(info: NsdServiceInfo) {
        if (info.serviceType != "_cepdesk._tcp.") return
        @Suppress("DEPRECATION")
        manager.resolveService(info, object : NsdManager.ResolveListener {
          override fun onResolveFailed(service: NsdServiceInfo, code: Int) { sendEvent("onDiscovery", mapOf("state" to "resolve_failed")) }
          override fun onServiceResolved(service: NsdServiceInfo) {
            @Suppress("DEPRECATION") val host = service.host?.hostAddress ?: return
            if (host.contains(":")) return // v1 is deliberately IPv4-only.
            sendEvent("onDiscovery", mapOf("state" to "found", "name" to service.serviceName, "host" to host, "port" to service.port, "serverId" to service.attributes["id"]?.toString(Charsets.UTF_8)))
          }
        })
      }
      override fun onServiceLost(info: NsdServiceInfo) { sendEvent("onDiscovery", mapOf("state" to "lost", "name" to info.serviceName)) }
      override fun onDiscoveryStopped(type: String) { sendEvent("onDiscovery", mapOf("state" to "stopped")) }
      override fun onStartDiscoveryFailed(type: String, code: Int) { sendEvent("onDiscovery", mapOf("state" to "error")); stopDiscovery() }
      override fun onStopDiscoveryFailed(type: String, code: Int) { sendEvent("onDiscovery", mapOf("state" to "error")) }
    }
    discovery = listener
    manager.discoverServices("_cepdesk._tcp.", NsdManager.PROTOCOL_DNS_SD, listener)
  }
  private fun stopDiscovery() {
    discovery?.let { try { nsd?.stopServiceDiscovery(it) } catch (_: Exception) {} }
    discovery = null; nsd = null
    multicast?.let { if (it.isHeld) it.release() }; multicast = null
  }
}
