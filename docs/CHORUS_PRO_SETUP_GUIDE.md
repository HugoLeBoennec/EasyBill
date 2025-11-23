# Guide de configuration Chorus Pro pour EasyBill

Ce guide vous explique comment obtenir vos identifiants Chorus Pro et configurer la connexion dans EasyBill.

## Table des matières

1. [Prérequis](#prérequis)
2. [Création d'un compte Chorus Pro](#création-dun-compte-chorus-pro)
3. [Obtention des identifiants API](#obtention-des-identifiants-api)
4. [Configuration dans EasyBill](#configuration-dans-easybill)
5. [Test de la connexion](#test-de-la-connexion)
6. [Environnement de qualification vs production](#environnement-de-qualification-vs-production)
7. [Résolution des problèmes](#résolution-des-problèmes)

---

## Prérequis

Avant de commencer, assurez-vous d'avoir :

- ✅ Un numéro SIRET valide pour votre entreprise
- ✅ Une adresse email professionnelle
- ✅ Les informations légales de votre entreprise (raison sociale, adresse, etc.)

---

## Création d'un compte Chorus Pro

### 1. Accéder au portail Chorus Pro

**Environnement de qualification (test) :**
- URL : https://chorus-pro-qualif.aife.economie.gouv.fr/

**Environnement de production :**
- URL : https://chorus-pro.gouv.fr/

> 💡 **Conseil** : Commencez toujours par l'environnement de qualification pour tester votre intégration avant de passer en production.

### 2. Créer un compte

1. Cliquez sur **"S'inscrire"** ou **"Créer un compte"**
2. Choisissez le type de compte : **"Entreprise"**
3. Renseignez votre numéro SIRET
4. Complétez le formulaire d'inscription avec :
   - Raison sociale
   - Adresse de l'entreprise
   - Informations du contact principal
   - Adresse email (vous recevrez un email de confirmation)
5. Validez votre email en cliquant sur le lien reçu
6. Définissez votre mot de passe

### 3. Activer votre espace

1. Connectez-vous à votre compte
2. Complétez votre profil entreprise
3. Validez les conditions générales d'utilisation

---

## Obtention des identifiants API

### Option 1 : Via la plateforme PISTE (recommandé)

La plateforme PISTE (Plateforme d'Intégration des Services de Télé-déclaration pour les Entreprises) est le portail développeur officiel pour accéder aux API Chorus Pro.

#### 1. Accéder à PISTE

**Environnement de qualification :**
- URL : https://developer-qualif.aife.economie.gouv.fr/

**Environnement de production :**
- URL : https://developer.aife.economie.gouv.fr/

#### 2. Créer une application

1. Connectez-vous avec vos identifiants Chorus Pro
2. Accédez à la section **"Mes applications"**
3. Cliquez sur **"Créer une nouvelle application"**
4. Renseignez les informations :
   - **Nom de l'application** : `EasyBill` (ou le nom de votre choix)
   - **Description** : `Intégration EasyBill pour la facturation électronique`
   - **Type d'authentification** : `OAuth2 Client Credentials`
   - **URLs de callback** : Non nécessaire pour le flux Client Credentials
5. Sélectionnez les **permissions** (scopes) nécessaires :
   - `cpro.invoice.read` - Lecture des factures
   - `cpro.invoice.write` - Émission de factures
   - `cpro.invoice.status` - Consultation du statut

#### 3. Récupérer vos identifiants

Après la création de l'application, vous obtiendrez :

- **Client ID** : Identifiant public de votre application
  - Format : `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (UUID)
  - Exemple : `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

- **Client Secret** : Clé secrète (à conserver en sécurité)
  - Format : Chaîne alphanumérique longue
  - Exemple : `AbCdEf123456789GhIjKl987654321MnOpQr`

> ⚠️ **IMPORTANT** : Le Client Secret ne sera affiché qu'une seule fois. Copiez-le immédiatement dans un gestionnaire de mots de passe sécurisé. Si vous le perdez, vous devrez générer de nouveaux identifiants.

### Option 2 : Via le support Chorus Pro

Si vous ne pouvez pas accéder à PISTE, contactez le support :

1. Connectez-vous à Chorus Pro
2. Allez dans **"Contact / Support"**
3. Créez un ticket avec l'objet : **"Demande d'identifiants API pour intégration"**
4. Précisez :
   - Nom de votre entreprise et SIRET
   - Usage : Intégration avec EasyBill pour la facturation électronique
   - Environnement souhaité (qualification et/ou production)

Le support vous fournira vos identifiants sous 2-5 jours ouvrés.

---

## Configuration dans EasyBill

### 1. Ouvrir les paramètres de facturation électronique

1. Lancez EasyBill
2. Allez dans **Menu** → **Paramètres** → **Facturation électronique**
3. Activez l'option **"Activer la facturation électronique"**

### 2. Sélectionner Chorus Pro

1. Dans la section **"Plateforme"**, sélectionnez **"Chorus Pro"**
2. Choisissez l'**environnement** :
   - **Qualification** : Pour les tests
   - **Production** : Pour l'utilisation réelle

### 3. Renseigner vos identifiants

1. **Point de terminaison API** : L'URL est automatiquement remplie selon l'environnement :
   - Qualification : `https://api-qualif.piste.gouv.fr/cpro/v1`
   - Production : `https://api.piste.gouv.fr/cpro/v1`

2. **Client ID** : Collez l'identifiant client obtenu depuis PISTE
   - Exemple : `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

3. **Client Secret** : Collez la clé secrète
   - Exemple : `AbCdEf123456789GhIjKl987654321MnOpQr`

### 4. Configurer les options

- **Format par défaut** : Sélectionnez **Factur-X** (recommandé pour la France)
- **Envoi automatique** :
  - ☑️ Activé : Les factures sont envoyées automatiquement à Chorus Pro
  - ☐ Désactivé : Vous devrez confirmer manuellement chaque envoi
- **Mode hors ligne** :
  - ☑️ Activé : Les factures sont mises en file d'attente et envoyées quand la connexion est rétablie
  - ☐ Désactivé : Nécessite une connexion Internet pour émettre des factures

### 5. Enregistrer la configuration

1. Cliquez sur **"Sauvegarder"**
2. Les identifiants sont stockés de manière sécurisée et chiffrée localement

---

## Test de la connexion

### 1. Tester la connexion API

1. Dans les paramètres de facturation électronique
2. Cliquez sur le bouton **"Tester la connexion"**
3. Attendez quelques secondes

**Résultats possibles :**

- ✅ **Connexion réussie** : Vos identifiants sont valides
- ❌ **Échec de la connexion** : Vérifiez vos identifiants et votre connexion Internet

### 2. Émettre une facture de test

1. Créez une nouvelle facture dans EasyBill
2. Remplissez tous les champs obligatoires :
   - Informations client (SIRET requis pour les clients français)
   - Lignes de facturation
   - Montants et TVA
3. Enregistrez la facture
4. Cliquez sur **"Envoyer à Chorus Pro"**
5. Vérifiez le statut dans l'interface Chorus Pro

---

## Environnement de qualification vs production

### Environnement de qualification (test)

**À utiliser pour :**
- Tests d'intégration
- Formation des utilisateurs
- Validation du bon fonctionnement avant la mise en production

**Caractéristiques :**
- Données non réelles
- Aucune valeur légale
- Peut être réinitialisé périodiquement
- Gratuit

**URLs :**
- Portail : https://chorus-pro-qualif.aife.economie.gouv.fr/
- API : https://api-qualif.piste.gouv.fr/cpro/v1
- PISTE : https://developer-qualif.aife.economie.gouv.fr/

### Environnement de production

**À utiliser pour :**
- Émission réelle de factures conformes
- Conformité légale à partir du 1er septembre 2026

**Caractéristiques :**
- Données réelles et juridiquement valables
- Archivage légal des factures
- Traçabilité complète
- Gratuit

**URLs :**
- Portail : https://chorus-pro.gouv.fr/
- API : https://api.piste.gouv.fr/cpro/v1
- PISTE : https://developer.aife.economie.gouv.fr/

> ⚠️ **IMPORTANT** : Vous devez créer des comptes et des applications séparés pour chaque environnement. Les identifiants de qualification ne fonctionnent pas en production et vice-versa.

---

## Résolution des problèmes

### Erreur : "Invalid client credentials"

**Cause** : Client ID ou Client Secret incorrect

**Solutions :**
1. Vérifiez que vous avez bien copié les identifiants complets (pas de caractères manquants)
2. Assurez-vous d'utiliser les identifiants du bon environnement (qualification ou production)
3. Vérifiez qu'il n'y a pas d'espaces avant ou après les identifiants
4. Si le problème persiste, régénérez de nouveaux identifiants depuis PISTE

### Erreur : "Connection timeout"

**Cause** : Problème de connexion réseau

**Solutions :**
1. Vérifiez votre connexion Internet
2. Vérifiez que votre pare-feu autorise les connexions HTTPS sortantes
3. Si vous êtes derrière un proxy d'entreprise, configurez-le dans EasyBill

### Erreur : "Insufficient permissions"

**Cause** : Votre application n'a pas les permissions (scopes) nécessaires

**Solutions :**
1. Retournez dans PISTE → Mes applications
2. Modifiez votre application
3. Ajoutez les scopes requis :
   - `cpro.invoice.read`
   - `cpro.invoice.write`
   - `cpro.invoice.status`
4. Sauvegardez et testez à nouveau

### Erreur : "Invalid SIRET"

**Cause** : Le SIRET du client est manquant ou invalide

**Solutions :**
1. Vérifiez que le SIRET du client comporte bien 14 chiffres
2. Utilisez l'annuaire des entreprises pour vérifier : https://annuaire-entreprises.data.gouv.fr/
3. Pour les factures B2B en France, le SIRET est obligatoire

### L'envoi de facture échoue en production mais fonctionne en qualification

**Cause** : Votre compte de production n'est pas complètement activé

**Solutions :**
1. Connectez-vous à Chorus Pro en production
2. Vérifiez que votre profil entreprise est complet
3. Vérifiez que votre compte est bien validé (email, SIRET)
4. Contactez le support si nécessaire

---

## Support et ressources

### Documentation officielle

- **Guide utilisateur Chorus Pro** : https://chorus-pro.gouv.fr/documentation
- **Documentation API PISTE** : https://developer.aife.economie.gouv.fr/documentation
- **Communauté Chorus Pro** : https://communaute.chorus-pro.gouv.fr/

### Contacts

**Support Chorus Pro :**
- Email : support.chorus-pro@finances.gouv.fr
- Téléphone : 0 806 06 12 77 (gratuit depuis un poste fixe)
- Horaires : 9h-18h du lundi au vendredi

**Support EasyBill :**
- Consultez la documentation de l'application
- Ouvrez une issue sur le dépôt GitHub du projet

---

## Conformité et obligations légales

### Dates clés

- **1er septembre 2026** :
  - Toutes les entreprises doivent pouvoir **recevoir** des factures électroniques
  - Les grandes entreprises et ETI doivent **émettre** des factures électroniques

- **1er septembre 2027** :
  - Les PME et micro-entreprises doivent **émettre** des factures électroniques

### Formats acceptés

Les trois formats conformes à la norme EN16931 :

1. **Factur-X** (recommandé) : PDF/A-3 avec XML embarqué
2. **UBL** : Format XML pur (standard OASIS)
3. **CII** : Format XML pur (UN/CEFACT)

---

## Checklist de configuration

Avant de passer en production, vérifiez que :

- [ ] Vous avez créé un compte Chorus Pro de production
- [ ] Vous avez obtenu vos identifiants API (Client ID et Client Secret)
- [ ] Vous avez configuré EasyBill avec ces identifiants
- [ ] Le test de connexion est réussi
- [ ] Vous avez émis et reçu au moins une facture de test en qualification
- [ ] Votre profil entreprise est complet (SIRET, adresse, etc.)
- [ ] Vous avez choisi le format de facture adapté (Factur-X recommandé)
- [ ] Vous comprenez la différence entre envoi automatique et manuel
- [ ] Vous avez sauvegardé vos identifiants dans un gestionnaire de mots de passe

---

**Dernière mise à jour** : Novembre 2025
**Version** : 1.0

Pour toute question ou suggestion d'amélioration de ce guide, n'hésitez pas à contacter le support.
