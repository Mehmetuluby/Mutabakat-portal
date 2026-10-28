Mutabakat Portalı (Koleksiyon Bazlı Sürüm)

- Eski tek doküman: mutabakatState/global-v1 KULLANILMAZ.
- Yeni koleksiyonlar:
  - bildirimler/{id}
  - silinenBildirimler/{id}

Not: Firestore koleksiyonları ilk yazma ile otomatik oluşur.

Çalıştırma:
- Klasörü bir web sunucusunda açın (örn. VSCode Live Server).


=== EK DOSYA (Storage) ===
- Yeni bildirim formunda birden fazla dosya seçilebilir (foto/PDF/Excel).
- Dosyalar Firebase Storage'a 'mutabakatEkler/{kayitId}/{fileId}/{filename}' altında yüklenir.
- Firestore kaydında ekDosyalar[] içine url ve storagePath alanları yazılır.
- Detay ekranında ekler "İndir" butonu ile indirilir (Edge tracking prevention sorununu aşar).
- Sadece eki yükleyen kişi silebilir.
- Sadece ilgili şube (kaydın şubesi veya çıkış deposu) ve Merkez rolü indirebilir.

Ek koleksiyonlar:
- users/{uid}: giriş yapan kullanıcının role/sube bilgisini tutar (rules için kullanılır).
- ekler/{fileId}: her ekin ownerUid ve allowedSubes bilgisini tutar (rules için kullanılır).

Önerilen Storage Rules (yetkili indir + sadece ekleyen silebilsin):

Not:
- users/{uid} dokümanında örnek alanlar: role: "sube" | "merkez", sube: "Merkez Malkabu" gibi.
- Bu sürümde Storage okuma yetkisi, race-condition olmaması için Storage customMetadata üzerinden kontrol edilir.
  (ownerUid + allowedSubes)

rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    function userDoc() {
      return get(/databases/(default)/documents/users/$(request.auth.uid)).data;
    }
    // allowedSubes metadata içinde virgüllü tutulur: "ŞubeA,ŞubeB"
    function subeAllowed() {
      return resource.metadata.allowedSubes.matches('(^|,)' + userDoc().sube + '(,|$)');
    }

    match /mutabakatEkler/{kayitId}/{fileId}/{filename} {
      // Upload: login olan herkes ilk kez yazabilir
      allow write: if request.auth != null && resource == null;

      // Delete: sadece owner
      allow write: if request.auth != null
                   && request.resource == null
                   && resource.metadata.ownerUid == request.auth.uid;

      // Read: owner OR merkez OR allowedSube
      allow read: if request.auth != null && (
        resource.metadata.ownerUid == request.auth.uid ||
        userDoc().role == 'merkez' ||
        subeAllowed()
      );
    }
  }
}

Önerilen Firestore Rules (ekler/users koleksiyonları için):

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /bildirimler/{id} {
      allow read, create, update: if request.auth != null;
      allow delete: if false;
    }
    match /silinenBildirimler/{id} {
      allow read, create: if request.auth != null;
      allow delete: if false;
    }
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /ekler/{fileId} {
      allow create: if request.auth != null && request.resource.data.ownerUid == request.auth.uid;
      allow delete: if request.auth != null && resource.data.ownerUid == request.auth.uid;
      allow read: if request.auth != null;
      allow update: if request.auth != null && resource.data.ownerUid == request.auth.uid;
    }
  }
}
