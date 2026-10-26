# CepDesk görselleri

Imagegen yerleşik aracıyla oluşturulmuştur; CLI/API anahtarı kullanılmamıştır. Ana kaynaklar 1254 × 1254 PNG'dir. Expo prebuild farklı Android yoğunluklarına uygun ikon ve açılış kaynaklarını üretir.

- `cepdesk-icon-v1.png`: koyu lacivert zemin üzerinde indigo/beyaz telefon, masaüstü ve imleç simgesi. APK ikonu ve Android 12+ sistem açılış simgesi.
- `cepdesk-splash-v1.png`: aynı simge ve CepDesk yazısı. Eski Android sürümlerinin ortalanmış açılış görseli.
- Renk zemini: `#10111B`. Uygulama ayarları `app.config.ts`; Android 12+ tema desteği `plugins/withCepDesk.js` içindedir.

## Son üretim istemleri

### APK ikonu

Use case: compositing. Turn the supplied CepDesk monitor-and-phone emblem into a finished square Android launcher icon. Preserve the exact emblem design, proportions, pointer and indigo/white colors. Use a perfectly uniform solid dark navy background #10111B across the entire square canvas, full bleed, NO rounded enclosing square, NO vignette, no gradient in the background. Center the emblem with generous safe margin, emblem inside central 60% of canvas, equal padding above and below. Clean smooth professional contour edges: remove all stray flecks, white crumbs, transparent edge artifacts, stray lines and noise around the emblem. Keep the subtle dimensional shading inside the emblem. No text, no watermark, no presentation, no phone mockup. Deliver the actual single 1024x1024 icon.

### Açılış görseli

Use case: logo-brand. Asset type: actual CepDesk mobile startup splash artwork. Use the exact clean monitor-and-phone emblem from the attached reference, preserving design and colors. A square canvas with a perfectly flat, uniform dark navy #10111B background, matching reference background. Center a compact logo lockup: emblem above, exact text "CepDesk" underneath in clean near-white bold rounded sans serif typography, C and D capitalized. Emblem about 52% of canvas width, wordmark about 46%, modest gap. Entire lockup centered vertically and horizontally with generous empty space around. Wordmark flat clean typography, NO 3D bevel on lettering. No loading indicator, no tagline, no extra words, no texture, no background gradient, no glow, no watermark. Smooth professional edges without any stray flecks. 1024x1024 production asset, not a mockup.

İkon bir önceki şeffaf simgeyi, açılış görseli ise son ikon görselini referans alarak üretildi. Aracın verdiği gerçek çıktı boyutu 1254 × 1254'tür.
