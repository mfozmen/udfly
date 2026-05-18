<p align="center">
  <img src="assets/icon.png" alt="udfly" width="140">
</p>

<p align="center">
  <strong>Türkçe</strong> · <a href="README.en.md">English</a>
</p>

# Udfly

UYAP `.udf` belgeleri için hızlı, taşınabilir bir görüntüleyici. `.udf` dosyasını pencereye sürükleyip bırakın, belgeyi görün, yazdırın. Java gerekmez.

![Udfly bir anonimleştirilmiş arabuluculuk başvurusunu görüntülerken](docs/screenshots/ui-loaded-application.png)

## Bu proje neden var

UYAP (Ulusal Yargı Ağı Bilişim Sistemi) belgelerinin çoğunu `.udf` formatında üretir: CDATA metin bloğuna işaret eden konum tabanlı bir stil katmanı içeren XML işaretlemesini barındıran bir ZIP konteyneri. UYAP'ın sağladığı referans editör, modern makinelere kurulması zor, bazı sistemlerde açılmayı reddeden ve görüntülemeden çok düzenlemeye yönelik bir Java masaüstü uygulamasıdır.

Udfly salt-okunur, hafif, tek-ikili (single-binary) bir uygulamadır ve avukatlar ile vatandaşların aldıkları bir `.udf` dosyasını kurulum sancısı çekmeden *yalnızca açabilmeleri* için vardır.

## Kimler için

- Mahkemelerden ve karşı taraflardan `.udf` tebligatları alan **Türk avukatları**.
- UYAP yazışmalarında `.udf` belgeleri alan **vatandaşlar**.
- Kendi parser'larını karşılaştırmak için gerçek bir görüntüleyiciye ihtiyaç duyan, UYAP entegrasyonları üzerinde çalışan **geliştiriciler**.

## Kurulum

Windows, macOS ve Linux için derlenmiş ikili dosyalar her [GitHub Sürümüne](https://github.com/mfozmen/udfly/releases) eklenmiştir. Platformunuza uygun dosyayı indirip çalıştırın.

| Platform | Dosya |
|----------|-------|
| Windows  | `Udfly_x.y.z_x64-setup.exe` (NSIS kurulumu) veya `Udfly_x.y.z_x64-portable.exe` (kurulum gerektirmeyen tek dosyalık çalıştırılabilir) |
| macOS    | `Udfly_x.y.z_universal.dmg` (Apple Silicon + Intel) |
| Linux    | `Udfly_x.y.z_amd64.deb` (Debian / Ubuntu) veya `udfly_x.y.z_amd64.AppImage` |

Windows taşınabilir sürümü ham Tauri ikilisidir — kurulum yok, kayıt defteri girdisi yok, yönetici izni gerekmiyor. Microsoft Edge WebView2'ye bağlıdır; Windows 11'de ve son güncel Windows 10 sürümlerinde önyüklü gelir. Eski bir sistemde WebView2 eksikse [Evergreen Bağımsız Yükleyicisini](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) bir kez kurun, ardından taşınabilir `.exe` çalışır.

### İlk açılışta güvenlik uyarıları

Bu sürümler **kod imzalı değildir**. Udfly'ı ilk açtığınızda işletim sisteminiz uyarı verecektir:

- **Windows SmartScreen**: "Windows bilgisayarınızı korudu." → "Ek bilgi" → "Yine de çalıştır."
- **macOS Gatekeeper**: "Udfly açılamıyor, çünkü Apple kötü amaçlı yazılım denetimi yapamıyor." macOS sürümünüze göre iki yol:
  - **macOS 15 Sequoia ve sonrası**: Sistem Ayarları → **Gizlilik ve Güvenlik** → aşağı kaydırın → Udfly girdisinin yanındaki **Yine de Aç** düğmesine basın. Sequoia ile birlikte imzasız indirmelerde sağ-tık → Aç kısayolu kaldırıldı.
  - **macOS 14 Sonoma ve öncesi**: sağ-tık → Aç kısayolu hâlâ çalışır — Finder'da uygulamayı sağ-tıklayın (veya Control-tıklayın), "Aç" seçeneğine basıp onaylayın.

  macOS bu izni her iki yolda da hatırlar; her kurulumda yalnızca bir kez yapmanız gerekir.
- **Linux**: imza istemi yok; AppImage çalıştırılmadan önce `chmod +x udfly_*.AppImage` gerekebilir.

İkili dosyayı uyarıya güvenmek yerine doğrulamak isterseniz kaynaktan derleyin — adımlar aşağıdadır.

## Kullanım

1. Uygulamayı açın.
2. Bir `.udf` dosyasını pencereye sürükleyin.
3. Belge işlenir. Yazdırmak için **Print** düğmesini veya `Ctrl/Cmd+P` kısayolunu kullanın.

Durum çubuğu belgenin sayfa sayısını, dosya boyutunu ve mevcutsa UYAP doğrulama kodunu (`uyapdogrulamakodu`) gösterir.

## Otomatik güncelleme

Udfly her açılışta yeni bir sürüm yayınlanmış mı diye sessizce kontrol eder. Yeni sürüm varsa topbar'ın hemen altında küçük bir bildirim çubuğu belirir: **"Udfly X.Y.Z mevcut — Şimdi Güncelle"**. Düğmeye tıkladığınızda güncelleme indirilir, kurulur ve uygulama yeniden başlatılır. **×** ile kapatırsanız çubuk kapanır ve bir sonraki açılışta tekrar kontrol edilir.

İnternet yoksa veya GitHub'a ulaşılamıyorsa sessizce atlanır — açtığınız belge etkilenmez. Güncellemeler kriptografik olarak imzalıdır; uygulama yalnızca [GitHub Releases](https://github.com/mfozmen/udfly/releases) üzerinden yayınlanan ve doğru anahtarla imzalanmış paketleri kabul eder.

## Kaynaktan derleme

### Önkoşullar

- [Node.js 20+](https://nodejs.org/) (`npm` ile birlikte)
- [Rust stable](https://www.rust-lang.org/tools/install) (en güncel)
- Platforma özgü Tauri önkoşulları — bakınız: <https://tauri.app/start/prerequisites/>:
  - Linux: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf` (`patchelf`, AppImage paketlemesi için zorunludur; Linux derlemesi `bundle.targets: "all"` ayarıyla bunu her zaman dener)
  - macOS: Xcode Command Line Tools
  - Windows: Microsoft C++ Build Tools, WebView2 (Windows 11'de önyüklü)

### Komutlar

```bash
git clone https://github.com/mfozmen/udfly.git
cd udfly
npm install

# Geliştirme modunda canlı yenileme ile çalıştırma:
npm run tauri dev

# Platformunuz için üretim ikilisi derleme:
npm run tauri build
```

Geliştirme akışı, ön yüz için Vite ve Tauri kabuğu için `cargo run` çalıştırır; ilk derleme birkaç dakika sürer, sonraki çalıştırmalar artışlıdır.

### Test takımını çalıştırma

```bash
npm test
```

Parser, render ve güvenlik testleri `test/` altında bulunur ve `samples/fixtures/` içindeki her iki örnek dosyayı kapsar. Uygulamanın görsel kabuğu manuel olarak test edilir — her örnek dosyayı sürükleyip bırakıp çıktının `docs/screenshots/` içindeki ekran görüntüleriyle eşleştiğini doğrulayın.

## UDF formatı hakkında

`.udf` formatı şunları içeren bir ZIP arşividir:

- `content.xml` — belgenin metnini üst düzey bir `<content><![CDATA[…]]></content>` bloğunda barındırır; ayrıca metni CDATA'ya konum/uzunluk işaretçileri üzerinden biçimlendiren kardeş bir `<elements>` ağacı bulunur. `<styles>` içindeki çözücü zincirleri kademeli varsayılanları sağlar.
- `documentproperties.xml` (isteğe bağlı) — UYAP üst verisi, içinde `uyapdogrulamakodu` doğrulama kodu da bulunur.
- `sign.sgn` (isteğe bağlı) — dijital imza verisi; bu görüntüleyici tarafından göz ardı edilir.

Bu formatın **kamuya açık bir spesifikasyonu yoktur**. Bu uygulama gerçek `.udf` dosyaları incelenerek tersine mühendislikle çıkarılmıştır; `CLAUDE_CODE_BRIEF.md` içindeki format ayrıntıları gözlemlenen davranışları yansıtır, resmi bir spesifikasyon değildir. UYAP biçimi önceden uyarmadan değiştirebilir.

## Sorumluluk reddi

Udfly **UYAP, Türkiye Cumhuriyeti Adalet Bakanlığı veya herhangi bir resmi kurumla bağlantılı değildir**. Kamuya açık bir dosya formatını okuyan bağımsız, açık kaynaklı bir projedir. Kendi sorumluluğunuzda kullanın; bu görüntüleyicinin ürettiği hiçbir çıktı, hukuki yetkinin önemli olduğu durumlarda UYAP'ın ürettiği özgün belgenin yerine geçecek şekilde değerlendirilmemelidir.

## Katkıda bulunmak

PR'lar memnuniyetle karşılanır — özellikle:

- Mevcut örneklerin kapsamadığı sınır durumlarını test eden **anonimleştirilmiş test örnekleri** (italik / üstü çizili runlar, çoklu satırlı tablolar, birden fazla paragraflı başlıklar, vb.). Tüm kişisel verileri **karakter uzunluğu aynı** olacak şekilde dummy değerlerle değiştirin; böylece `<elements>` bölümündeki `startOffset` / `length` işaretçileri geçerli kalır.
- Sorunu yeniden üreten anonimleştirilmiş bir örnek dosyayla birlikte gönderilen, bir GitHub issue'sına iliştirilmiş **hata bildirimleri**.

PR açmadan önce lütfen [`CLAUDE.md`](CLAUDE.md) dosyasını okuyun — proje TDD, branş-başına-değişiklik ve conventional commits konularında katı kurallara sahiptir.

## Lisans

[MIT](LICENSE) — Telif Hakkı (c) 2026 Mehmet Fahri Özmen.
