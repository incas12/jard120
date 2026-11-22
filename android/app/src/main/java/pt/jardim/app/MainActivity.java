package pt.jardim.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String INICIO = "https://" + HOST + "/assets/www/index.html";
    private static final int PEDIDO_FICHEIRO = 1;

    private WebView web;
    private ValueCallback<Uri[]> retorno;
    private Uri fotoCamara;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        web = new WebView(this);
        setContentView(web);

        final WebViewAssetLoader carregador = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return carregador.shouldInterceptRequest(r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                return escolherFicheiro(cb, p);
            }
        });

        web.addJavascriptInterface(new Ponte(), "Android");

        if (estado != null) web.restoreState(estado);
        else web.loadUrl(INICIO);
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    private boolean escolherFicheiro(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams p) {
        if (retorno != null) retorno.onReceiveValue(null);
        retorno = cb;
        fotoCamara = null;

        boolean imagem = false;
        for (String t : p.getAcceptTypes()) if (t != null && t.startsWith("image")) imagem = true;

        Intent abrir = new Intent(Intent.ACTION_GET_CONTENT);
        abrir.addCategory(Intent.CATEGORY_OPENABLE);
        abrir.setType(imagem ? "image/*" : "*/*");
        Intent escolha = Intent.createChooser(abrir, imagem ? "Adicionar foto" : "Escolher ficheiro");

        if (imagem) {
            try {
                File pasta = new File(getCacheDir(), "fotos");
                pasta.mkdirs();
                File f = File.createTempFile("foto", ".jpg", pasta);
                fotoCamara = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f);
                Intent camara = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                camara.putExtra(MediaStore.EXTRA_OUTPUT, fotoCamara);
                camara.setClipData(ClipData.newRawUri("foto", fotoCamara));
                camara.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                escolha.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camara});
            } catch (Exception e) {
                fotoCamara = null;
            }
        }

        try {
            startActivityForResult(escolha, PEDIDO_FICHEIRO);
            return true;
        } catch (ActivityNotFoundException e) {
            retorno = null;
            return false;
        }
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        if (pedido != PEDIDO_FICHEIRO || retorno == null) {
            super.onActivityResult(pedido, resultado, dados);
            return;
        }
        Uri[] r = null;
        if (resultado == RESULT_OK) {
            if (dados != null && dados.getData() != null) {
                r = new Uri[]{dados.getData()};
            } else if (fotoCamara != null) {
                r = new Uri[]{fotoCamara};
            }
        }
        retorno.onReceiveValue(r);
        retorno = null;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** Funções chamadas a partir da página (window.Android). */
    private class Ponte {
        @JavascriptInterface
        public String guardar(String base64, String nome, String tipo) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, nome);
                cv.put(MediaStore.Downloads.MIME_TYPE, tipo);
                cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (u == null) return "sem acesso às Transferências";
                try (OutputStream o = getContentResolver().openOutputStream(u)) {
                    if (o == null) return "sem acesso às Transferências";
                    o.write(bytes);
                }
                return "ok";
            } catch (Exception e) {
                return String.valueOf(e.getMessage());
            }
        }

        @JavascriptInterface
        public String partilhar(String base64, String nome, String tipo) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                File pasta = new File(getCacheDir(), "partilha");
                pasta.mkdirs();
                File f = new File(pasta, nome);
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(bytes); }
                Uri u = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", f);
                final Intent enviar = new Intent(Intent.ACTION_SEND);
                enviar.setType(tipo);
                enviar.putExtra(Intent.EXTRA_STREAM, u);
                enviar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(enviar, "Enviar para")));
                return "ok";
            } catch (Exception e) {
                return String.valueOf(e.getMessage());
            }
        }
    }
}
