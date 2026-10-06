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
import android.widget.Toast
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

    // Gerenciador de Seleção de Arquivos (Fotos, Documentos, etc.)
    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (filePathCallback != null) {
            val results: Array<Uri>? = when {
                result.resultCode == RESULT_OK && result.data != null -> {
                    val clipData = result.data?.clipData
                    val data = result.data?.data
                    if (clipData != null) {
                        Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
                    } else if (data != null) {
                        arrayOf(data)
                    } else null
                }
                else -> null
            }
            filePathCallback?.onReceiveValue(results)
            filePathCallback = null
        }
    }

    // Launcher para Permissões Granulares em tempo de execução
    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        // Permissões tratadas pelo sistema operacional
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

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

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings

        // Suporte completo a JavaScript e Armazenamento do Google Apps Script
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true

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

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                }

                try {
                    filePickerLauncher.launch(intent)
                } catch (e: Exception) {
                    this@MainActivity.filePathCallback = null
                    return false
                }
                return true
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                // Concede permissões web caso o app tenha solicitado (câmera, microfone)
                request?.grant(request.resources)
            }
        }

        // WebViewClient: Navegação interna e links externos (WhatsApp, etc.)
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                if (url.host == "appassets.androidplatform.net") {
                    val path = url.path ?: ""
                    // Caminhos absolutos (/assets/x.js, /pontos.json) apontam para a raiz do app (assets/www)
                    val target = if (path.startsWith("/assets/www/")) url
                        else Uri.parse("https://appassets.androidplatform.net/assets/www" + (if (path.isEmpty()) "/index.html" else path))
                    val resp = assetLoader.shouldInterceptRequest(target)
                    if (resp != null && (target.path ?: "").endsWith(".mjs")) {
                        resp.mimeType = "text/javascript"
                    }
                    return resp
                }
                return assetLoader.shouldInterceptRequest(url)
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
