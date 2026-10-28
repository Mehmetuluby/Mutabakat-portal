# Mutabakat Portal - Mail Digest (1 dk)

Bu paket Firebase Cloud Functions içerir.

## Ne yapar?
- `bildirimler/{id}` koleksiyonuna yeni kayıt eklenince `mailQueue` koleksiyonuna **pending** kayıt yazar.
- Scheduler her **1 dakikada bir** çalışır, pending kayıtları **cikisDepo (çıkış şubesi)** bazlı gruplar ve her şube için **tek bir özet mail** gönderir.
- Gönderilen queue kayıtlarını `sent` olarak işaretler.

## Kurulum
1) Proje kökünde bu `functions/` klasörünü oluştur veya mevcut `functions/` klasörünün içine kopyala.
2) Bağımlılıklar:
```bash
cd functions
npm install
```

3) SMTP config (Gmail örneği):
```bash
firebase functions:config:set smtp.host="smtp.gmail.com" \
  smtp.port="587" smtp.secure="false" \
  smtp.user="YOUR@gmail.com" smtp.pass="APP_PASSWORD" \
  smtp.from="YOUR@gmail.com"
```

4) Deploy:
```bash
firebase deploy --only functions
```

## 30 dk yapmak
`functions/index.js` içindeki schedule satırını değiştir:
- `"every 1 minutes"` -> `"every 30 minutes"`
