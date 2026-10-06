package com.webview.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.webkit.*
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.RelativeLayout
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.provider.MediaStore
import android.provider.Settings
import androidx.core.app.ActivityCompat
import android.widget.Toast
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream
import androidx.core.content.FileProvider
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebViewAssetLoader
import com.airbnb.lottie.LottieAnimationView

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefreshLayout: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var layoutOffline: LinearLayout
    private lateinit var btnRetry: Button
    private lateinit var layoutSplash: RelativeLayout
    private lateinit var lottieSplash: LottieAnimationView
    private lateinit var imgSplash: ImageView
    private lateinit var assetLoader: WebViewAssetLoader

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var webAppUrl: String = ""
    private var splashDismissed = false
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null

    private var cameraImageUri: Uri? = null

    // Gerenciador de Seleção de Arquivos (Fotos da Câmera, Galeria, Documentos, etc.)
    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (filePathCallback != null) {
            val results: Array<Uri>? = when (result.resultCode) {
                RESULT_OK -> {
                    val clipData = result.data?.clipData
                    val data = result.data?.data
                    when {
                        clipData != null -> {
                            cameraImageUri = null
                            Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
                        }
                        data != null -> {
                            cameraImageUri = null
                            arrayOf(data)
                        }
                        cameraImageUri != null -> {
                            val uri = cameraImageUri
                            cameraImageUri = null
                            if (uri != null) arrayOf(uri) else null
                        }
                        else -> null
                    }
                }
                else -> {
                    cameraImageUri = null
                    null
                }
            }
            filePathCallback?.onReceiveValue(results)
            filePathCallback = null
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun requestLocation() {
            runOnUiThread {
                requestNativeLocation()
            }
        }
    }

    // Launcher para Permissões Granulares em tempo de execução
    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val geoGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                         permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (pendingGeoCallback != null) {
            pendingGeoCallback?.invoke(pendingGeoOrigin, geoGranted, false)
            pendingGeoCallback = null
            pendingGeoOrigin = null
        }
        if (geoGranted) {
            requestNativeLocation()
        }
    }

    fun requestNativeLocation() {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

        if (!fine && !coarse) {
            requestPermissionsLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
            return
        }

        try {
            val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val gpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
            val networkEnabled = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)

            if (!gpsEnabled && !networkEnabled) {
                Toast.makeText(this, "Por favor, ative a Localização / GPS do seu celular.", Toast.LENGTH_LONG).show()
                return
            }

            var bestLoc: Location? = null
            val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            for (p in providers) {
                try {
                    val loc = lm.getLastKnownLocation(p)
                    if (loc != null) {
                        if (bestLoc == null || loc.accuracy < bestLoc.accuracy || loc.time > bestLoc.time) {
                            bestLoc = loc
                        }
                    }
                } catch (_: SecurityException) {}
            }

            if (bestLoc != null) {
                sendLocationToWeb(bestLoc)
            }

            val listener = object : LocationListener {
                override fun onLocationChanged(loc: Location) {
                    sendLocationToWeb(loc)
                    try { lm.removeUpdates(this) } catch (_: Exception) {}
                }
                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                override fun onProviderEnabled(provider: String) {}
                override fun onProviderDisabled(provider: String) {}
            }

            for (p in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
                try {
                    if (lm.isProviderEnabled(p)) {
                        lm.requestSingleUpdate(p, listener, Looper.getMainLooper())
                    }
                } catch (_: Exception) {}
            }
        } catch (e: Exception) {
            android.util.Log.e("Sheet2APK", "Erro ao obter localização nativa: ${e.message}")
        }
    }

    private fun sendLocationToWeb(loc: Location) {
        val js = """
            (function() {
                var p = { coords: { latitude: ${loc.latitude}, longitude: ${loc.longitude}, accuracy: ${loc.accuracy} } };
                if (typeof window.atualizarPosicao === 'function') {
                    window.atualizarPosicao(p);
                } else {
                    window.__lastKnownLocation = p;
                }
            })();
        """.trimIndent()
        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Limpa cache de permissões da WebView para garantir que não haja negação retida
        try {
            GeolocationPermissions.getInstance().clearAll()
        } catch (_: Exception) {}

        webAppUrl = getString(R.string.app_url)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        initViews()
        applyScreenBehaviors()
        checkAndRequestPermissions()
        setupSplash()
        setupWebView()
        setupSwipeRefresh()
        setupBackNavigation()

        loadWebApp()
    }

    private fun checkAndRequestPermissions() {
        try {
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
            } else {
                @Suppress("DEPRECATION")
                packageManager.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS)
            }
            val permissions = info.requestedPermissions ?: return
            val needed = permissions.filter { perm ->
                perm != Manifest.permission.INTERNET &&
                perm != Manifest.permission.ACCESS_NETWORK_STATE &&
                ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED
            }
            if (needed.isNotEmpty()) {
                requestPermissionsLauncher.launch(needed.toTypedArray())
            }
        } catch (e: Exception) {
            // Ignorado em caso de incompatibilidade
        }
    }

    private fun initViews() {
        webView = findViewById(R.id.webView)
        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout)
        progressBar = findViewById(R.id.progressBar)
        layoutOffline = findViewById(R.id.layoutOffline)
        btnRetry = findViewById(R.id.btnRetry)
        layoutSplash = findViewById(R.id.layoutSplash)
        lottieSplash = findViewById(R.id.lottieSplash)
        imgSplash = findViewById(R.id.imgSplash)

        btnRetry.setOnClickListener {
            layoutOffline.visibility = View.GONE
            webView.visibility = View.VISIBLE
            loadWebApp()
        }
    }

    private fun applyScreenBehaviors() {
        // 1. Manter tela sempre ligada (Keep Screen On)
        if (resources.getBoolean(R.bool.keep_screen_on)) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }

        // 2. Modo Tela Cheia Imersivo (Oculta barra de status)
        if (resources.getBoolean(R.bool.fullscreen)) {
            WindowCompat.setDecorFitsSystemWindows(window, false)
            WindowInsetsControllerCompat(window, window.decorView).let { controller ->
                controller.hide(WindowInsetsCompat.Type.systemBars())
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }
    }

    private fun setupSplash() {
        val hasSplash = resources.getBoolean(R.bool.has_splash)
        if (!hasSplash) {
            layoutSplash.visibility = View.GONE
            return
        }

        layoutSplash.visibility = View.VISIBLE
        val isLottie = resources.getBoolean(R.bool.splash_is_lottie)

        if (isLottie) {
            try {
                lottieSplash.visibility = View.VISIBLE
                lottieSplash.setAnimation("splash.json")
                lottieSplash.playAnimation()
            } catch (e: Exception) {
                imgSplash.visibility = View.VISIBLE
            }
        } else {
            val customImgRes = resources.getIdentifier("splash_custom", "drawable", packageName)
            if (customImgRes != 0) {
                imgSplash.setImageResource(customImgRes)
            }
            imgSplash.visibility = View.VISIBLE
        }

        // Garante que a splash não trave por mais de 2.5s se a internet estiver lenta
        Handler(Looper.getMainLooper()).postDelayed({
            dismissSplash()
        }, 2500)
    }

    private fun dismissSplash() {
        if (!splashDismissed && layoutSplash.visibility == View.VISIBLE) {
            splashDismissed = true
            layoutSplash.animate()
                .alpha(0f)
                .setDuration(450)
                .withEndAction {
                    layoutSplash.visibility = View.GONE
                }
        }
    }

    private fun getMimeType(filePath: String): String {
        val clean = filePath.substringBefore('?').substringBefore('#').lowercase()
        return when {
            clean.endsWith(".html") || clean.endsWith(".htm") -> "text/html"
            clean.endsWith(".js") || clean.endsWith(".mjs") -> "application/javascript"
            clean.endsWith(".css") -> "text/css"
            clean.endsWith(".json") -> "application/json"
            clean.endsWith(".geojson") -> "application/geo+json"
            clean.endsWith(".png") -> "image/png"
            clean.endsWith(".jpg") || clean.endsWith(".jpeg") -> "image/jpeg"
            clean.endsWith(".webp") -> "image/webp"
            clean.endsWith(".gif") -> "image/gif"
            clean.endsWith(".svg") -> "image/svg+xml"
            clean.endsWith(".ico") -> "image/x-icon"
            clean.endsWith(".wasm") -> "application/wasm"
            clean.endsWith(".woff2") -> "font/woff2"
            clean.endsWith(".woff") -> "font/woff"
            clean.endsWith(".ttf") -> "font/ttf"
            clean.endsWith(".otf") -> "font/otf"
            clean.endsWith(".xml") -> "application/xml"
            clean.endsWith(".txt") -> "text/plain"
            clean.endsWith(".webmanifest") -> "application/manifest+json"
            clean.endsWith(".mp3") -> "audio/mpeg"
            clean.endsWith(".wav") -> "audio/wav"
            clean.endsWith(".mp4") -> "video/mp4"
            clean.endsWith(".pdf") -> "application/pdf"
            else -> "application/octet-stream"
        }
    }

    private fun getEncoding(mimeType: String): String? {
        return if (mimeType.startsWith("text/") ||
                   mimeType.contains("javascript") ||
                   mimeType.contains("json") ||
                   mimeType.contains("xml")) {
            "UTF-8"
        } else {
            null
        }
    }

    // Resolve requisições locais diretamente dos assets/www com suporte completo a CORS e MIME types corretos
    private fun interceptLocal(url: Uri, request: WebResourceRequest? = null): WebResourceResponse? {
        // Responde a requisições CORS preflight OPTIONS imediatamente
        if (request?.method?.equals("OPTIONS", ignoreCase = true) == true) {
            val headers = hashMapOf(
                "Access-Control-Allow-Origin" to "*",
                "Access-Control-Allow-Methods" to "GET, POST, OPTIONS, HEAD",
                "Access-Control-Allow-Headers" to "*"
            )
            return WebResourceResponse("text/plain", "UTF-8", 200, "OK", headers, ByteArrayInputStream(ByteArray(0)))
        }

        val host = url.host ?: ""
        val isLocal = host == "appassets.androidplatform.net" || url.scheme == "file"
        if (!isLocal) {
            return null
        }

        var cleanPath = (url.path ?: "").trimStart('/')
        if (cleanPath.startsWith("assets/www/")) {
            cleanPath = cleanPath.substring("assets/www/".length)
        }

        if (cleanPath.isEmpty() || cleanPath == "/") {
            cleanPath = "index.html"
        }

        val assetPath = "www/$cleanPath"
        val mime = getMimeType(assetPath)
        val encoding = getEncoding(mime)

        val headers = hashMapOf(
            "Access-Control-Allow-Origin" to "*",
            "Access-Control-Allow-Methods" to "GET, POST, OPTIONS, HEAD",
            "Access-Control-Allow-Headers" to "*",
            "Cache-Control" to "no-cache"
        )

        // 1. Tentar abrir o arquivo correspondente em assets/www/...
        try {
            val stream = assets.open(assetPath)
            return WebResourceResponse(mime, encoding, 200, "OK", headers, stream)
        } catch (_: Exception) {}

        // 1.1 Tentar em www/assets/$cleanPath se não começou com assets/
        if (!cleanPath.startsWith("assets/")) {
            try {
                val stream = assets.open("www/assets/$cleanPath")
                return WebResourceResponse(mime, encoding, 200, "OK", headers, stream)
            } catch (_: Exception) {}
        } else {
            // Tentar em www/ sem o prefixo assets/
            try {
                val subPath = cleanPath.substring("assets/".length)
                val stream = assets.open("www/$subPath")
                return WebResourceResponse(mime, encoding, 200, "OK", headers, stream)
            } catch (_: Exception) {}
        }

        // 2. Se for rota SPA sem extensão (ex: /painel, /rotas), fallback para index.html
        if (!cleanPath.contains(".")) {
            try {
                val stream = assets.open("www/index.html")
                return WebResourceResponse("text/html", "UTF-8", 200, "OK", headers, stream)
            } catch (_: Exception) {}
        }

        // 3. Fallback no WebViewAssetLoader com garantia de CORS e MIME type
        val fallbackResp = assetLoader.shouldInterceptRequest(url)
        if (fallbackResp != null) {
            val currentHeaders = fallbackResp.responseHeaders?.toMutableMap() ?: mutableMapOf()
            currentHeaders["Access-Control-Allow-Origin"] = "*"
            fallbackResp.responseHeaders = currentHeaders
            if (fallbackResp.mimeType.isNullOrEmpty() || fallbackResp.mimeType == "application/octet-stream") {
                fallbackResp.mimeType = mime
            }
        }
        return fallbackResp
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        val settings = webView.settings

        // Suporte completo a JavaScript e Armazenamento Local
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        // Bridge Nativa Android <-> JavaScript para GPS e Recursos do Sistema
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        // Suporte a Geolocalização HTML5 (navigator.geolocation)
        settings.setGeolocationEnabled(true)
        try {
            settings.setGeolocationDatabasePath(filesDir.path)
        } catch (_: Exception) {}

        // Permite carregar recursos locais
        try {
            @Suppress("DEPRECATION")
            settings.allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION")
            settings.allowUniversalAccessFromFileURLs = true
        } catch (_: Exception) {}

        // Viewport e Zoom
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false

        // Cache e Performance
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // User-Agent: Remove a flag "wv" para evitar erro "disallowed_useragent" nas contas Google
        val defaultUserAgent = settings.userAgentString
        settings.userAgentString = defaultUserAgent.replace("; wv", "")

        // WebChromeClient: Uploads, Barra de Progresso e Permissões
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                    dismissSplash()
                }
            }

            override fun onShowFileChooser(
                view: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val acceptTypes = fileChooserParams?.acceptTypes ?: emptyArray()
                val isImage = acceptTypes.isEmpty() || acceptTypes.any {
                    it.contains("image", ignoreCase = true) || it == "*/*"
                }

                val intentList = mutableListOf<Intent>()

                // 1. Se aceitar imagem, adiciona a opção de Câmera (Tirar Foto)
                if (isImage) {
                    try {
                        val photoFile = File.createTempFile(
                            "PHOTO_${System.currentTimeMillis()}_",
                            ".jpg",
                            getExternalFilesDir(Environment.DIRECTORY_PICTURES) ?: cacheDir
                        )
                        cameraImageUri = FileProvider.getUriForFile(
                            this@MainActivity,
                            "${packageName}.fileprovider",
                            photoFile
                        )
                        val captureIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                            putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri)
                            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        intentList.add(captureIntent)
                    } catch (e: Exception) {
                        cameraImageUri = null
                    }
                }

                // 2. Intent para abrir Galeria / Seletor de Arquivos
                val galleryIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = if (isImage) "image/*" else "*/*"
                    if (fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                }

                // 3. Chooser que exibe AMBOS: Câmera e Galeria ao mesmo tempo!
                val chooserIntent = Intent(Intent.ACTION_CHOOSER).apply {
                    putExtra(Intent.EXTRA_INTENT, galleryIntent)
                    putExtra(Intent.EXTRA_TITLE, "Tirar Foto ou Escolher da Galeria")
                    if (intentList.isNotEmpty()) {
                        putExtra(Intent.EXTRA_INITIAL_INTENTS, intentList.toTypedArray())
                    }
                }

                try {
                    filePickerLauncher.launch(chooserIntent)
                } catch (e: Exception) {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    this@MainActivity.filePathCallback = null
                    return false
                }
                return true
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                val targetOrigin = origin ?: "https://appassets.androidplatform.net"
                // Sempre concede imediatamente no nível da WebView com retain = false para o Chromium nunca bloquear
                callback?.invoke(targetOrigin, true, false)

                // Dispara a busca e verificação de permissão no nível nativo do Android
                requestNativeLocation()
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                // Concede permissões web caso o app tenha solicitado (câmera, microfone)
                request?.grant(request.resources)
            }

            override fun onConsoleMessage(msg: ConsoleMessage?): Boolean {
                if (msg != null && msg.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    android.util.Log.e("Sheet2APK", "JS: ${msg.message()} (${msg.sourceId()}:${msg.lineNumber()})")
                }
                return true
            }
        }

        // Service Workers (ex: sw.js do projeto) também precisam ler os arquivos locais
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                ServiceWorkerController.getInstance().setServiceWorkerClient(object : ServiceWorkerClient() {
                    override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? {
                        return interceptLocal(request.url, request)
                    }
                })
            } catch (e: Exception) { /* ignorado */ }
        }

        // WebViewClient: Navegação interna e links externos (WhatsApp, etc.)
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                return interceptLocal(url, request)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldInterceptRequest(view: WebView?, url: String?): WebResourceResponse? {
                val uri = if (url != null) Uri.parse(url) else return null
                return interceptLocal(uri, null)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false

                // Manter links HTTP/HTTPS locais ou remotos dentro da WebView
                if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://")) {
                    return false
                }

                // Abrir esquemas especiais (WhatsApp, Telefone, Email, Maps, etc.) em apps externos
                return try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                    true
                } catch (e: Exception) {
                    false
                }
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                layoutOffline.visibility = View.GONE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefreshLayout.isRefreshing = false
                progressBar.visibility = View.GONE
                dismissSplash()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                val isLocalApp = webAppUrl.contains("appassets.androidplatform.net") || webAppUrl.startsWith("file://")
                if (!isLocalApp && request?.isForMainFrame == true && !isOnline()) {
                    webView.visibility = View.GONE
                    layoutOffline.visibility = View.VISIBLE
                    dismissSplash()
                }
            }
        }

        // Gerenciador de Downloads (Exportações de Planilhas PDF/CSV/Excel)
        webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
            try {
                val request = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mimetype)
                    addRequestHeader("User-Agent", userAgent)
                    setDescription(getString(R.string.msg_downloading))
                    setTitle(URLUtil.guessFileName(url, contentDisposition, mimetype))
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(
                        Environment.DIRECTORY_DOWNLOADS,
                        URLUtil.guessFileName(url, contentDisposition, mimetype)
                    )
                }

                val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                dm.enqueue(request)
                Toast.makeText(this, R.string.msg_downloading, Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this, "Falha ao iniciar download", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun setupSwipeRefresh() {
        val pullEnabled = resources.getBoolean(R.bool.pull_to_refresh)
        swipeRefreshLayout.isEnabled = pullEnabled

        swipeRefreshLayout.setOnRefreshListener {
            if (isOnline() || webAppUrl.contains("appassets.androidplatform.net")) {
                webView.reload()
            } else {
                swipeRefreshLayout.isRefreshing = false
                webView.visibility = View.GONE
                layoutOffline.visibility = View.VISIBLE
            }
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    private fun loadWebApp() {
        val isLocalApp = webAppUrl.contains("appassets.androidplatform.net") || webAppUrl.startsWith("file://")
        if (isLocalApp || isOnline()) {
            layoutOffline.visibility = View.GONE
            webView.visibility = View.VISIBLE
            webView.loadUrl(webAppUrl)
        } else {
            webView.visibility = View.GONE
            layoutOffline.visibility = View.VISIBLE
            dismissSplash()
        }
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
