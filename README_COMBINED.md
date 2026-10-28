# Mutabakat Portal + Mail Digest Functions (Combined)

Bu paket, `mutabakat_portal_detay_sabit_v1.0.5` web arayüzünü ve
`mutabakat_mail_digest_functions` (Firebase Cloud Functions + Nodemailer) mail gönderimini tek projede birleştirir.

## Klasör Yapısı
- `/` : Hosting (HTML/CSS/JS)
- `/functions` : Cloud Functions (mail digest)

## Kurulum
1. Firebase projesi seçin / oluşturun
2. Bu klasörde:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add
   ```
   `.firebaserc` içindeki `YOUR_FIREBASE_PROJECT_ID` yerine proje id'nizi yazabilirsiniz.
3. Functions bağımlılıklarını kurun:
   ```bash
   cd functions
   npm install
   cd ..
   ```

## SMTP Config (ZORUNLU)
Mail gidebilmesi için functions config set etmelisiniz:

```bash
firebase functions:config:set   smtp.host="SMTP_HOST"   smtp.port="587"   smtp.secure="false"   smtp.user="SMTP_USER"   smtp.pass="SMTP_PASS"   smtp.from="Mutabakat <noreply@domain.com>"
```

> **Not:** Port 465 ise `smtp.secure="true"` kullanın.

Config'i görmek için:
```bash
firebase functions:config:get
```

## Deploy
```bash
firebase deploy
```

Sadece functions:
```bash
firebase deploy --only functions
```

Sadece hosting:
```bash
firebase deploy --only hosting
```

## Local Test
```bash
firebase emulators:start
```

## Sorun Giderme
- Mail gitmiyorsa önce logs:
  ```bash
  firebase functions:log
  ```
- SMTP bilgileri eksikse `Missing SMTP config...` hatası görürsünüz.
- SMTP sağlayıcınız 2FA/uygulama şifresi istiyor olabilir.

