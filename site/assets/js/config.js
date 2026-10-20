// Site configuration. Keys here are public by design (browser keys);
// restrict the Google Maps key to the site's domain in Google Cloud Console.
window.BEESTRAW_CONFIG = {
  // Leave empty to use the built-in preview map.
  googleMapsApiKey: "",
  // Supabase project (Settings → API). The anon key is meant to be public; row level security protects the data.
  // Leave empty to run in preview mode (no accounts, nothing saved).
  supabaseUrl: "",
  supabaseAnonKey: "",
  // Open-Meteo historical weather (free for non-commercial use).
  weatherApi: "https://archive-api.open-meteo.com/v1/archive",
  geocodeApi: "https://geocoding-api.open-meteo.com/v1/search",
  weatherYears: 5
};
