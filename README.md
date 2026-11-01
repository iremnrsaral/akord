# AkordEval - Akıllı Açık Uçlu Sınav & Rubrik Değerlendirme Sistemi

Dünya genelinde yükseköğretim kurumları ve K-12 okulları açık uçlu sınavların değerlendirilmesinde ciddi iş gücü ve zaman kaybetmektedir. Mevcut çözümler (**Turnitin**, **Gradescope**) yalnızca kopyalama veya basit optik/yüzeysel kümeleme yapar; **kişiselleştirilmiş, kanıt odaklı ve rubriğe dayalı anlık geri bildirim veremez.**

**AkordEval**, öğretmenin değerlendirme ölçütlerini (rubrik), zorunlu kavramlarını ve örnek değerlendirmelerini (few-shot) temel alan, öğrencinin yanıtı farklı kelimelerle ifade edilse bile **anlamsal denkliği (paraphrasing)** analiz eden ve **öğretmen onaylamadan asla resmi nota dönüşmeyen** yeni nesil bir değerlendirme platformudur.

---

## 🌟 Temel Yetenekler & Özellikler

1. **Öğretmen Tarafından Tanımlanan Rubrik & Ölçüt Yapısı**
   - Her soru için çok boyutlu rubrik kriterleri, maksimum puanlar ve detaylı ölçüt açıklamaları.
   - Soru ve kazanım bazlı ağırlıklandırma.

2. **Zorunlu / Beklenen Anlam Öbekleri (Anlamsal Denklik - Paraphrasing Engine)**
   - Öğretmenin *"Bu cümleyi / kavramı mutlaka yazmalı"* dediği durumlar için akıllı anlamsal analiz.
   - Öğrenci ezber cümleler yerine kendi kelimelerini, eş anlamlı sözcükleri veya farklı cümle yapılarını kullansa dahi anlam doğruysa tam puan verilir.

3. **Örnek Değerlendirmeler (Few-Shot Exemplars)**
   - Öğretmen sisteme tam puan alan örnek yanıtları veya sık yapılan tipik kavram yanılgılarını yükleyebilir.
   - Yapay zeka bu örnekleri referans alarak sınıf genelinde tutarlı ve adil bir puanlama yapar.

4. **Kanıt Odaklı Metin İçi Vurgulama (Evidence Highlighter)**
   - Öğrencinin metninden doğrudan cümleler cımbızlanır:
     - 🟩 **Yeşil:** Rubrik ölçütünü tam karşılayan, anlamı doğrulanmış ifadeler.
     - 🟨 **Sarı:** Kısmen karşılanan veya eksik bırakılan basamaklar.
     - 🟥 **Kırmızı:** Bilimsel hata veya kavram yanılgısı tespit edilen kısımlar.

5. **Yapay Zekanın Öğretmene Gerekçeli Raporu (Teacher Diagnosis)**
   - *"Neden bu puan önerildi?"*
   - *"Öğrencinin güçlü olduğu yönler neler?"*
   - *"Metinde neresi eksik veya nerede yanılgıya düşülmüş?"* sorularının yanıtı maddeler halinde öğretmene sunulur.

6. **Öğretmen Onay Döngüsü (Human-in-the-Loop Approval Gate)**
   - **Kritik İlke:** Yapay zekanın önerdiği puan yalnızca **TASLAK (DRAFT)** niteliğindedir.
   - Öğretmen incelemeden, isterse puanı revize etmeden ve **"Onayla"** butonuna basmadan öğrenci portalına veya not kütüğüne **asla** işlenmez.

7. **LMS & Dışa Aktarım Desteği (Integration Ready)**
   - Canvas, Moodle, Google Classroom ve Blackboard uyumlu CSV ve JSON not dökümü formatları.

---

## 📊 Karşılaştırma Tablosu

| Özellik | Turnitin | Gradescope | AkordEval |
| :--- | :--- | :--- | :--- |
| **Temel Odak** | İntihal / Benzerlik | Optik / Grup Kümeleme | Rubrik & Anlamsal Analiz |
| **Paraphrasing (Eş Anlam)** | ✕ Yok (Metin eşleşmesi) | ✕ Yok (Manuel okuma) | **✓ Var (Anlamsal denklik tespiti)** |
| **Metin İçi Kanıt Vurgusu** | Sadece web kaynak linki | Yok | **✓ Cümle bazlı ölçüt & hata eşleştirme** |
| **Gerekçelendirilmiş Teşhis** | ✕ Yok | ✕ Yok | **✓ Öğretmene ölçüt ölçüt açıklar** |
| **Öğretmen Onay Kapısı** | Pasif rapor | Manuel giriş | **✓ Onaylanmadan notlaşmayan akıllı iş akışı** |
| **Kişiselleştirilmiş Geri Bildirim** | ✕ Yok | ✕ Yok | **✓ Her öğrenciye özel yapıcı taslak** |

---

## 🚀 Kurulum ve Çalıştırma

Uygulama sıfır harici paket bağımlılığıyla doğrudan saf **Node.js (v18+)** ve modern web teknolojileri ile geliştirilmiştir.

### 1. Sunucuyu Başlatma
```bash
# Proje dizininde:
node server.js
```
Konsolda şu çıktıyı göreceksiniz:
```
🚀 AkordEval Sunucusu Başarıyla Başlatıldı!
📡 URL: http://localhost:3000
📚 Hazır Senaryolar: Biyoloji, Bilgisayar Müh., Tarih
```

### 2. Tarayıcıda Açma
Tarayıcınızda şu adresi açın:
```
http://localhost:3000
```

---

## 📁 Proje Yapısı

```
c:\akord\
├── package.json          # Proje yapılandırması
├── server.js             # Node.js REST API & Anlamsal Analiz Motoru
├── data/
│   └── database.json     # Hazır sınavlar, rubrikler ve öğrenci yanıtları veritabanı
├── public/
│   ├── index.html        # Modern öğretmen onay masası ve arayüz
│   ├── app.js            # Vue 3 reaktif mantık & API istemcisi
│   └── styles.css        # Kanıt vurgulama ve özel stiller
└── README.md             # Dokümantasyon
```

---

## 💡 Hazır Örnek Senaryolar

Uygulama açıldığında 3 zengin akademik senaryo hazır olarak gelir:
1. **Biyoloji 101:** Fotosentez Mekanizması, ATP & NADPH Döngüsü (4 farklı öğrenci yanıtı: Tam puan alan paraphrase örneği, NADPH eksik kısmi yanıt, 'gece olur' kavram yanılgısı içeren yanıt ve aşırı yüzeysel yanıt).
2. **Bilgisayar Mühendisliği:** Nesne Yönelimli Programlamada Polimorfizm, Overloading vs. Overriding ve Late Binding.
3. **Tarih:** Sanayi Devrimi'nin İşçi Sınıfı ve Kentleşme Üzerindeki Etkileri.

Dilediğiniz zaman **"+ Yeni Sınav Tanımla"** butonuyla kendi dersinizi ve rubriğinizi ekleyebilir, **"Canlı Yanıt Analiz Et"** sekmesinden dilediğiniz yanıtı anında test edebilirsiniz!
