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
  bucket: "photos"
};
