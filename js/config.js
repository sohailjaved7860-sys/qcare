/* QCare site settings. This file is public: never put a secret here.
   supabaseUrl + supabaseKey: from Supabase > Project Settings > API.
   Use the PUBLISHABLE (or legacy "anon") key ONLY. Never the secret / service_role key.
   Leave both empty and the site still works, sending orders to WhatsApp without saving them. */
window.QCARE = {
  supabaseUrl: "",
  supabaseKey: "",

  wa: "917977680290",                 // WhatsApp number, country code first, digits only
  phone: "+91 79776 80290",
  email: "Support@qcare.in",
  address: "Room No. 205, Gauri Suman Apt, Opp. Prakash Photo Studio, Kalwa, Thane West – 400605",
  ig: "https://www.instagram.com/qcarecandles",
  fb: "",
  gmb: "https://share.google/tVYJMkjYh8guSN7fn",
  sizeText: "41 ml jar · 20 g"        // shown under each candle name
};
