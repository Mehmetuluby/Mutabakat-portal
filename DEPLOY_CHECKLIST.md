# Canlıya Çıkış Checklist (Mobil Uyumsuz)

## 1) Firebase Proje
- Ayrı bir **prod** Firebase projesi oluşturun.
- Authentication > Sign-in method: Email/Password **Enabled**.
- Firestore Database oluşturun.
- Storage etkinleştirin (ek dosyalar için).

## 2) Web App Config
Firebase Console > Project settings > General > Your apps (Web)
- `firebase.js` içindeki config ile bu değerlerin aynı olduğundan emin olun.

## 3) Rules
Firebase Console > Firestore > Rules:
- `firestore.rules` içeriğini yapıştırın, Publish.

Firebase Console > Storage > Rules:
- `storage.rules` içeriğini yapıştırın, Publish.

## 4) Domain / API Key kısıtları
Google Cloud Console > APIs & Services > Credentials:
- API Key kısıtı varsa domaininizi whitelist'e ekleyin.

## 5) Smoke Test
- Login
- Kayıt oluşturma / güncelleme
- Ek dosya yükleme / silme
- Logout / tekrar login


## Yayın Sonrası (Önerilen)
- [ ] UI'da sürüm etiketini doğrula (v1.0.1)
- [ ] Geri bildirim akışını test et (Firestore: geriBildirimler)
- [ ] Firestore rules güncellendi mi kontrol et (geriBildirimler create-only)
