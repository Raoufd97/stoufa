// Réglages de connexion à Supabase.
// Remplace les 3 valeurs ci-dessous (Supabase > Project Settings > API).
// La clé "anon" est faite pour être publique : la sécurité vient du mot de passe
// et des règles définies dans supabase/schema.sql.
window.STOUFA_CONFIG = {
  supabaseUrl: "https://saykburiasccirieohni.supabase.co",
  supabaseAnonKey: "sb_publishable_mhMy7tLRYfz1F57Oy8P53Q_ERbB-uWY",
  // Compte unique de la boutique (créé dans Supabase > Authentication > Users).
  // Le mot de passe de ce compte = le code d'accès demandé à l'ouverture.
  email: "douihechraouf@gmail.com",
  bucket: "photos",

  // Infos affichées sur la vitrine publique (catalogue/)
  boutique: {
    nom: "Atelier Mustapha Attia",
    ville: "Ezzahra",
    adresse: "Rue 14 Janvier, Ezzahra Nakhil",                 // ex. "12 rue …, Ezzahra"
    whatsapp: "21625435170",                // numéro au format international sans + ni espaces, ex. "21698123456"
    telephone: "+216 25 435 170",               // ex. "+216 98 123 456"
    horaires: "",                // ex. "Lun–Sam · 8h30–13h et 15h–19h"
    googleMaps: "https://share.google/T34OQE5KIK73OZ6LB"             // lien « Partager » de la fiche Google Maps
  }
};
